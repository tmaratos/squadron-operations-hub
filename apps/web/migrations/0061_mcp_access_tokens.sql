-- Per-member, revocable tokens for read-only external MCP clients.
-- Tokens are stored exclusively as SHA-256 hashes; never save or log raw tokens.
CREATE TABLE IF NOT EXISTS mcp_access_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_mcp_access_tokens_user ON mcp_access_tokens(user_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_mcp_access_tokens_expires ON mcp_access_tokens(expires_at);
