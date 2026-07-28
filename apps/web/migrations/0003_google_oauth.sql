CREATE TABLE IF NOT EXISTS user_google_oauth (
  user_id TEXT PRIMARY KEY,
  google_subject TEXT NOT NULL UNIQUE,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  token_expires_at TEXT NOT NULL,
  scopes TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS user_google_oauth_expiry
ON user_google_oauth(token_expires_at);
