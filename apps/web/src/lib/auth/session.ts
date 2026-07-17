import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCloudflareEnv, getDatabase } from "@/lib/cloudflare";
import { createRandomToken, sha256 } from "@/lib/security/crypto";
import { findUserById, toAuthenticatedUser } from "./repository";
import type { AuthenticatedUser, GlobalRole } from "./types";

const PRODUCTION_COOKIE = "__Host-squadron_session";
const DEVELOPMENT_COOKIE = "squadron_session";

function cookieName(): string {
  return process.env.NODE_ENV === "production" ? PRODUCTION_COOKIE : DEVELOPMENT_COOKIE;
}

export async function createSession(input: {
  userId: string;
  userAgent?: string | null;
  ipHash?: string | null;
}): Promise<{ token: string; expiresAt: Date }> {
  const env = getCloudflareEnv();
  const ttlHours = Number(env.SESSION_TTL_HOURS ?? 12);
  const token = createRandomToken(32);
  const tokenHash = await sha256(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

  await getDatabase()
    .prepare(
      `INSERT INTO sessions (
        id, user_id, token_hash, created_at, expires_at, last_seen_at, user_agent, ip_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      input.userId,
      tokenHash,
      now.toISOString(),
      expiresAt.toISOString(),
      now.toISOString(),
      input.userAgent ?? null,
      input.ipHash ?? null
    )
    .run();

  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(cookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(cookieName(), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0)
  });
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const store = await cookies();
  const token = store.get(cookieName())?.value;
  if (!token) return null;

  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  const session = await getDatabase()
    .prepare(
      `SELECT user_id, last_seen_at FROM sessions
       WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?
       LIMIT 1`
    )
    .bind(tokenHash, now)
    .first<{ user_id: string; last_seen_at: string }>();

  if (!session) return null;
  const user = await findUserById(session.user_id);
  if (!user || user.status !== "APPROVED") return null;

  if (Date.now() - new Date(session.last_seen_at).getTime() > 15 * 60 * 1000) {
    await getDatabase()
      .prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?")
      .bind(now, tokenHash)
      .run();
  }

  return toAuthenticatedUser(user);
}

export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(roles: GlobalRole[]): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (!roles.includes(user.globalRole)) redirect("/");
  return user;
}

export async function revokeCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(cookieName())?.value;
  if (token) {
    const tokenHash = await sha256(token);
    await getDatabase()
      .prepare("UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL")
      .bind(new Date().toISOString(), tokenHash)
      .run();
  }
  await clearSessionCookie();
}
