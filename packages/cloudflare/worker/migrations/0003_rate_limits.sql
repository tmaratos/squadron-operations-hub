CREATE TABLE IF NOT EXISTS rate_limits (
  key_hash TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_expiry
ON rate_limits(expires_at);
