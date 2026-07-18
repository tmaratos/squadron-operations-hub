PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL DEFAULT 'MEETING'
    CHECK (event_type IN ('MEETING', 'DEADLINE', 'ACTIVITY', 'INSPECTION', 'TRAINING', 'OTHER')),
  event_date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  all_day INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0, 1)),
  location TEXT,
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'SCHEDULED'
    CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED')),
  preparation TEXT NOT NULL DEFAULT 'NONE'
    CHECK (preparation IN ('NONE', 'NEEDS_ACTION', 'IN_PROGRESS', 'READY')),
  link_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(event_date, start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_type ON calendar_events(event_type, event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_owner ON calendar_events(owner_user_id, event_date);
