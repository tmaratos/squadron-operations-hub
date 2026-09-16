-- What each staff role has to do, how often, and where that requirement comes from.
-- Nothing here is assumed: every duty carries a source, and a duty stays unverified until a person confirms it.
CREATE TABLE IF NOT EXISTS role_duties (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'tn-170',
  role TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  cadence TEXT NOT NULL CHECK (cadence IN ('MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'EVERY_N_YEARS', 'ONE_TIME')),
  interval_years INTEGER,
  due_month INTEGER,
  due_day INTEGER,
  anchor_date TEXT,
  lead_days INTEGER NOT NULL DEFAULT 30,
  source_citation TEXT,
  source_url TEXT,
  source_item_id TEXT,
  source_document_id TEXT,
  source_quote TEXT,
  confidence TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (confidence IN ('UNVERIFIED', 'CONFIRMED', 'REJECTED')),
  confirmed_by TEXT,
  confirmed_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (source_item_id) REFERENCES items(id) ON DELETE SET NULL,
  FOREIGN KEY (confirmed_by) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS role_duties_role ON role_duties(workspace_id, role, active);
CREATE INDEX IF NOT EXISTS role_duties_confidence ON role_duties(confidence);
