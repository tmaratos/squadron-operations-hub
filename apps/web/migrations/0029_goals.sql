-- What the squadron is trying to achieve, as opposed to what it has to do.
--
-- QCUA, Squadron of Merit, the AEX award, a recruiting number: these are goals, and every one of them was
-- sitting in a list as a task because the Hub had nowhere else to put them. A task is done or not done. A
-- goal has a target, a distance still to travel, and a date it has to be true by - and saying "10% of
-- senior members trained" as a task loses all three.
--
-- Short and long term are kept apart because they are read at different times. Short term is what this
-- year's staff meeting is about; long term is what the commander is steering by.
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  detail TEXT,
  -- SHORT: this year or this quarter. LONG: beyond it.
  horizon TEXT NOT NULL DEFAULT 'SHORT' CHECK (horizon IN ('SHORT', 'LONG')),
  -- When it has to be true by. A goal without one is a wish.
  target_date TEXT,
  -- Whose it is. A goal nobody owns is how a goal quietly stops being one.
  owner_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'MET', 'MISSED', 'ABANDONED')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS goals_horizon ON goals(workspace_id, horizon, status);

-- What has to be true for the goal to be met. A goal can have several.
--
-- A TASKS target is the one that matters most here: it reads its progress from the work already in the
-- Hub, so the goal keeps itself up to date instead of becoming another thing somebody has to remember to
-- edit. A goal nobody updates is worse than no goal, because it looks like information.
CREATE TABLE IF NOT EXISTS goal_targets (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  label TEXT NOT NULL,
  -- NUMBER: count up to a figure. CHECK: done or not. TASKS: how much of a list or tag is finished.
  kind TEXT NOT NULL CHECK (kind IN ('NUMBER', 'CHECK', 'TASKS')),
  current_value REAL NOT NULL DEFAULT 0,
  target_value REAL NOT NULL DEFAULT 1,
  unit TEXT,
  -- For TASKS: which list, or which tag, counts towards it.
  source_list_id TEXT,
  source_tag TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS goal_targets_goal ON goal_targets(goal_id, display_order);
