-- The email's own worldwide identifier, so one message sent to twelve people is one piece of work.
--
-- Every email carries a Message-ID header that its sender's mail server sets once. Every recipient's copy
-- carries the same one, which is what makes it possible to tell that the message in Mel's mailbox and the
-- message in Zac's mailbox are not two pieces of work but one.
--
-- The per-mailbox id already stored is no use for this: Gmail and Outlook each invent their own, so the same
-- squadron-wide email has a different id in every mailbox it reaches, and a group email to a dozen members
-- would have produced a dozen identical tasks.

ALTER TABLE mail_suggestions ADD COLUMN internet_id TEXT;

CREATE INDEX IF NOT EXISTS mail_suggestions_internet ON mail_suggestions(internet_id);
