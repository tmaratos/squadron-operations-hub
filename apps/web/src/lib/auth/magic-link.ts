import { getCloudflareEnv, getDatabase } from "@/lib/cloudflare";
import { sendMagicLinkEmail } from "@/lib/email/mailgun";
import { createRandomToken, sha256 } from "@/lib/security/crypto";
import type { UserRecord } from "./types";

export async function issueMagicLink(user: UserRecord): Promise<{ debugLink?: string }> {
  const env = getCloudflareEnv();
  const ttlMinutes = Number(env.MAGIC_LINK_TTL_MINUTES ?? 15);
  const token = createRandomToken(32);
  const tokenHash = await sha256(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

  await getDatabase()
    .prepare("UPDATE login_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL")
    .bind(now.toISOString(), user.id)
    .run();

  await getDatabase()
    .prepare(
      `INSERT INTO login_tokens (
        id, user_id, token_hash, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?)`
    )
    .bind(crypto.randomUUID(), user.id, tokenHash, now.toISOString(), expiresAt.toISOString())
    .run();

  const appUrl = env.APP_URL.replace(/\/$/, "");
  const link = `${appUrl}/auth/verify?token=${encodeURIComponent(token)}`;
  const sent = await sendMagicLinkEmail({
    to: user.email,
    name: user.fullName,
    link,
    expiresMinutes: ttlMinutes
  });

  if (!sent && process.env.NODE_ENV !== "production") {
    return { debugLink: link };
  }
  return {};
}

export async function consumeMagicLink(token: string): Promise<UserRecord | null> {
  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  const record = await getDatabase()
    .prepare(
      `SELECT id, user_id FROM login_tokens
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
       LIMIT 1`
    )
    .bind(tokenHash, now)
    .first<{ id: string; user_id: string }>();

  if (!record) return null;

  const result = await getDatabase()
    .prepare("UPDATE login_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL")
    .bind(now, record.id)
    .run();

  if (!result.meta.changes) return null;

  const { findUserById } = await import("./repository");
  const user = await findUserById(record.user_id);
  return user?.status === "APPROVED" ? user : null;
}
