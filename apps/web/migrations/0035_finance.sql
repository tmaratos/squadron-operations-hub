-- The squadron's money, as a ledger rather than a list of tasks.
--
-- Finance was a department holding lists, which is the wrong shape for it. A task is done or not done; a
-- transaction has an amount, a date, a category and a paper trail, and the questions asked of it are
-- arithmetic - what came in, what went out, what is left, and whether any of it is outside the budget the
-- unit approved. None of that can be answered by ticking things off.
--
-- Built around how a CAP unit actually handles money. Under the Wing Banker Program the unit does not hold
-- its own bank account: money goes to wing and is disbursed by wing, so every entry has a state between
-- "we agreed to it" and "wing has cleared it", and the useful thing the Hub can do is notice the ones that
-- have been sitting in between for too long. The fiscal year is CAP's, 1 October to 30 September, and not
-- the calendar year, because a budget compared against the wrong twelve months is worse than no budget.

CREATE TABLE IF NOT EXISTS finance_transactions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  -- INCOME or EXPENSE. Kept explicit rather than inferred from the sign of the amount, because a negative
  -- number in a ledger is an error you cannot see and a refund is not an expense of minus one dollar.
  direction TEXT NOT NULL CHECK (direction IN ('INCOME', 'EXPENSE')),
  -- Whole cents. Money is never stored as a float; a budget that is out by a third of a cent per row is
  -- the sort of thing nobody finds until an audit.
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  occurred_on TEXT NOT NULL,
  category TEXT NOT NULL,
  purpose TEXT NOT NULL,
  -- Who the money came from or went to.
  counterparty TEXT,
  -- Where it sits in the wing banker round trip.
  status TEXT NOT NULL DEFAULT 'RECORDED' CHECK (status IN ('RECORDED', 'SUBMITTED', 'CLEARED', 'VOID')),
  submitted_on TEXT,
  cleared_on TEXT,
  -- Wing's own reference for the deposit or disbursement, so an entry here can be matched against the
  -- wing statement without anybody guessing.
  wing_reference TEXT,
  -- The receipt or invoice, in the squadron's Drive. An expense without one is a finding, not a failure.
  receipt_file_id TEXT,
  receipt_name TEXT,
  -- Who approved spending it, which for a CAP unit is a person and not a checkbox.
  approved_by TEXT,
  approved_on TEXT,
  -- The work it belongs to, where there is some: an event's expenses, a fundraiser's takings.
  item_id TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS finance_tx_date ON finance_transactions(occurred_on);
CREATE INDEX IF NOT EXISTS finance_tx_status ON finance_transactions(status);
CREATE INDEX IF NOT EXISTS finance_tx_category ON finance_transactions(category);

-- What the unit said it would spend, by category, for one fiscal year.
--
-- One row per category per year, so budget against actual is a join and not a spreadsheet somebody keeps
-- separately and forgets to update.
CREATE TABLE IF NOT EXISTS finance_budget_lines (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  -- The year it ends in: 1 Oct 2025 to 30 Sep 2026 is 2026, which is how CAP refers to it.
  fiscal_year INTEGER NOT NULL,
  category TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('INCOME', 'EXPENSE')),
  planned_cents INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, fiscal_year, category)
);

-- The finance committee's meetings, because the requirement is the meeting and the record of it.
--
-- A unit finance committee is expected to meet through the year and to minute what it decided. The Hub does
-- not hold the minutes - they live in the Drive - but it can tell that a quarter has closed with nothing
-- recorded against it, which is the only part anybody actually forgets.
CREATE TABLE IF NOT EXISTS finance_meetings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  met_on TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  fiscal_quarter INTEGER NOT NULL CHECK (fiscal_quarter BETWEEN 1 AND 4),
  attendees TEXT,
  decisions TEXT,
  minutes_file_id TEXT,
  minutes_name TEXT,
  recorded_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS finance_meetings_period ON finance_meetings(fiscal_year, fiscal_quarter);
