-- Money promised and not yet moved, in either direction.
--
-- The ledger only knows about money that has already gone somewhere. A squadron's finance officer spends at
-- least as much time on money that has not: a member who owes activity fees, an encampment payment due next
-- month, an invoice sitting unpaid. TN-170 keeps this in a spreadsheet called Money Owed, outside everything
-- else, which is exactly the kind of record that goes stale the week somebody gets busy.
--
-- Kept apart from the ledger on purpose. An obligation is not a transaction and must never be counted as
-- one - counting expected money as income is how a unit talks itself into a balance it does not have. When
-- it is settled, the ledger entry it becomes is recorded properly and linked back to here.
CREATE TABLE IF NOT EXISTS finance_obligations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  -- INCOME: somebody owes the squadron. EXPENSE: the squadron owes somebody.
  direction TEXT NOT NULL CHECK (direction IN ('INCOME', 'EXPENSE')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  -- Who owes it, or who is owed. A person, a member, a vendor, wing.
  counterparty TEXT NOT NULL,
  purpose TEXT NOT NULL,
  category TEXT NOT NULL,
  due_on TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'SETTLED', 'WRITTEN_OFF')),
  -- The ledger entry it became, once the money actually moved.
  transaction_id TEXT,
  settled_on TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (transaction_id) REFERENCES finance_transactions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS finance_obligations_open ON finance_obligations(status, due_on);
