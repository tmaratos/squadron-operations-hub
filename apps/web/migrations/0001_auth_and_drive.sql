PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name TEXT NOT NULL,
  capid TEXT,
  duty_title TEXT,
  status TEXT NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED', 'ARCHIVED')),
  global_role TEXT NOT NULL DEFAULT 'STAFF_MEMBER' CHECK (global_role IN ('SYSTEM_OWNER', 'ACCOUNT_APPROVER', 'ADMINISTRATOR', 'STAFF_MEMBER', 'READ_ONLY')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  approved_at TEXT,
  approved_by TEXT,
  suspended_at TEXT,
  suspended_by TEXT,
  FOREIGN KEY (approved_by) REFERENCES users(id),
  FOREIGN KEY (suspended_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS access_requests (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  full_name TEXT NOT NULL,
  capid TEXT,
  duty_title TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN')),
  requested_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT,
  review_note TEXT,
  FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS access_requests_one_pending_per_email
ON access_requests(email)
WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS access_requests_status_requested
ON access_requests(status, requested_at DESC);

CREATE TABLE IF NOT EXISTS login_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  requested_ip_hash TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS login_tokens_user_expiry
ON login_tokens(user_id, expires_at);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent TEXT,
  ip_hash TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS sessions_user_expiry
ON sessions(user_id, expires_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  summary TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (actor_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS audit_events_created
ON audit_events(created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_entity
ON audit_events(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS functional_permissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (granted_by) REFERENCES users(id),
  UNIQUE(user_id, permission_key)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  FOREIGN KEY (updated_by) REFERENCES users(id)
);
