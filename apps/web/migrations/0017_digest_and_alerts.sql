-- When the once-a-day email lands. End of day is the default because that is when people deal with squadron
-- work; a 6am summary is read on a phone before a day job and forgotten by the evening.
ALTER TABLE notification_prefs ADD COLUMN digest_when TEXT NOT NULL DEFAULT 'EVENING';

-- An alert a staff member sends to chosen members. It is a notification like any other, so it shows in the
-- Hub as well as in the inbox, and the sender can see afterwards who it went to.
CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_by TEXT NOT NULL,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  urgent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (sent_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS announcements_recent ON announcements(created_at DESC);

-- The notifications table lists its allowed kinds in a CHECK, and SQLite cannot alter one in place, so the
-- table is rebuilt with ANNOUNCEMENT added. Existing rows are carried across unchanged.
CREATE TABLE notifications_rebuilt (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ASSIGNED', 'COMMENT', 'DUE_SOON', 'OVERDUE', 'STATUS', 'MENTION', 'ANNOUNCEMENT')),
  title TEXT NOT NULL,
  body TEXT,
  item_id TEXT,
  list_id TEXT,
  url TEXT,
  actor_user_id TEXT,
  dedupe_key TEXT,
  email_state TEXT NOT NULL DEFAULT 'PENDING' CHECK (email_state IN ('PENDING', 'SENT', 'SKIPPED', 'FAILED')),
  emailed_at TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO notifications_rebuilt (id, user_id, kind, title, body, item_id, list_id, url, actor_user_id, dedupe_key, email_state, emailed_at, read_at, created_at)
  SELECT id, user_id, kind, title, body, item_id, list_id, url, actor_user_id, dedupe_key, email_state, emailed_at, read_at, created_at FROM notifications;

DROP TABLE notifications;
ALTER TABLE notifications_rebuilt RENAME TO notifications;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe ON notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_for_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS notifications_to_send ON notifications(email_state, created_at);
