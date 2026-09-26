-- A duty can be held by somebody who has never signed in.
--
-- The assignment form offered four names out of twenty-three, because it could only name people with a Hub
-- account and most of a squadron has not logged into anything. The organisation chart knew who the Safety
-- Officer was and this did not, which made the page look as though it had lost most of the squadron.
--
-- Holding a duty and having an account are different facts. The chart records who does the job; the account
-- only decides whether the Hub has anywhere to route work. A duty held by somebody without an account is
-- recorded in full and simply has nobody to email yet, which is worth seeing rather than hiding.
--
-- SQLite cannot relax NOT NULL in place, so the table is rebuilt. Every column, constraint and index is
-- carried across, every existing row keeps its id, and the unique rule is widened to cover both kinds of
-- holder so the same person still cannot be given the same duty twice.
CREATE TABLE duty_assignments_next (
  id TEXT PRIMARY KEY,
  -- One of these two. Somebody with an account is recorded by it, because that is what routing needs;
  -- anybody else is recorded against the roster.
  user_id TEXT,
  personnel_member_id TEXT,
  functional_area_key TEXT NOT NULL,
  duty_title TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  starts_on TEXT NOT NULL,
  ends_on TEXT,
  assigned_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (user_id IS NOT NULL OR personnel_member_id IS NOT NULL),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (personnel_member_id) REFERENCES personnel_members(id) ON DELETE CASCADE,
  FOREIGN KEY (functional_area_key) REFERENCES functional_areas(key),
  FOREIGN KEY (assigned_by) REFERENCES users(id),
  UNIQUE(user_id, personnel_member_id, functional_area_key, duty_title, starts_on)
);

INSERT INTO duty_assignments_next (
  id, user_id, personnel_member_id, functional_area_key, duty_title,
  is_primary, starts_on, ends_on, assigned_by, created_at, updated_at
)
SELECT id, user_id, NULL, functional_area_key, duty_title,
       is_primary, starts_on, ends_on, assigned_by, created_at, updated_at
FROM duty_assignments;

DROP TABLE duty_assignments;
ALTER TABLE duty_assignments_next RENAME TO duty_assignments;

CREATE INDEX IF NOT EXISTS duty_assignments_area ON duty_assignments(functional_area_key);
CREATE INDEX IF NOT EXISTS duty_assignments_user ON duty_assignments(user_id);
CREATE INDEX IF NOT EXISTS duty_assignments_member ON duty_assignments(personnel_member_id);
