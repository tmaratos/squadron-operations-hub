-- How much of each connected mailbox gets read, decided per mailbox.
--
-- One setting for all of them was the wrong shape. People connect mailboxes that deserve different
-- treatment: a CAP address where every folder is worth reading, and a personal one where only what is
-- unread has any chance of being squadron business. Forcing both to the same scope means either missing
-- half the CAP mail or having the Hub read years of somebody's private correspondence to find it.
--
-- NULL means "whatever the member's own default is", so nothing changes for a mailbox nobody has set, and
-- the existing setting keeps governing the account they sign in with.

ALTER TABLE user_mail_accounts ADD COLUMN scan_mode TEXT;
