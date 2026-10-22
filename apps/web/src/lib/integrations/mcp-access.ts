import { getDatabase } from "@/lib/cloudflare";
import { createRandomToken, sha256 } from "@/lib/security/crypto";
import { findUserById, toAuthenticatedUser } from "@/lib/auth/repository";
import { canAccessSharedDrive, getUserGoogleAccessToken } from "@/lib/auth/google-oauth";
import type { AuthenticatedUser } from "@/lib/auth/types";

const PREFIX = "tn170_mcp_";
const VALID_FOR_DAYS = 90;
const MAX_ACTIVE_TOKENS = 5;

interface TokenRow {
  id: string;
  label: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
}

export async function listMyMcpTokens(userId: string) {
  const rows = await getDatabase().prepare(
    "SELECT id,label,created_at,expires_at,revoked_at,last_used_at FROM mcp_access_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
  ).bind(userId).all<TokenRow>();
  return rows.results.map((row) => ({
    id: row.id, label: row.label, createdAt: row.created_at,
    expiresAt: row.expires_at, revokedAt: row.revoked_at, lastUsedAt: row.last_used_at
  }));
}

/** A credential is disclosed exactly once: when it is minted for the signed-in owner. */
export async function createMcpToken(user: AuthenticatedUser, label: string) {
  const current = new Date();
  const now = current.toISOString();
  const count = await getDatabase().prepare(
    "SELECT COUNT(*) AS count FROM mcp_access_tokens WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?"
  ).bind(user.id, now).first<{ count: number }>();
  if (Number(count?.count ?? 0) >= MAX_ACTIVE_TOKENS) {
    throw new Error("Revoke an old connection before creating another (maximum five active keys).");
  }
  const token = PREFIX + createRandomToken(32);
  const id = crypto.randomUUID();
  const expiresAt = new Date(current.getTime() + VALID_FOR_DAYS * 86400000).toISOString();
  await getDatabase().prepare(
    "INSERT INTO mcp_access_tokens (id,user_id,token_hash,label,created_at,expires_at) VALUES (?,?,?,?,?,?)"
  ).bind(id, user.id, await sha256(token), label, now, expiresAt).run();
  return { id, token, label, expiresAt };
}

export async function revokeMyMcpToken(userId: string, tokenId: string): Promise<boolean> {
  const result = await getDatabase().prepare(
    "UPDATE mcp_access_tokens SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL"
  ).bind(new Date().toISOString(), tokenId, userId).run();
  return Number(result.meta.changes ?? 0) > 0;
}

/** Bearer access is fully independent of browser cookies and respects current Hub/Drive access. */
export async function authenticateMcpBearer(request: Request): Promise<AuthenticatedUser | null> {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer (tn170_mcp_[A-Za-z0-9_-]{40,60})$/.exec(header);
  if (!match) return null;
  const now = new Date().toISOString();
  const hash = await sha256(match[1]);
  const credential = await getDatabase().prepare(
    "SELECT id,user_id,last_used_at FROM mcp_access_tokens WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ? LIMIT 1"
  ).bind(hash, now).first<{ id: string; user_id: string; last_used_at: string | null }>();
  if (!credential) return null;
  const row = await findUserById(credential.user_id);
  if (!row || row.status !== "APPROVED") return null;
  // Session access has this same shared-drive gate. A revoked Drive share disables MCP as well.
  try {
    const googleAccessToken = await getUserGoogleAccessToken(row.id);
    if (!(await canAccessSharedDrive(googleAccessToken))) return null;
  } catch {
    return null;
  }
  // Limit writes for last-used metadata: once in fifteen minutes.
  if (!credential.last_used_at || Date.now() - new Date(credential.last_used_at).getTime() > 900000) {
    await getDatabase().prepare("UPDATE mcp_access_tokens SET last_used_at = ? WHERE id = ?")
      .bind(now, credential.id).run();
  }
  return toAuthenticatedUser(row);
}
