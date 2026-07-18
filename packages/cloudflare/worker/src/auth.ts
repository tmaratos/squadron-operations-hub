import { sendMagicLink } from "./email";
import { enforceRateLimit } from "./maintenance";
import type { AuthUser, Env, UserRow } from "./types";
import {
  addDays,
  addMinutes,
  clientIp,
  intEnv,
  json,
  normalizeEmail,
  nowIso,
  parseCookies,
  randomToken,
  redirect,
  safeAppUrl,
  sha256Hex
} from "./utils";

interface MagicLinkRow {
  magic_link_id: string;
  user_id: string;
  capid: string;
  rank: string;
  full_name: string;
  email: string;
  role: "OWNER" | "MEMBER";
}

export async function requestMagicLink(request: Request, env: Env, emailInput: string): Promise<Response> {
  const email = normalizeEmail(emailInput);
  await enforceRateLimit(env, "auth-link-ip", clientIp(request), 10, 600);
  if (email) await enforceRateLimit(env, "auth-link-email", email, 5, 600);

  const generic = {
    ok: true,
    message: "If that email is approved, a secure sign-in link will be sent shortly."
  };

  const user = await env.DB.prepare(`
    SELECT * FROM users
    WHERE email_norm = ?1 AND status = 'ACTIVE'
    LIMIT 1
  `).bind(email).first<UserRow>();

  if (!user || !user.email) return json(generic, 202);

  const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
  const recent = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM magic_links
    WHERE user_id = ?1 AND created_at >= ?2
  `).bind(user.id, cutoff).first<{ count: number }>();

  if ((recent?.count || 0) >= 5) return json(generic, 202);

  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const ipHash = await sha256Hex(clientIp(request));
  const createdAt = nowIso();
  const expiresAt = addMinutes(new Date(), intEnv(env.MAGIC_LINK_TTL_MINUTES, 15));
  const magicLinkId = crypto.randomUUID();

  await env.DB.prepare(`
    INSERT INTO magic_links (
      id, user_id, token_hash, request_ip_hash, expires_at, created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
  `).bind(magicLinkId, user.id, tokenHash, ipHash, expiresAt, createdAt).run();

  const authUser: AuthUser = {
    id: user.id,
    capid: user.capid,
    rank: user.rank,
    fullName: user.full_name,
    email: user.email,
    role: user.role
  };

  const link = `${safeAppUrl(env, "/api/auth/verify")}?token=${encodeURIComponent(token)}`;

  try {
    await sendMagicLink(env, authUser, link);
    await audit(env, user.id, "AUTH_LINK_REQUESTED", "Magic-link sign-in requested.");
  } catch (error) {
    await env.DB.prepare("DELETE FROM magic_links WHERE id = ?1").bind(magicLinkId).run();
    throw error;
  }

  return json(generic, 202);
}

export async function verifyMagicLink(env: Env, token: string): Promise<Response> {
  const tokenHash = await sha256Hex(token);
  const current = nowIso();

  const row = await env.DB.prepare(`
    SELECT
      ml.id AS magic_link_id,
      u.id AS user_id,
      u.capid,
      u.rank,
      u.full_name,
      u.email,
      u.role
    FROM magic_links ml
    JOIN users u ON u.id = ml.user_id
    WHERE ml.token_hash = ?1
      AND ml.used_at IS NULL
      AND ml.expires_at > ?2
      AND u.status = 'ACTIVE'
    LIMIT 1
  `).bind(tokenHash, current).first<MagicLinkRow>();

  if (!row) {
    return redirect(`${safeAppUrl(env, "/sign-in.html")}?error=expired`);
  }

  const sessionToken = randomToken();
  const sessionHash = await sha256Hex(sessionToken);
  const sessionId = crypto.randomUUID();
  const expiresAt = addDays(new Date(), intEnv(env.SESSION_TTL_DAYS, 7));

  await env.DB.batch([
    env.DB.prepare("UPDATE magic_links SET used_at = ?1 WHERE id = ?2 AND used_at IS NULL").bind(current, row.magic_link_id),
    env.DB.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?5)
    `).bind(sessionId, row.user_id, sessionHash, expiresAt, current),
    env.DB.prepare("UPDATE users SET last_login_at = ?1, updated_at = ?1 WHERE id = ?2").bind(current, row.user_id),
    env.DB.prepare(`
      INSERT INTO audit_log (id, actor_user_id, action, summary, created_at)
      VALUES (?1, ?2, 'AUTH_LOGIN', 'Passwordless sign-in completed.', ?3)
    `).bind(crypto.randomUUID(), row.user_id, current)
  ]);

  const maxAge = intEnv(env.SESSION_TTL_DAYS, 7) * 86_400;
  const cookieName = env.SESSION_COOKIE || "soh_session";
  const cookie = `${cookieName}=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
  return redirect(safeAppUrl(env, "/index.html"), { "set-cookie": cookie });
}

export async function authenticate(request: Request, env: Env): Promise<AuthUser | null> {
  const token = parseCookies(request)[env.SESSION_COOKIE || "soh_session"];
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(`
    SELECT u.id, u.capid, u.rank, u.full_name, u.email, u.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?1
      AND s.revoked_at IS NULL
      AND s.expires_at > ?2
      AND u.status = 'ACTIVE'
    LIMIT 1
  `).bind(tokenHash, nowIso()).first<{
    id: string;
    capid: string;
    rank: string;
    full_name: string;
    email: string;
    role: "OWNER" | "MEMBER";
  }>();

  if (!row) return null;

  return {
    id: row.id,
    capid: row.capid,
    rank: row.rank,
    fullName: row.full_name,
    email: row.email,
    role: row.role
  };
}

export async function logout(request: Request, env: Env): Promise<Response> {
  const token = parseCookies(request)[env.SESSION_COOKIE || "soh_session"];
  if (token) {
    const hash = await sha256Hex(token);
    await env.DB.prepare("UPDATE sessions SET revoked_at = ?1 WHERE token_hash = ?2").bind(nowIso(), hash).run();
  }

  const cookieName = env.SESSION_COOKIE || "soh_session";
  return json(
    { ok: true },
    200,
    { "set-cookie": `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` }
  );
}

export async function audit(env: Env, actorUserId: string | null, action: string, summary: string): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO audit_log (id, actor_user_id, action, summary, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5)
  `).bind(crypto.randomUUID(), actorUserId, action, summary, nowIso()).run();
}
