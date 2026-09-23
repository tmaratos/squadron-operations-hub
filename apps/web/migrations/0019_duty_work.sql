-- Work that makes itself.
--
-- The duties catalogue knows what each role owes and when. Until now a person had to read that and create
-- the task by hand, which is the kind of remembering the Hub exists to remove. This table is the record of
-- which occurrence of which duty has already become a task, so the generator can run as often as it likes
-- and never produce the same task twice.
CREATE TABLE IF NOT EXISTS duty_occurrences (
  id TEXT PRIMARY KEY,
  duty_id TEXT NOT NULL,
  due_on TEXT NOT NULL,
  item_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (duty_id) REFERENCES role_duties(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS duty_occurrences_once ON duty_occurrences(duty_id, due_on);
CREATE INDEX IF NOT EXISTS duty_occurrences_item ON duty_occurrences(item_id);
