-- CAPWATCH: the credential, and the record of every attempt to use it.
--
-- The credential is not an API key. CAP authenticates the download with the authorised member's CAPID and
-- their live eServices password - the same password that can change member records - so this is a far more
-- sensitive thing to hold than a scoped token, and it stops working the moment that member changes their
-- password. Both facts shape this table.
--
-- The password is stored encrypted with the key that already protects OAuth tokens, which lives in
-- Cloudflare's secret store and never in the database. Ciphertext here, key elsewhere: reading this table is
-- not enough to use what is in it. Nothing returns the password to a browser, and only the CAPWATCH service
-- decrypts it.
--
-- One row, because the squadron has one CAPWATCH authorisation at a time. Who holds it changes; that it is
-- singular does not.
CREATE TABLE IF NOT EXISTS capwatch_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),

  -- The member CAP approved. Replaceable, because the duty passes on and the integration must not need a
  -- developer when it does.
  capid TEXT,
  password_encrypted TEXT,

  -- 1370 is TN-170. Held as data rather than in code for the same reason as the CAPID.
  org_id TEXT NOT NULL DEFAULT '1370',
  -- Only meaningful when the ORGID is a group, wing or region; a squadron returns its own unit either way.
  unit_only INTEGER NOT NULL DEFAULT 0,

  credential_updated_at TEXT,
  credential_updated_by TEXT,
  -- The last time CAP actually accepted the credential, which is the only proof it still works.
  last_auth_ok_at TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (credential_updated_by) REFERENCES users(id)
);

-- Every attempt, kept whether it worked or not.
--
-- A failure is the more useful record of the two: when the authorised member changes their eServices
-- password the sync starts failing and nobody is watching, so the history is what turns "the roster looks
-- stale" into "authentication has been refused since Tuesday". Errors are stored as CAP's own words, which
-- is why the service strips anything credential-shaped before writing here.
CREATE TABLE IF NOT EXISTS capwatch_syncs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,

  -- RUNNING while in flight, so a second run can tell one is already going.
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'OK', 'AUTH_FAILED', 'DOWNLOAD_FAILED', 'BAD_ARCHIVE', 'BLACKOUT', 'ERROR')),

  -- What the run was: a real synchronisation, or only a credential test.
  kind TEXT NOT NULL DEFAULT 'SYNC' CHECK (kind IN ('SYNC', 'TEST')),

  bytes_downloaded INTEGER,
  tables_found INTEGER,
  members_seen INTEGER,
  message TEXT,
  triggered_by TEXT,

  FOREIGN KEY (triggered_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS capwatch_syncs_started ON capwatch_syncs(started_at DESC);
