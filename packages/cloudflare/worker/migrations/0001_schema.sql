PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  capid TEXT NOT NULL UNIQUE,
  rank TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  email_norm TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('OWNER', 'MEMBER')),
  status TEXT NOT NULL DEFAULT 'PENDING_EMAIL' CHECK (status IN ('PENDING_EMAIL', 'ACTIVE', 'SUSPENDED')),
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS magic_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  request_ip_hash TEXT,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS functional_areas (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_score INTEGER NOT NULL DEFAULT 90,
  weight INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  functional_area TEXT NOT NULL REFERENCES functional_areas(key),
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  due_on TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'AWAITING_APPROVAL', 'COMPLETED', 'CANCELLED')),
  priority TEXT NOT NULL DEFAULT 'NORMAL'
    CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'CRITICAL')),
  readiness_weight INTEGER NOT NULL DEFAULT 2,
  requires_approval INTEGER NOT NULL DEFAULT 1,
  submitted_at TEXT,
  approved_at TEXT,
  approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS access_requests (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_norm TEXT NOT NULL,
  capid TEXT NOT NULL,
  requested_area TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_magic_links_user_created ON magic_links(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_magic_links_expiry ON magic_links(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks(status, due_on);
CREATE INDEX IF NOT EXISTS idx_tasks_area ON tasks(functional_area);
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

INSERT OR IGNORE INTO functional_areas (key, name, base_score, weight, display_order) VALUES
  ('administration', 'Administration', 90, 2, 10),
  ('personnel', 'Personnel', 90, 2, 20),
  ('finance', 'Finance', 88, 2, 30),
  ('logistics', 'Logistics', 90, 2, 40),
  ('safety', 'Safety', 92, 3, 50),
  ('aerospace-education', 'Aerospace Education', 90, 2, 60),
  ('cadet-programs', 'Cadet Programs', 92, 3, 70),
  ('emergency-services', 'Emergency Services', 92, 3, 80),
  ('communications', 'Communications', 90, 2, 90),
  ('it-systems', 'IT / Systems', 90, 1, 100),
  ('public-affairs', 'Public Affairs', 90, 1, 110),
  ('recruiting', 'Recruiting & Retention', 88, 1, 120);
