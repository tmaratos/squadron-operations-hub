-- Flexible workspace structure, modeled on ClickUp.
-- Workspace > Space > Folder (optional) > List > Item > sub-items (any depth).
-- Each list has its own workflow (statuses) and custom fields. Views, dashboards and automations are stored as data,
-- so new layouts and workflows are created in the Hub, not in code.
-- Requires 0008_workspaces_integrations.sql to be applied first.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT 'purple',
  icon TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS spaces_workspace ON spaces(workspace_id, display_order);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS folders_space ON folders(space_id, display_order);

CREATE TABLE IF NOT EXISTS lists (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  folder_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS lists_space ON lists(space_id, folder_id, display_order);

-- Workflow: the statuses an item in a list can move through.
CREATE TABLE IF NOT EXISTS list_statuses (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'gray',
  category TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (category IN ('NOT_STARTED', 'ACTIVE', 'DONE', 'CLOSED')),
  display_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS list_statuses_list ON list_statuses(list_id, display_order);

-- Custom fields can belong to a whole space or to one list.
CREATE TABLE IF NOT EXISTS custom_fields (
  id TEXT PRIMARY KEY,
  space_id TEXT,
  list_id TEXT,
  name TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'long_text', 'number', 'currency', 'date', 'checkbox', 'dropdown', 'labels', 'person', 'url', 'email', 'phone', 'rating', 'progress')),
  options_json TEXT,
  required INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
);

-- Items live in a list and can contain other items (sub-items to any depth).
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  parent_id TEXT,
  item_type TEXT NOT NULL DEFAULT 'task',
  title TEXT NOT NULL,
  description TEXT,
  status_id TEXT,
  priority TEXT CHECK (priority IS NULL OR priority IN ('URGENT', 'HIGH', 'NORMAL', 'LOW')),
  start_on TEXT,
  due_on TEXT,
  time_estimate_minutes INTEGER,
  display_order REAL NOT NULL DEFAULT 0,
  completed_at TEXT,
  archived_at TEXT,
  legacy_task_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (status_id) REFERENCES list_statuses(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS items_list ON items(list_id, parent_id, display_order);
CREATE INDEX IF NOT EXISTS items_parent ON items(parent_id);
CREATE INDEX IF NOT EXISTS items_due ON items(due_on);

CREATE TABLE IF NOT EXISTS item_assignees (
  item_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (item_id, user_id),
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS item_assignees_user ON item_assignees(user_id);

-- Items reuse the tag library from 0007.
CREATE TABLE IF NOT EXISTS item_tags (
  item_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (item_id, tag_id),
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES task_tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS item_field_values (
  item_id TEXT NOT NULL,
  field_id TEXT NOT NULL,
  value_json TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (item_id, field_id),
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (field_id) REFERENCES custom_fields(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS item_checklists (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS item_checklist_entries (
  id TEXT PRIMARY KEY,
  checklist_id TEXT NOT NULL,
  label TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  assignee_user_id TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (checklist_id) REFERENCES item_checklists(id) ON DELETE CASCADE,
  FOREIGN KEY (assignee_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS item_comments (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (author_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS item_comments_item ON item_comments(item_id, created_at);

CREATE TABLE IF NOT EXISTS item_relations (
  item_id TEXT NOT NULL,
  related_item_id TEXT NOT NULL,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('blocks', 'waiting_on', 'related')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (item_id, related_item_id, relation_type),
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (related_item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS item_attachments (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT,
  drive_file_id TEXT,
  added_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (added_by) REFERENCES users(id)
);

-- Saved views: list, board, table, calendar, with their filters, grouping, sorting and columns.
CREATE TABLE IF NOT EXISTS views (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('workspace', 'space', 'folder', 'list')),
  scope_id TEXT NOT NULL,
  name TEXT NOT NULL,
  view_type TEXT NOT NULL CHECK (view_type IN ('list', 'board', 'table', 'calendar', 'timeline')),
  config_json TEXT NOT NULL DEFAULT '{}',
  is_default INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS views_scope ON views(scope_type, scope_id, display_order);

-- Dashboards are built from cards (widgets) placed on a grid.
CREATE TABLE IF NOT EXISTS dashboards (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_shared INTEGER NOT NULL DEFAULT 1,
  is_home INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id TEXT PRIMARY KEY,
  dashboard_id TEXT NOT NULL,
  widget_type TEXT NOT NULL,
  title TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  grid_x INTEGER NOT NULL DEFAULT 0,
  grid_y INTEGER NOT NULL DEFAULT 0,
  grid_w INTEGER NOT NULL DEFAULT 4,
  grid_h INTEGER NOT NULL DEFAULT 3,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS dashboard_widgets_dashboard ON dashboard_widgets(dashboard_id);

-- Automations: when a trigger happens and the conditions match, run the actions.
CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('workspace', 'space', 'folder', 'list')),
  scope_id TEXT NOT NULL,
  name TEXT NOT NULL,
  trigger_json TEXT NOT NULL,
  conditions_json TEXT NOT NULL DEFAULT '[]',
  actions_json TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS automations_scope ON automations(scope_type, scope_id);

CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  item_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('SUCCESS', 'SKIPPED', 'FAILED')),
  detail TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS automation_runs_automation ON automation_runs(automation_id, created_at);
