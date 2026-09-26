import { getDatabase, getCloudflareEnv } from "@/lib/cloudflare";
import { decryptToken, encryptToken } from "@/lib/auth/token-encryption";

// The other mailboxes a member wants the Hub to read.
//
// Separate from the account they sign in with, and deliberately so. That one proves who they are and
// reaches the squadron Drive; these only ever read mail. Adding or removing one cannot lock anybody out of
// anything, which is the property that makes it safe to let people add three of them and change their mind.

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export interface MailAccount {
  id: string;
  email: string;
  scopes: string | null;
  addedOn: string;
}

interface AccountRow {
  id: string;
  email: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_expires_at: string;
  scopes: string | null;
  created_at: string;
}

export async function listMailAccounts(userId: string): Promise<MailAccount[]> {
  try {
    const rows = await getDatabase()
      .prepare("SELECT id, email, scopes, created_at FROM user_mail_accounts WHERE user_id = ? ORDER BY created_at")
      .bind(userId)
      .all<{ id: string; email: string; scopes: string | null; created_at: string }>();
    return rows.results.map((row) => ({
      id: row.id,
      email: row.email,
      scopes: row.scopes,
      addedOn: row.created_at
    }));
  } catch {
    // The table arrives with a migration; until then a member simply has none.
    return [];
  }
}

/**
 * Keeps a newly authorised mailbox, or refreshes one already held.
 *
 * Matched on Google's own subject rather than the address, so reconnecting the same mailbox updates it
 * instead of quietly collecting a second copy - including when somebody has changed the address on it.
 */
export async function saveMailAccount(input: {
  userId: string;
  email: string;
  googleSubject: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  scopes?: string;
}): Promise<void> {
  const db = getDatabase();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + input.expiresIn * 1000).toISOString();

  const existing = await db
    .prepare("SELECT id, refresh_token_encrypted FROM user_mail_accounts WHERE user_id = ? AND google_subject = ?")
    .bind(input.userId, input.googleSubject)
    .first<{ id: string; refresh_token_encrypted: string | null }>();

  const access = await encryptToken(input.accessToken);
  // Google sends a refresh token the first time and often not again. Losing the one we have on a
  // reconnection would leave an account that works for an hour and then cannot be renewed.
  const refresh = input.refreshToken
    ? await encryptToken(input.refreshToken)
    : existing?.refresh_token_encrypted ?? null;

  if (existing) {
    await db
      .prepare(
        "UPDATE user_mail_accounts SET email = ?, access_token_encrypted = ?, refresh_token_encrypted = ?, " +
        "token_expires_at = ?, scopes = ?, updated_at = ? WHERE id = ?"
      )
      .bind(input.email, access, refresh, expiresAt, input.scopes ?? null, now.toISOString(), existing.id)
      .run();
    return;
  }

  await db
    .prepare(
      "INSERT INTO user_mail_accounts (id, user_id, email, google_subject, access_token_encrypted, " +
      "refresh_token_encrypted, token_expires_at, scopes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      crypto.randomUUID(), input.userId, input.email, input.googleSubject, access, refresh,
      expiresAt, input.scopes ?? null, now.toISOString(), now.toISOString()
    )
    .run();
}

export async function removeMailAccount(userId: string, id: string): Promise<void> {
  // Scoped to the member, so one person's id can never remove another's mailbox.
  await getDatabase()
    .prepare("DELETE FROM user_mail_accounts WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .run();
}

/** A usable token for one mailbox, refreshed when it has gone stale. */
export async function accessTokenFor(userId: string, id: string): Promise<string | null> {
  const db = getDatabase();
  const row = await db
    .prepare("SELECT * FROM user_mail_accounts WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<AccountRow>();
  if (!row) return null;

  if (new Date(row.token_expires_at).getTime() > Date.now() + 60_000) {
    return decryptToken(row.access_token_encrypted);
  }
  if (!row.refresh_token_encrypted) return null;

  const env = getCloudflareEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: await decryptToken(row.refresh_token_encrypted),
      grant_type: "refresh_token"
    })
  });
  // A mailbox whose permission was withdrawn at Google's end is not an error worth stopping everything for.
  // It reads as "nothing from that one", and the member can reconnect or remove it.
  if (!response.ok) return null;

  const refreshed = await response.json<{ access_token: string; expires_in: number }>();
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await db
    .prepare("UPDATE user_mail_accounts SET access_token_encrypted = ?, token_expires_at = ?, updated_at = ? WHERE id = ?")
    .bind(await encryptToken(refreshed.access_token), expiresAt, new Date().toISOString(), row.id)
    .run();
  return refreshed.access_token;
}
