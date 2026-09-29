import { getDatabase } from "@/lib/cloudflare";
import { recordAuditEvent } from "@/lib/db/audit";
import type { GlobalRole } from "@/lib/auth/types";

// Who may use the Hub, decided by a person and kept apart from whether CAP says they are a member.
//
// The distinction this file exists to hold: being in TN-170 is a fact about somebody, and being allowed into
// this application is a decision about them. CAPWATCH will own the first and must never touch the second.
// Nothing here reads or writes membership, and the import - when it arrives - has no path into this table.
//
// Keyed by CAPID throughout. Addresses change, names come back from three systems in three spellings, and
// people marry; the CAPID is the one thing that stays still.

export type AccessStatus = "NOT_CONFIGURED" | "AUTHORIZED" | "RESTRICTED";

export interface MemberAccess {
  capid: string;
  fullName: string;
  rank: string | null;
  memberType: string;
  /** What CAP says. Source of truth today is the hand-entered roster; CAPWATCH later. */
  capMembership: string;
  capSource: string;
  status: AccessStatus;
  loginEmail: string | null;
  /** The address CAP issues, kept for contact rather than for signing in. */
  capEmail: string | null;
  userId: string | null;
  role: GlobalRole | null;
  grantedAt: string | null;
  restrictedAt: string | null;
  lastSeenAt: string | null;
}

/**
 * Who may change another member's access.
 *
 * Deliberately the same people who can already approve accounts, because this replaces that job rather than
 * adding a second one beside it. Widening it later is easy; narrowing it after somebody has been using it is
 * not.
 */
export function canManageAccess(role: GlobalRole): boolean {
  return role === "SYSTEM_OWNER" || role === "ACCOUNT_APPROVER";
}

/** Changing who the squadron's own administrators are stays with the owners. */
export function canSetRole(actor: GlobalRole, target: GlobalRole): boolean {
  if (actor === "SYSTEM_OWNER") return true;
  // An approver may admit and restrict ordinary members, but may not make or unmake an owner.
  return canManageAccess(actor) && target !== "SYSTEM_OWNER";
}

export interface MemberFilter {
  /** Matches name, CAPID or any known address. */
  search?: string;
  status?: AccessStatus;
  missingLoginEmail?: boolean;
  capMembership?: "ACTIVE" | "INACTIVE";
  memberType?: "SENIOR" | "CADET";
}

/**
 * Every member, with the access decision beside the CAP facts.
 *
 * A member with no row in member_access reads as NOT_CONFIGURED rather than as missing: not having decided
 * about somebody is a real and common state, and the list should show it as one.
 */
export async function listMembers(filter: MemberFilter = {}): Promise<MemberAccess[]> {
  const where: string[] = [];
  const binds: unknown[] = [];

  if (filter.memberType) {
    where.push("p.member_type = ?");
    binds.push(filter.memberType);
  }
  if (filter.capMembership === "ACTIVE") where.push("p.status = 'ACTIVE'");
  if (filter.capMembership === "INACTIVE") where.push("p.status <> 'ACTIVE'");

  if (filter.status) {
    where.push(filter.status === "NOT_CONFIGURED"
      ? "COALESCE(a.status, 'NOT_CONFIGURED') = 'NOT_CONFIGURED'"
      : "a.status = ?");
    if (filter.status !== "NOT_CONFIGURED") binds.push(filter.status);
  }
  if (filter.missingLoginEmail) where.push("(a.login_email IS NULL OR a.login_email = '')");

  if (filter.search) {
    const like = "%" + filter.search.trim().toLowerCase() + "%";
    where.push(
      "(lower(p.full_name) LIKE ? OR p.capid LIKE ? OR lower(COALESCE(a.login_email,'')) LIKE ? " +
      "OR EXISTS (SELECT 1 FROM member_email_links e WHERE e.capid = p.capid AND lower(e.email) LIKE ?))"
    );
    binds.push(like, like, like, like);
  }

  const sql =
    "SELECT p.capid, p.full_name, p.rank, p.member_type, p.status AS cap_membership, " +
    "  COALESCE(p.source, 'MANUAL') AS cap_source, " +
    "  COALESCE(a.status, 'NOT_CONFIGURED') AS status, a.login_email, a.user_id, " +
    "  a.granted_at, a.restricted_at, u.global_role, " +
    "  (SELECT e.email FROM member_email_links e WHERE e.capid = p.capid AND e.kind = 'CAP' LIMIT 1) AS cap_email, " +
    "  (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = a.user_id) AS last_seen_at " +
    "FROM personnel_members p " +
    "LEFT JOIN member_access a ON a.capid = p.capid " +
    "LEFT JOIN users u ON u.id = a.user_id " +
    "WHERE p.capid IS NOT NULL" +
    (where.length ? " AND " + where.join(" AND ") : "") +
    " ORDER BY p.full_name COLLATE NOCASE";

  try {
    const rows = await getDatabase().prepare(sql).bind(...binds).all<{
      capid: string; full_name: string; rank: string | null; member_type: string;
      cap_membership: string; cap_source: string; status: string; login_email: string | null;
      user_id: string | null; granted_at: string | null; restricted_at: string | null;
      global_role: string | null; cap_email: string | null; last_seen_at: string | null;
    }>();

    return rows.results.map((row) => ({
      capid: row.capid,
      fullName: row.full_name,
      rank: row.rank,
      memberType: row.member_type,
      capMembership: row.cap_membership,
      capSource: row.cap_source,
      status: (row.status as AccessStatus) ?? "NOT_CONFIGURED",
      loginEmail: row.login_email,
      capEmail: row.cap_email,
      userId: row.user_id,
      role: (row.global_role as GlobalRole | null) ?? null,
      grantedAt: row.granted_at,
      restrictedAt: row.restricted_at,
      lastSeenAt: row.last_seen_at
    }));
  } catch (error) {
    console.error(error);
    return [];
  }
}

