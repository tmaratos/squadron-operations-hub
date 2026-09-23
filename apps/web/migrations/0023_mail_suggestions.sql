-- What a member's labelled email seems to be asking for.
--
-- Kept rather than worked out on demand, so the Hub can look through the mail quietly in the background
-- and have the answer waiting, instead of a member pressing a button and watching a spinner. One row per
-- message per member: a message that has been dealt with never comes back.
CREATE TABLE IF NOT EXISTS mail_suggestions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  from_address TEXT,
  subject TEXT,
  title TEXT NOT NULL,
  due_on TEXT,
  -- The words in the email that the suggestion rests on.
  because TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ADDED', 'DISMISSED')),
  item_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS mail_suggestions_once ON mail_suggestions(user_id, message_id);
CREATE INDEX IF NOT EXISTS mail_suggestions_open ON mail_suggestions(user_id, status, created_at DESC);
