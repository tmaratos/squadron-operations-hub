-- Work that comes back on its own.
--
-- Asked for "the next quarter's monthly schedule, on the first Monday of the second month of each quarter,
-- recurring so we don't have to make a new one", the Hub could only make a single task with a date on it -
-- because a repeating task was not a thing it had. This is that thing.
--
-- It is deliberately separate from the duties catalogue: a duty is an obligation a regulation places on a
-- role, carries a citation and waits for a human to confirm it. A routine is just something the squadron
-- does regularly, and anybody can set one up.
CREATE TABLE IF NOT EXISTS recurring_tasks (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT,
  -- WEEKLY, MONTHLY, QUARTERLY or ANNUAL.
  frequency TEXT NOT NULL CHECK (frequency IN ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL')),
  -- Either a day of the month (15th), or a weekday rule: the 1st Monday, the last Friday.
  day_of_month INTEGER,
  weekday INTEGER,          -- 0 Sunday through 6 Saturday
  week_of_month INTEGER,    -- 1..4, or -1 for the last one in the month
  -- For QUARTERLY: which month inside the quarter, 1, 2 or 3. For ANNUAL: the month, 1..12.
  month_of_period INTEGER,
  -- How far ahead the task appears, so there is time to do it before it is due.
  lead_days INTEGER NOT NULL DEFAULT 7,
  assignee_user_id TEXT,
  tags TEXT,
  next_due TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS recurring_tasks_due ON recurring_tasks(active, next_due);

-- Which occurrence has already been made, so a routine produces one task per due date however often the
-- generator runs.
CREATE TABLE IF NOT EXISTS recurring_occurrences (
  id TEXT PRIMARY KEY,
  recurring_id TEXT NOT NULL,
  due_on TEXT NOT NULL,
  item_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (recurring_id) REFERENCES recurring_tasks(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS recurring_occurrences_once ON recurring_occurrences(recurring_id, due_on);

-- A task made by a routine points back at it, so the panel can say "this repeats".
ALTER TABLE items ADD COLUMN recurring_id TEXT;
