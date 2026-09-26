-- What the unit started the year holding.
--
-- Without this the tracker cannot say anything true about a balance. It knows what moved since 1 October and
-- nothing about the money that was already there, so "spending is ahead of income" was true of a ledger
-- containing one ten dollar expense - a claim that is correct, useless, and would have taught everybody to
-- ignore the findings panel within a week.
--
-- So the figure is entered by a person, from the wing statement, and until it is entered the Hub makes no
-- claim about the balance at all. Saying nothing is the right behaviour when the number is not known.
CREATE TABLE IF NOT EXISTS finance_year_opening (
  workspace_id TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  opening_cents INTEGER NOT NULL,
  -- Where the figure came from, so the next finance officer can check it rather than trust it.
  source TEXT,
  recorded_by TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, fiscal_year)
);
