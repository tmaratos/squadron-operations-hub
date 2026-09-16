-- What the Hub tells a member about, and how it reaches them.
-- One row per thing worth knowing. The same row feeds the in-app list and the email, so a member never
-- gets an email about something the Hub cannot also show them, and nothing is sent twice.
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ASSIGNED', 'COMMENT', 'DUE_SOON', 'OVERDUE', 'STATUS', 'MENTION')),
  title TEXT NOT NULL,
  body TEXT,
  item_id TEXT,
  list_id TEXT,
  url TEXT,
  actor_user_id TEXT,
  -- Stops a nightly reminder piling up: "this deadline, this member, this day" can only exist once.
  dedupe_key TEXT,
  email_state TEXT NOT NULL DEFAULT 'PENDING' CHECK (email_state IN ('PENDING', 'SENT', 'SKIPPED', 'FAILED')),
  emailed_at TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe ON notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_for_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS notifications_to_send ON notifications(email_state, created_at);

-- How each member wants to hear about it. Defaults are deliberately quiet: the things you are responsible
-- for, once a day, so nobody's inbox becomes a reason to ignore the Hub.
CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id TEXT PRIMARY KEY,
  email_enabled INTEGER NOT NULL DEFAULT 1,
  on_assigned INTEGER NOT NULL DEFAULT 1,
  on_comment INTEGER NOT NULL DEFAULT 1,
  on_due_soon INTEGER NOT NULL DEFAULT 1,
  on_overdue INTEGER NOT NULL DEFAULT 1,
  on_status INTEGER NOT NULL DEFAULT 0,
  -- IMMEDIATE sends within the quarter hour; DAILY collects everything into one morning email.
  cadence TEXT NOT NULL DEFAULT 'DAILY' CHECK (cadence IN ('IMMEDIATE', 'DAILY')),
  -- How many days before a due date the reminder goes out.
  lead_days INTEGER NOT NULL DEFAULT 3,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- A record of what actually left the building, so a member can be told "we emailed you on the 4th".
CREATE TABLE IF NOT EXISTS notification_sends (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  notification_count INTEGER NOT NULL DEFAULT 0,
  provider TEXT,
  status TEXT NOT NULL CHECK (status IN ('SENT', 'FAILED')),
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS notification_sends_for_user ON notification_sends(user_id, created_at DESC);
