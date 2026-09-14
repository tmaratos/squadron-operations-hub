PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS task_tags (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL COLLATE NOCASE UNIQUE,
  color TEXT NOT NULL DEFAULT 'slate',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS task_tag_assignments (
  task_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  assigned_by TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (task_id, tag_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES task_tags(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS task_tag_assignments_tag
ON task_tag_assignments(tag_id, task_id);
