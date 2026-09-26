-- Mailboxes that are not Gmail.
--
-- Squadron business does not only arrive at a Gmail address. Members have Outlook, Hotmail and Yahoo, and
-- CAP's own @cap.gov mail runs on Microsoft - so the one mailbox most likely to hold CAP business was the
-- one the Hub could not read at all.
--
-- The table was built around Google alone: a google_subject column, and a Google endpoint to refresh
-- against. Provider is now recorded per mailbox, and the subject column keeps whichever id that provider
-- uses to identify the account, since both Google and Microsoft issue one.
ALTER TABLE user_mail_accounts ADD COLUMN provider TEXT NOT NULL DEFAULT 'GOOGLE';