async function ensureRow(capid: string): Promise<void> {
  const now = new Date().toISOString();
  await getDatabase()
    .prepare(
      "INSERT INTO member_access (capid, status, source, created_at, updated_at) " +
      "VALUES (?, 'NOT_CONFIGURED', 'ADMIN', ?, ?) ON CONFLICT(capid) DO NOTHING"
    )
    .bind(capid, now, now)
    .run();
}

/**
 * Records the address a member will sign in with.
 *
 * Setting an address does not admit anybody. That is the whole point of keeping the two apart: an
 * administrator can write down how to reach somebody without that being a decision to let them in, and
 * granting access is then a deliberate second act rather than a side effect of typing an email.
 */
export async function setLoginEmail(input: {
  capid: string;
  email: string | null;
  actorId: string;
  actorName: string;
}): Promise<{ ok: boolean; message: string }> {
  const email = input.email?.trim().toLowerCase() || null;
  if (email && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    return { ok: false, message: "That does not look like an email address." };
  }

  await ensureRow(input.capid);
  const db = getDatabase();

  const before = await db
    .prepare("SELECT login_email FROM member_access WHERE capid = ?")
    .bind(input.capid)
    .first<{ login_email: string | null }>();

  if (email) {
    // Someone else holding this address means the Hub cannot answer "who is this?", so it refuses rather
    // than guessing. It usually means the same person is on the list twice and wants merging, not that two
    // people share a mailbox.
    const taken = await db
      .prepare("SELECT capid FROM member_access WHERE login_email = ? AND capid <> ?")
      .bind(email, input.capid)
      .first<{ capid: string }>();
    if (taken) {
      return { ok: false, message: "That address is already the login for CAPID " + taken.capid + "." };
    }
  }

  const now = new Date().toISOString();
  await db
    .prepare("UPDATE member_access SET login_email = ?, updated_at = ? WHERE capid = ?")
    .bind(email, now, input.capid)
    .run();

  // Kept in the address book too, which is where the rest of the Hub looks for how to reach somebody.
  if (email) {
    await db
      .prepare(
        "INSERT INTO member_email_links (email, capid, linked_by, created_at, kind, source, notify) " +
        "VALUES (?, ?, ?, ?, 'PERSONAL', 'MANUAL', 1) " +
        "ON CONFLICT(email) DO UPDATE SET capid = excluded.capid, kind = 'PERSONAL'"
      )
      .bind(email, input.capid, input.actorId, now)
      .run();
  }

  await recordAuditEvent({
    actorUserId: input.actorId,
    action: "MEMBER_LOGIN_EMAIL_CHANGED",
    entityType: "member",
    entityId: input.capid,
    summary: input.actorName + (email
      ? " set the Hub login address for CAPID " + input.capid
      : " removed the Hub login address for CAPID " + input.capid),
    // The addresses are the point of the record; there is no secret here, and without them the entry
    // cannot answer what it was changed from.
    metadata: { capid: input.capid, from: before?.login_email ?? null, to: email }
  });

  return { ok: true, message: email ? "Login address saved. This does not grant access." : "Login address removed." };
}

