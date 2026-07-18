import { audit } from "./auth";
import type { AuthUser, Env, UserRole, UserStatus } from "./types";
import { HttpError, normalizeEmail, nowIso } from "./utils";

export function requireOwner(user: AuthUser): void {
  if (user.role !== "OWNER") throw new HttpError(403, "System Owner permission is required.");
}

export async function listUsers(env: Env) {
  const result = await env.DB.prepare(`
    SELECT id, capid, rank, full_name, email, role, status, last_login_at, created_at, updated_at
    FROM users
    ORDER BY
      CASE role WHEN 'OWNER' THEN 0 ELSE 1 END,
      full_name
  `).all();
  return result.results;
}

export async function updateUser(
  env: Env,
  actor: AuthUser,
  id: string,
  input: { email?: string | null; role?: UserRole; status?: UserStatus }
) {
  requireOwner(actor);
  const existing = await env.DB.prepare("SELECT * FROM users WHERE id = ?1").bind(id).first<{
    id: string;
    full_name: string;
    role: UserRole;
    status: UserStatus;
  }>();
  if (!existing) throw new HttpError(404, "User not found.");

  const fields: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown) => {
    fields.push(`${column} = ?${values.length + 1}`);
    values.push(value);
  };

  if (input.email !== undefined) {
    const email = input.email?.trim() || null;
    add("email", email);
    add("email_norm", email ? normalizeEmail(email) : null);
    if (email && existing.status === "PENDING_EMAIL" && input.status === undefined) add("status", "ACTIVE");
  }
  if (input.role !== undefined) add("role", input.role);
  if (input.status !== undefined) add("status", input.status);

  if (!fields.length) return existing;

  add("updated_at", nowIso());
  values.push(id);
  await env.DB.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?${values.length}`).bind(...values).run();
  await audit(env, actor.id, "USER_UPDATED", `Updated account for ${existing.full_name}.`);

  return env.DB.prepare(`
    SELECT id, capid, rank, full_name, email, role, status, last_login_at, created_at, updated_at
    FROM users WHERE id = ?1
  `).bind(id).first();
}

export async function submitAccessRequest(
  env: Env,
  input: { fullName?: string; email?: string; capid?: string; requestedArea?: string; reason?: string }
) {
  const fullName = input.fullName?.trim();
  const email = normalizeEmail(input.email || "");
  const capid = input.capid?.trim();
  if (!fullName || !email || !capid) throw new HttpError(400, "Name, email, and CAPID are required.");

  const existing = await env.DB.prepare(`
    SELECT id FROM access_requests
    WHERE (email_norm = ?1 OR capid = ?2) AND status = 'PENDING'
    LIMIT 1
  `).bind(email, capid).first();

  if (!existing) {
    await env.DB.prepare(`
      INSERT INTO access_requests (
        id, full_name, email, email_norm, capid, requested_area, reason, status, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'PENDING', ?8, ?8)
    `).bind(
      crypto.randomUUID(),
      fullName,
      email,
      email,
      capid,
      input.requestedArea?.trim() || "General staff access",
      input.reason?.trim() || null,
      nowIso()
    ).run();
  }

  return { ok: true, message: "Your request was submitted for owner review." };
}

export async function listAccessRequests(env: Env, actor: AuthUser) {
  requireOwner(actor);
  const result = await env.DB.prepare(`
    SELECT id, full_name, email, capid, requested_area, reason, status, created_at, updated_at
    FROM access_requests
    WHERE status = 'PENDING'
    ORDER BY created_at
  `).all();
  return result.results;
}

export async function accessRequestAction(env: Env, actor: AuthUser, id: string, action: "approve" | "reject") {
  requireOwner(actor);
  const request = await env.DB.prepare(`
    SELECT * FROM access_requests WHERE id = ?1 AND status = 'PENDING'
  `).bind(id).first<{
    id: string;
    full_name: string;
    email: string;
    email_norm: string;
    capid: string;
  }>();
  if (!request) throw new HttpError(404, "Pending request not found.");

  const current = nowIso();
  if (action === "approve") {
    const user = await env.DB.prepare("SELECT id FROM users WHERE capid = ?1").bind(request.capid).first<{ id: string }>();
    if (user) {
      await env.DB.batch([
        env.DB.prepare(`
          UPDATE users
          SET email = ?1, email_norm = ?2, status = 'ACTIVE', updated_at = ?3
          WHERE id = ?4
        `).bind(request.email, request.email_norm, current, user.id),
        env.DB.prepare(`
          UPDATE access_requests
          SET status = 'APPROVED', reviewed_by = ?1, reviewed_at = ?2, updated_at = ?2
          WHERE id = ?3
        `).bind(actor.id, current, id)
      ]);
    } else {
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO users (
            id, capid, rank, full_name, email, email_norm, role, status, created_at, updated_at
          ) VALUES (?1, ?2, 'SM', ?3, ?4, ?5, 'MEMBER', 'ACTIVE', ?6, ?6)
        `).bind(crypto.randomUUID(), request.capid, request.full_name, request.email, request.email_norm, current),
        env.DB.prepare(`
          UPDATE access_requests
          SET status = 'APPROVED', reviewed_by = ?1, reviewed_at = ?2, updated_at = ?2
          WHERE id = ?3
        `).bind(actor.id, current, id)
      ]);
    }
    await audit(env, actor.id, "ACCESS_APPROVED", `Approved access for ${request.full_name}.`);
  } else {
    await env.DB.prepare(`
      UPDATE access_requests
      SET status = 'REJECTED', reviewed_by = ?1, reviewed_at = ?2, updated_at = ?2
      WHERE id = ?3
    `).bind(actor.id, current, id).run();
    await audit(env, actor.id, "ACCESS_REJECTED", `Rejected access for ${request.full_name}.`);
  }

  return { ok: true };
}
