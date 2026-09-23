-- A member is one person with several addresses: their CAP address, the personal one CAP has on file, and
-- later a Microsoft one. Notifications go to all of them, and any of them signs in to the same account.
ALTER TABLE member_email_links ADD COLUMN kind TEXT NOT NULL DEFAULT 'PERSONAL';
ALTER TABLE member_email_links ADD COLUMN source TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE member_email_links ADD COLUMN notify INTEGER NOT NULL DEFAULT 1;

-- kind:   CAP (CAPID@tncap.us), PERSONAL (what eServices has on file), MICROSOFT (later), OTHER
-- source: ESERVICES (came from the roster paste) or MANUAL (a person confirmed it)
CREATE INDEX IF NOT EXISTS member_email_links_notify ON member_email_links(capid, notify);
