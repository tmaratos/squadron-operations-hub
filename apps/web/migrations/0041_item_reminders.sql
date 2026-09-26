-- Reminders that belong to one task, rather than one rule for everything.
--
-- Until now every dated task was chased on the same ladder: seven days out, three, one, and the day itself.
-- That is a reasonable default and a poor fit for the work a squadron actually does. Registration that
-- closes in six weeks wants a nudge at four weeks, not at seven days. A form with a wing suspense wants
-- warning while there is still time to gather what goes in it. An event wants somebody told the week before
-- so they can arrange the van.
--
-- So a task can carry its own reminders. The assistant proposes them from the deadline and what the task
-- says, and a person moves them, adds to them or deletes them - the proposal is a starting point and never
-- the last word. A task with none falls back to the ladder, so nothing gets quieter by accident.
CREATE TABLE IF NOT EXISTS item_reminders (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  -- The day it fires. Plain date: the notifier runs hourly and sends the day's reminders in the evening
  -- round, with everything else, rather than pinging somebody at an arbitrary hour.
  remind_on TEXT NOT NULL,
  -- Why this date, in words. "Four weeks out, while there is still time to book" is worth keeping, because
  -- the next person to look at it should not have to guess what the date meant.
  note TEXT,
  -- Whether the assistant proposed it or a person set it. Kept so a member can see what they have not yet
  -- looked at, and so a suggestion never looks like a decision somebody made.
  source TEXT NOT NULL DEFAULT 'PERSON' CHECK (source IN ('PERSON', 'ASSISTANT')),
  -- Set once it has gone out, so it goes out once.
  sent_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS item_reminders_due ON item_reminders(remind_on, sent_at);
CREATE INDEX IF NOT EXISTS item_reminders_item ON item_reminders(item_id);
