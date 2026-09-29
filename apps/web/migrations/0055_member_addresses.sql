-- Letting a member decide where the squadron reaches them.
--
-- Until now the CAP address was unconditional: CAPID@tncap.us went on every notification whether or not the
-- member reads it, and anything else was added by staff on the member's behalf. Several members forward the
-- CAP address somewhere they never check, so "we emailed you" kept being true and useless at the same time.
--
-- So the rule becomes the member's to set. Any address, as many as they like, each one on or off for
-- notifications independently. Two things keep that from becoming a way to lose mail or leak it:
--
--   1. An address is confirmed before anything is sent to it. A member types their own address from memory
--      and gets a character wrong perhaps one time in fifty; without this, that one time sends squadron
--      business to a stranger who never asked for it and cannot make it stop.
--   2. A member may not switch every address off. Turning the last one off is refused, with the reason, rather
--      than accepted into silence - a notification nobody receives is worse than one that is merely ignored,
--      because the Hub goes on believing the member was told.
ALTER TABLE member_email_links ADD COLUMN label TEXT;
ALTER TABLE member_email_links ADD COLUMN verified_at TEXT;
ALTER TABLE member_email_links ADD COLUMN added_by_member INTEGER NOT NULL DEFAULT 0;

-- Addresses that predate this were put there by staff from the eServices roster, which means CAP already held
-- them and a person read them off a screen. Treating those as confirmed is not a shortcut: they have been
-- receiving mail for months, and demanding re-confirmation would silence every member at once.
UPDATE member_email_links SET verified_at = created_at WHERE verified_at IS NULL;

-- A short-lived code, sent to the address being claimed and useless anywhere else.
CREATE TABLE IF NOT EXISTS email_confirmations (
  email TEXT PRIMARY KEY,
  capid TEXT NOT NULL,
  -- Stored as a SHA-256 hex digest. The code is mailed once and never held in a form the database can give back.
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  -- Guessing is cheap against a six-digit code, so attempts are counted and the code dies at five.
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS email_confirmations_capid ON email_confirmations(capid);
