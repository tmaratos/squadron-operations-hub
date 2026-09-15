-- Personal connections: each member connects their own accounts (files, email) and AI services.
-- Secrets (API keys, OAuth tokens) are stored encrypted with the same AES-GCM key as Google sign-in tokens and are never returned to the browser.
CREATE TABLE IF NOT EXISTS user_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('oauth', 'api_key')),
  account_email TEXT,
  secret_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TEXT,
  scopes TEXT,
  key_hint TEXT,
  config_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'CONNECTED' CHECK (status IN ('CONNECTED', 'ERROR', 'REVOKED')),
  last_checked_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, provider),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS user_connections_user ON user_connections(user_id);
