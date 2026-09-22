-- CAPID is how CAP knows a member, and squadron email addresses are CAPID@tncap.us, so it is the key that joins
-- a Google account, a Drive share and an eServices roster line into one person. Names are not: Google hands us
-- "Maratos, Tristan" one day and "Tristan Maratos" the next.
ALTER TABLE personnel_members ADD COLUMN capid TEXT;
ALTER TABLE personnel_members ADD COLUMN member_type TEXT NOT NULL DEFAULT 'SENIOR';

CREATE UNIQUE INDEX IF NOT EXISTS personnel_members_capid ON personnel_members(capid) WHERE capid IS NOT NULL;

-- Addresses that are not CAPID@tncap.us (personal Gmail and the like). Someone who knows the member says who
-- it is; the Hub never infers an identity on its own.
CREATE TABLE IF NOT EXISTS member_email_links (
  email TEXT PRIMARY KEY,
  capid TEXT NOT NULL,
  linked_by TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS member_email_links_capid ON member_email_links(capid);
