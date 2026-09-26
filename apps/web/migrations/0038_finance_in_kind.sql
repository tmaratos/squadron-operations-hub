-- Donations that are not money.
--
-- A squadron is given things as often as it is given cash: a projector, printing, a case of water for an
-- encampment, somebody's time on a trailer. It is real support, it belongs in what the unit reports, and it
-- is the part most likely to go unrecorded because there is no deposit to file against it.
--
-- It must never touch the balance. An in-kind gift worth two hundred dollars does not put two hundred
-- dollars in the account, and a unit that counts it as though it did will believe it can spend money it does
-- not have. So these are recorded as income, reported separately, and excluded from every cash figure.
ALTER TABLE finance_transactions ADD COLUMN in_kind INTEGER NOT NULL DEFAULT 0;
-- What was actually given, and how the value was arrived at. "Worth" is an estimate and should say so.
ALTER TABLE finance_transactions ADD COLUMN item_detail TEXT;
ALTER TABLE finance_transactions ADD COLUMN value_basis TEXT;
