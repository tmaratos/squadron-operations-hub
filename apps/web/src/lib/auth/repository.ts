import { getCloudflareEnv, getDatabase } from "@/lib/cloudflare";
import type { AccessRequestRecord, AuthenticatedUser, GlobalRole, UserRecord, UserStatus } from "./types";

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  capid: string | null;
  duty_title: string | null;
  status: UserStatus;
  global_role: GlobalRole;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  approved_by: string | null;
  suspended_at: string | null;
  suspended_by: string | null;
}

interface AccessRequestRow {
  id: string;
  email: string;
  full_name: string;
  capid: string | null;
  duty_title: string | null;
  note: string | null;
  status: AccessRequestRecord["status"];
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const row = await getDatabase()
    .prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE LIMIT 1")
    .bind(email.trim().toLowerCase())
    .first<UserRow>();
  return row ? mapUser(row) : null;
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const row = await getDatabase().prepare("SELECT * FROM users WHERE id = ? LIMIT 1").bind(id).first<UserRow>();
  return row ? mapUser(row) : null;
}

export async function listUsers(): Promise<UserRecord[]> {
  const result = await getDatabase()
    .prepare("SELECT * FROM users ORDER BY full_name COLLATE NOCASE ASC")
    .all<UserRow>();
  return result.results.map(mapUser);
}

export async function listPendingAccessRequests(): Promise<AccessRequestRecord[]> {
  const result = await getDatabase()
    .prepare("SELECT * FROM access_requests WHERE status = 'PENDING' ORDER BY requested_at ASC")
    .all<AccessRequestRow>();
  return result.results.map(mapAccessRequest);
}

export async function findAccessRequestById(id: string): Promise<AccessRequestRecord | null> {
  const row = await getDatabase()
    .prepare("SELECT * FROM access_requests WHERE id = ? LIMIT 1")
    .bind(id)
    .first<AccessRequestRow>();
  return row ? mapAccessRequest(row) : null;
}

export async function createAccessRequest(input: {
  email: string;
  fullName: string;
  capid?: string;
  dutyTitle?: string;
  note?: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await getDatabase()
    .prepare(
      `INSERT OR IGNORE INTO access_requests (
        id, email, full_name, capid, duty_title, note, status, requested_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)`
    )
    .bind(
      id,
      input.email.trim().toLowerCase(),
      input.fullName.trim(),
      input.capid?.trim() || null,
      input.dutyTitle?.trim() || null,
      input.note?.trim() || null,
      now
    )
    .run();
  const pending = await getDatabase()
    .prepare("SELECT id FROM access_requests WHERE email = ? COLLATE NOCASE AND status = 'PENDING' LIMIT 1")
    .bind(input.email.trim().toLowerCase())
    .first<{ id: string }>();
  return pending?.id ?? id;
}

export async function countRecentAccessRequests(email: string, hours = 24): Promise<number> {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const count = await getDatabase()
    .prepare("SELECT COUNT(*) AS count FROM access_requests WHERE email = ? COLLATE NOCASE AND requested_at >= ?")
    .bind(email.trim().toLowerCase(), cutoff)
    .first<number>("count");
  return Number(count ?? 0);
}

export async function ensureBootstrapOwner(email: string): Promise<UserRecord | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const env = getCloudflareEnv();
  const profiles = parseBootstrapProfiles(env.BOOTSTRAP_OWNER_PROFILES_JSON);
  const profile = profiles.find((item) => item.email === normalizedEmail);
  const ownerEmails = (env.BOOTSTRAP_OWNER_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!profile && !ownerEmails.includes(normalizedEmail)) return findUserByEmail(normalizedEmail);

  const existing = await findUserByEmail(normalizedEmail);
  if (existing) return existing;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const inferredName = normalizedEmail
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

  await getDatabase()
    .prepare(
      `INSERT INTO users (
        id, email, full_name, duty_title, status, global_role, created_at, updated_at, approved_at
      ) VALUES (?, ?, ?, ?, 'APPROVED', 'SYSTEM_OWNER', ?, ?, ?)`
    )
    .bind(id, normalizedEmail, profile?.fullName || inferredName || "System Owner", profile?.dutyTitle ?? null, now, now, now)
    .run();

  return findUserById(id);
}

