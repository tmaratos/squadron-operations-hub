import type { Env } from "./types";
import { HttpError, nowIso, sha256Hex } from "./utils";

export async function enforceRateLimit(
  env: Env,
  scope: string,
  identifier: string,
  limit: number,
  windowSeconds: number
): Promise<void> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs).toISOString();
  const expiresAt = new Date(windowStartMs + windowMs).toISOString();
  const keyHash = await sha256Hex(`${scope}:${identifier}:${windowStart}`);

  await env.DB.prepare(`
    INSERT INTO rate_limits (key_hash, scope, window_start, count, expires_at)
    VALUES (?1, ?2, ?3, 1, ?4)
    ON CONFLICT(key_hash) DO UPDATE SET count = count + 1
  `).bind(keyHash, scope, windowStart, expiresAt).run();

  const row = await env.DB.prepare(`
    SELECT count FROM rate_limits WHERE key_hash = ?1
  `).bind(keyHash).first<{ count: number }>();

  if ((row?.count || 0) > limit) {
    throw new HttpError(429, "Too many requests. Please wait and try again.");
  }
}

export async function runMaintenance(env: Env): Promise<void> {
  const current = nowIso();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

  await env.DB.batch([
    env.DB.prepare(`
      DELETE FROM magic_links
      WHERE expires_at < ?1
         OR (used_at IS NOT NULL AND used_at < ?2)
    `).bind(current, thirtyDaysAgo),
    env.DB.prepare(`
      DELETE FROM sessions
      WHERE expires_at < ?1
         OR (revoked_at IS NOT NULL AND revoked_at < ?2)
    `).bind(current, thirtyDaysAgo),
    env.DB.prepare(`
      DELETE FROM rate_limits WHERE expires_at < ?1
    `).bind(current)
  ]);

  console.log(JSON.stringify({
    event: "scheduled_maintenance_completed",
    completedAt: current
  }));
}
