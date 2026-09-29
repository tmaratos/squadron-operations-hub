-- Who CAP says is a member, and who the squadron says may use the Hub. Two different questions.
--
-- Until now they were the same answer: signing in with a Google account that could open the squadron's
-- Shared Drive both identified a person and admitted them. That has to come apart, because CAP is moving off
-- Google and because the two facts genuinely differ - a member of TN-170 is not automatically somebody who
-- should be in this application, and somebody who should be in this application stops being so long before
-- their CAP membership lapses.
--
-- So membership stays where it already lives, on personnel_members, and will become CAPWATCH's to maintain.
-- The decision to admit somebody lives here, keyed by CAPID, and belongs to an administrator. Nothing in a
-- CAPWATCH import may write to this table.
--
-- Keyed by CAPID rather than by user account on purpose: a member can exist, and be deliberately not
-- admitted, without an account existing at all. That is the normal state for most of the unit, and the model
-- should be able to say it plainly rather than by the absence of a row somewhere else.

CREATE TABLE IF NOT EXISTS member_access (
  capid TEXT PRIMARY KEY,

  -- NOT_CONFIGURED: the member exists and nobody has decided. The default, and the only state a member can
  --                 arrive in. Reaching it is not a judgement about the person.
  -- AUTHORIZED:     an administrator has admitted them and they hold a login identity.
  -- RESTRICTED:     admitted once, and stopped. The record, the history and the work all stay; only the
  --                 ability to get in goes away.
  status TEXT NOT NULL DEFAULT 'NOT_CONFIGURED'
    CHECK (status IN ('NOT_CONFIGURED', 'AUTHORIZED', 'RESTRICTED')),

  -- The address the member signs in with, which is theirs rather than CAP's. Held here as well as in
  -- member_email_links because this one is load-bearing: it is the identity an administrator approved, not
  -- merely an address somebody is known at. Changing it must not make a new member, so CAPID stays the key.
  login_email TEXT COLLATE NOCASE,

  -- The account this member signs in as, once one exists. Null while they have never signed in, which is
  -- normal for a member who has been granted access but not yet used it.
  user_id TEXT,

  granted_at TEXT,
  granted_by TEXT,
  restricted_at TEXT,
  restricted_by TEXT,

  -- Why this row says what it says, so an automatic decision can be told from a person's.
  -- ADMIN:     an administrator set it deliberately.
  -- MIGRATED:  carried over from the Google sign-in era when this model was introduced.
  source TEXT NOT NULL DEFAULT 'ADMIN' CHECK (source IN ('ADMIN', 'MIGRATED')),

  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (granted_by) REFERENCES users(id),
  FOREIGN KEY (restricted_by) REFERENCES users(id)
);

-- One member per login address. Two members sharing a sign-in identity would make the question "who is
-- this?" unanswerable, which is the one thing this table exists to answer.
CREATE UNIQUE INDEX IF NOT EXISTS member_access_login_email
  ON member_access(login_email) WHERE login_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS member_access_status ON member_access(status);

-- Where a member's CAP facts came from, so a hand-typed roster line can be told from CAPWATCH's own record.
-- Nothing reads these yet; they are here so that the import has somewhere truthful to write when it arrives,
-- rather than silently overwriting what a person entered and leaving no trace that it did.
ALTER TABLE personnel_members ADD COLUMN capwatch_synced_at TEXT;
ALTER TABLE personnel_members ADD COLUMN source TEXT NOT NULL DEFAULT 'MANUAL'
  CHECK (source IN ('MANUAL', 'CAPWATCH'));