/** Admits a member. Requires an address to admit them at, because access without an identity is meaningless. */
export async function grantAccess(input: {
  capid: string;
  actorId: string;
  actorName: string;
}): Promise<{ ok: boolean; message: string }> {
  await ensureRow(input.capid);
  const db = getDatabase();

  const row = await db
    .prepare("SELECT login_email, status FROM member_access WHERE capid = ?")
    .bind(input.capid)
    .first<{ login_email: string | null; status: string }>();

  if (!row?.login_email) {
    return { ok: false, message: "Add a personal login address for this member first." };
  }

  const now = new Date().toISOString();
  await db
    .prepare(
      "UPDATE member_access SET status = 'AUTHORIZED', granted_at = ?, granted_by = ?, " +
      "restricted_at = NULL, restricted_by = NULL, source = 'ADMIN', updated_at = ? WHERE capid = ?"
    )
    .bind(now, input.actorId, now, input.capid)
    .run();

  await recordAuditEvent({
    actorUserId: input.actorId,
    action: "MEMBER_ACCESS_GRANTED",
    entityType: "member",
    entityId: input.capid,
    summary: input.actorName + " granted Hub access to CAPID " + input.capid,
    metadata: { capid: input.capid, loginEmail: row.login_email, previous: row.status }
  });

  return { ok: true, message: "Access granted." };
}

/**
 * Stops a member getting in, and changes nothing else about them.
 *
 * Their work, their comments, their duty history and every audit entry stay exactly where they are. This is
 * a door, not an eraser: somebody who has left the squadron still did the things they did, and a record that
 * quietly loses them is worse than useless when anybody asks what happened.
 */
export async function restrictAccess(input: {
  capid: string;
  actorId: string;
  actorName: string;
  reason?: string | null;
}): Promise<{ ok: boolean; message: string }> {
  await ensureRow(input.capid);
  const db = getDatabase();
  const now = new Date().toISOString();

  const row = await db
    .prepare("SELECT status, login_email, user_id FROM member_access WHERE capid = ?")
    .bind(input.capid)
    .first<{ status: string; login_email: string | null; user_id: string | null }>();

  await db
    .prepare(
      "UPDATE member_access SET status = 'RESTRICTED', restricted_at = ?, restricted_by = ?, " +
      "note = COALESCE(?, note), source = 'ADMIN', updated_at = ? WHERE capid = ?"
    )
    .bind(now, input.actorId, input.reason ?? null, now, input.capid)
    .run();

  await recordAuditEvent({
    actorUserId: input.actorId,
    action: "MEMBER_ACCESS_RESTRICTED",
    entityType: "member",
    entityId: input.capid,
    summary: input.actorName + " restricted Hub access for CAPID " + input.capid,
    metadata: { capid: input.capid, previous: row?.status ?? null, reason: input.reason ?? null }
  });

  return { ok: true, message: "Access restricted. The member's records and history are unchanged." };
}

/**
 * What the Hub thinks of one address, for the identity check to come.
 *
 * Written now, and deliberately not wired into signing in yet. Stage 2 will call this after Cloudflare has
 * said who somebody is; until then it exists so the rule can be tested on its own, away from a login flow
 * that nine people depend on this week.
 */
export async function accessForEmail(email: string): Promise<{
  capid: string;
  status: AccessStatus;
  userId: string | null;
} | null> {
  const wanted = email.trim().toLowerCase();
  if (!wanted) return null;
  try {
    const row = await getDatabase()
      .prepare("SELECT capid, status, user_id FROM member_access WHERE login_email = ?")
      .bind(wanted)
      .first<{ capid: string; status: string; user_id: string | null }>();
    if (!row) return null;
    return { capid: row.capid, status: row.status as AccessStatus, userId: row.user_id };
  } catch {
    return null;
  }
}

/** True only for a member an administrator has admitted. Anything else, including unknown, is false. */
export async function mayEnter(email: string): Promise<boolean> {
  const found = await accessForEmail(email);
  return found?.status === "AUTHORIZED";
}
