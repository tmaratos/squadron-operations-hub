-- The steps a goal is actually made of.
--
-- A goal with a percentage and nothing underneath it is a wish. What makes it real is the list of things
-- somebody has to do, and those are tasks - the same tasks that live in a list, get assigned, carry a date
-- and send reminders. A step here is a pointer to one of those, so a goal cannot drift away from the work:
-- tick the task off in its list and the goal moves.
--
-- A step may exist before its task does, because somebody describing a goal out loud gets ahead of the
-- paperwork. It just does not count towards progress until it is attached to something real.
CREATE TABLE IF NOT EXISTS goal_steps (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  title TEXT NOT NULL,
  -- The task this step is. Null while it is still only a line somebody wrote down.
  item_id TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS goal_steps_goal ON goal_steps(goal_id, display_order);