export async function createApprovedUserFromRequest(input: {
  request: AccessRequestRecord;
  approverId: string;
  globalRole?: GlobalRole;
}): Promise<UserRecord> {
  const existing = await findUserByEmail(input.request.email);
  const now = new Date().toISOString();
  let userId = existing?.id ?? crypto.randomUUID();

  if (existing) {
    await getDatabase()
      .prepare(
        `UPDATE users SET
          full_name = ?, capid = ?, duty_title = ?, status = 'APPROVED', global_role = ?,
          updated_at = ?, approved_at = ?, approved_by = ?, suspended_at = NULL, suspended_by = NULL
        WHERE id = ?`
      )
      .bind(
        input.request.fullName,
        input.request.capid,
        input.request.dutyTitle,
        input.globalRole ?? existing.globalRole,
        now,
        now,
        input.approverId,
        existing.id
      )
      .run();
  } else {
    await getDatabase()
      .prepare(
        `INSERT INTO users (
          id, email, full_name, capid, duty_title, status, global_role,
          created_at, updated_at, approved_at, approved_by
        ) VALUES (?, ?, ?, ?, ?, 'APPROVED', ?, ?, ?, ?, ?)`
      )
      .bind(
        userId,
        input.request.email,
        input.request.fullName,
        input.request.capid,
        input.request.dutyTitle,
        input.globalRole ?? "STAFF_MEMBER",
        now,
        now,
        now,
        input.approverId
      )
      .run();
  }

  await getDatabase()
    .prepare(
      `UPDATE access_requests SET
        status = 'APPROVED', reviewed_at = ?, reviewed_by = ?
      WHERE id = ?`
    )
    .bind(now, input.approverId, input.request.id)
    .run();

  const user = await findUserById(userId);
  if (!user) throw new Error("Approved user could not be loaded.");
  return user;
}

export async function rejectAccessRequest(id: string, reviewerId: string, note?: string): Promise<void> {
  await getDatabase()
    .prepare(
      `UPDATE access_requests SET
        status = 'REJECTED', reviewed_at = ?, reviewed_by = ?, review_note = ?
      WHERE id = ? AND status = 'PENDING'`
    )
    .bind(new Date().toISOString(), reviewerId, note?.trim() || null, id)
    .run();
}

export async function updateUserRole(userId: string, role: GlobalRole): Promise<void> {
  await getDatabase()
    .prepare("UPDATE users SET global_role = ?, updated_at = ? WHERE id = ?")
    .bind(role, new Date().toISOString(), userId)
    .run();
}

export async function updateUserStatus(
  userId: string,
  status: Extract<UserStatus, "APPROVED" | "SUSPENDED" | "ARCHIVED">,
  actorId: string
): Promise<void> {
  const now = new Date().toISOString();
  if (status === "SUSPENDED") {
    await getDatabase()
      .prepare(
        `UPDATE users SET status = 'SUSPENDED', updated_at = ?, suspended_at = ?, suspended_by = ? WHERE id = ?`
      )
      .bind(now, now, actorId, userId)
      .run();
    await revokeAllUserSessions(userId);
    return;
  }

  await getDatabase()
    .prepare(
      `UPDATE users SET status = ?, updated_at = ?, suspended_at = NULL, suspended_by = NULL WHERE id = ?`
    )
    .bind(status, now, userId)
    .run();
}

export async function countActiveSystemOwners(): Promise<number> {
  const count = await getDatabase()
    .prepare(
      "SELECT COUNT(*) AS count FROM users WHERE global_role = 'SYSTEM_OWNER' AND status = 'APPROVED'"
    )
    .first<number>("count");
  return Number(count ?? 0);
}

export async function countActiveApprovers(): Promise<number> {
  const count = await getDatabase()
    .prepare(
      `SELECT COUNT(*) AS count FROM users
       WHERE status = 'APPROVED' AND global_role IN ('SYSTEM_OWNER', 'ACCOUNT_APPROVER')`
    )
    .first<number>("count");
  return Number(count ?? 0);
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await getDatabase()
    .prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
    .bind(new Date().toISOString(), userId)
    .run();
}

export function toAuthenticatedUser(user: UserRecord): AuthenticatedUser {
  const { createdAt: _createdAt, updatedAt: _updatedAt, approvedAt: _approvedAt, approvedBy: _approvedBy, suspendedAt: _suspendedAt, suspendedBy: _suspendedBy, ...authenticated } = user;
  return authenticated;
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    capid: row.capid,
    dutyTitle: row.duty_title,
    status: row.status,
    globalRole: row.global_role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    suspendedAt: row.suspended_at,
    suspendedBy: row.suspended_by
  };
}

function mapAccessRequest(row: AccessRequestRow): AccessRequestRecord {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    capid: row.capid,
    dutyTitle: row.duty_title,
    note: row.note,
    status: row.status,
    requestedAt: row.requested_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    reviewNote: row.review_note
  };
}


function parseBootstrapProfiles(value: string | undefined): Array<{ email: string; fullName: string; dutyTitle?: string }> {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as Array<{ email?: string; fullName?: string; dutyTitle?: string }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item.email && item.fullName)
      .map((item) => ({
        email: item.email!.trim().toLowerCase(),
        fullName: item.fullName!.trim(),
        dutyTitle: item.dutyTitle?.trim() || undefined
      }));
  } catch {
    return [];
  }
}
