-- The Hub's own way into the squadron's documents, rather than borrowing a member's.
--
-- Every Drive call today runs on whoever happens to be signed in. That makes the squadron's files reachable
-- only while that member's Google account still works, puts a Drive API call in the path of every page load,
-- and means the whole thing stops the day the person who set it up leaves. A service account belongs to no
-- one and keeps working when people come and go.
--
-- The key is stored the same way as the CAPWATCH password: ciphertext here, encryption key in Cloudflare's
-- secret store, never returned to a browser. It deserves that care - a service account key does not expire,
-- so a leaked one is good until somebody notices and revokes it in Google Cloud.
--
-- Written as a provider rather than as "the Google key", because CAP is moving to Microsoft 365 and this
-- table should be able to hold that credential without being rebuilt.
CREATE TABLE IF NOT EXISTS storage_credentials (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  provider TEXT NOT NULL DEFAULT 'GOOGLE_DRIVE' CHECK (provider IN ('GOOGLE_DRIVE', 'MICROSOFT_365')),

  -- Identifying, not secret: the address an administrator must add to the shared drive, and which they need
  -- to see on the settings page to check the right one was granted access.
  client_email TEXT,
  project_id TEXT,

  key_encrypted TEXT,

  -- The last time the credential actually worked, which is the only proof it still does.
  last_ok_at TEXT,
  last_error TEXT,

  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (updated_by) REFERENCES users(id)
);
