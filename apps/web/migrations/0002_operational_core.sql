PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS functional_areas (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 100,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO functional_areas (key, name, description, display_order, created_at, updated_at) VALUES
  ('command', 'Command', 'Commander decisions, approvals, risks, and unit priorities.', 10, datetime('now'), datetime('now')),
  ('administration', 'Administration', 'Administrative records, correspondence, and recurring reports.', 20, datetime('now'), datetime('now')),
  ('personnel', 'Personnel', 'Member records, duty assignments, onboarding, and recognition.', 30, datetime('now'), datetime('now')),
  ('finance', 'Finance', 'Budget workflow, purchase requests, reimbursements, donors, and grants.', 40, datetime('now'), datetime('now')),
  ('logistics', 'Logistics', 'Inventory, supply, equipment assignments, and maintenance.', 50, datetime('now'), datetime('now')),
  ('safety', 'Safety', 'Safety education, risk controls, findings, and corrective actions.', 60, datetime('now'), datetime('now')),
  ('aerospace-education', 'Aerospace Education', 'Aerospace lessons, activities, field trips, and program continuity.', 70, datetime('now'), datetime('now')),
  ('cadet-programs', 'Cadet Programs', 'Cadet program planning, progression support, and activity readiness.', 80, datetime('now'), datetime('now')),
  ('emergency-services', 'Emergency Services', 'Qualifications, readiness, exercises, and operational support.', 90, datetime('now'), datetime('now')),
  ('communications', 'Communications', 'Internal communications, Discord workflows, radio, and notifications.', 100, datetime('now'), datetime('now')),
  ('it-systems', 'IT and Systems', 'Application administration, accounts, integrations, and technical continuity.', 110, datetime('now'), datetime('now')),
  ('public-affairs', 'Public Affairs', 'Public information, website content, media, and community outreach.', 120, datetime('now'), datetime('now')),
  ('recruiting-retention', 'Recruiting and Retention', 'Prospect follow-up, onboarding, engagement, and retention.', 130, datetime('now'), datetime('now')),
  ('professional-development', 'Professional Development', 'Senior-member development and specialty-track continuity.', 140, datetime('now'), datetime('now')),
  ('transportation', 'Transportation', 'Vehicle readiness, usage, inspections, and transportation planning.', 150, datetime('now'), datetime('now'));

CREATE TABLE IF NOT EXISTS duty_assignments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  functional_area_key TEXT NOT NULL,
  duty_title TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  starts_on TEXT NOT NULL,
  ends_on TEXT,
  assigned_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (functional_area_key) REFERENCES functional_areas(key),
  FOREIGN KEY (assigned_by) REFERENCES users(id),
  UNIQUE(user_id, functional_area_key, duty_title, starts_on)
);

CREATE INDEX IF NOT EXISTS duty_assignments_active_area
ON duty_assignments(functional_area_key, ends_on);

CREATE INDEX IF NOT EXISTS duty_assignments_user
ON duty_assignments(user_id, ends_on);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'AWAITING_APPROVAL', 'COMPLETED', 'CANCELLED')),
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'CRITICAL')),
  functional_area_key TEXT NOT NULL DEFAULT 'command',
  owner_user_id TEXT,
  due_on TEXT,
  source_type TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source_type IN ('MANUAL', 'MEETING', 'DISCORD', 'COMPLIANCE', 'SYSTEM')),
  source_reference TEXT,
  requires_approval INTEGER NOT NULL DEFAULT 0 CHECK (requires_approval IN (0, 1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  cancelled_at TEXT,
  FOREIGN KEY (functional_area_key) REFERENCES functional_areas(key),
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS tasks_status_due
ON tasks(status, due_on);

CREATE INDEX IF NOT EXISTS tasks_owner_status
ON tasks(owner_user_id, status);

CREATE INDEX IF NOT EXISTS tasks_area_status
ON tasks(functional_area_key, status);

CREATE TABLE IF NOT EXISTS task_comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (author_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS task_comments_task_created
ON task_comments(task_id, created_at ASC);

CREATE TABLE IF NOT EXISTS compliance_requirements (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  governing_source TEXT,
  functional_area_key TEXT NOT NULL,
  responsible_user_id TEXT,
  recurrence_rule TEXT,
  next_due_on TEXT,
  required_evidence_json TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'RETIRED')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (functional_area_key) REFERENCES functional_areas(key),
  FOREIGN KEY (responsible_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS compliance_requirements_due
ON compliance_requirements(status, next_due_on);

CREATE TABLE IF NOT EXISTS compliance_completions (
  id TEXT PRIMARY KEY,
  requirement_id TEXT NOT NULL,
  completed_by TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  evidence_json TEXT,
  note TEXT,
  next_due_on TEXT,
  FOREIGN KEY (requirement_id) REFERENCES compliance_requirements(id) ON DELETE CASCADE,
  FOREIGN KEY (completed_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS compliance_completions_requirement
ON compliance_completions(requirement_id, completed_at DESC);
