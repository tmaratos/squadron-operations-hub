PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS personnel_members (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE,
  rank TEXT NOT NULL,
  full_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'LEAVE', 'INACTIVE')),
  status_note TEXT,
  source_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS personnel_members_name
ON personnel_members(full_name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS personnel_positions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  functional_area_key TEXT NOT NULL,
  incumbent_id TEXT,
  reports_to_position_id TEXT,
  assignment_status TEXT NOT NULL DEFAULT 'FILLED' CHECK (assignment_status IN ('FILLED', 'ACTING', 'VACANT')),
  notes TEXT,
  source_date TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (functional_area_key) REFERENCES functional_areas(key),
  FOREIGN KEY (incumbent_id) REFERENCES personnel_members(id) ON DELETE SET NULL,
  FOREIGN KEY (reports_to_position_id) REFERENCES personnel_positions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS personnel_positions_order
ON personnel_positions(display_order, title);

CREATE TABLE IF NOT EXISTS personnel_committees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  source_date TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS personnel_committee_members (
  committee_id TEXT NOT NULL,
  personnel_member_id TEXT NOT NULL,
  committee_role TEXT NOT NULL CHECK (committee_role IN ('CHAIR', 'MEMBER')),
  display_order INTEGER NOT NULL DEFAULT 100,
  PRIMARY KEY (committee_id, personnel_member_id),
  FOREIGN KEY (committee_id) REFERENCES personnel_committees(id) ON DELETE CASCADE,
  FOREIGN KEY (personnel_member_id) REFERENCES personnel_members(id) ON DELETE CASCADE
);

INSERT INTO personnel_members (id, rank, full_name, status, status_note, source_date, created_at, updated_at) VALUES
  ('pm-steven-mellard', 'Maj.', 'Steven Mellard', 'ACTIVE', NULL, '2026-04-01', datetime('now'), datetime('now')),
  ('pm-tristan-maratos', '2d Lt.', 'Tristan Maratos', 'ACTIVE', NULL, '2026-04-01', datetime('now'), datetime('now')),
  ('pm-everett-chretien', '2d Lt.', 'Everett Chretien', 'ACTIVE', NULL, '2026-04-01', datetime('now'), datetime('now')),
  ('pm-margaret-durgin', '2d Lt.', 'Margaret Durgin', 'ACTIVE', NULL, '2026-04-01', datetime('now'), datetime('now')),
  ('pm-colleen-warthan', '2d Lt.', 'Colleen Warthan', 'ACTIVE', NULL, '2026-04-01', datetime('now'), datetime('now')),
  ('pm-eddie-burchell', '1st Lt.', 'Eddie Burchell', 'LEAVE', 'On leave; duties temporarily covered by 1st Lt. Zachary Johnson.', '2026-04-01', datetime('now'), datetime('now')),
  ('pm-tyler-thomas', '2d Lt.', 'Tyler Thomas', 'ACTIVE', NULL, '2026-04-01', datetime('now'), datetime('now')),
  ('pm-mel-osborne', '1st Lt.', 'Mel Osborne', 'ACTIVE', NULL, '2026-04-01', datetime('now'), datetime('now')),
  ('pm-clarence-juneau', 'Maj.', 'Clarence Juneau', 'ACTIVE', NULL, '2026-04-01', datetime('now'), datetime('now')),
  ('pm-rebecca-chretien', '2d Lt.', 'Rebecca Chretien', 'ACTIVE', NULL, '2026-04-01', datetime('now'), datetime('now')),
  ('pm-anthony-warthan', '2d Lt.', 'Anthony Warthan', 'ACTIVE', NULL, '2026-04-01', datetime('now'), datetime('now')),
  ('pm-zachary-johnson', '1st Lt.', 'Zachary Johnson', 'ACTIVE', 'Acting in Eddie Burchell duties during leave.', '2026-04-01', datetime('now'), datetime('now')),
  ('pm-annabelle-thomas', '1st Lt.', 'Annabelle Thomas', 'ACTIVE', NULL, '2026-04-01', datetime('now'), datetime('now')),
  ('pm-tonya-osborne', 'SM', 'Tonya Osborne', 'ACTIVE', NULL, '2026-04-01', datetime('now'), datetime('now'));

INSERT INTO personnel_positions (
  id, title, functional_area_key, incumbent_id, reports_to_position_id,
  assignment_status, notes, source_date, display_order, created_at, updated_at
) VALUES
  ('pos-commander', 'Unit Commander', 'command', 'pm-steven-mellard', NULL, 'FILLED', NULL, '2026-04-01', 10, datetime('now'), datetime('now')),
  ('pos-dcc', 'Deputy Commander for Cadets', 'cadet-programs', 'pm-zachary-johnson', 'pos-commander', 'ACTING', 'Covering for 1st Lt. Eddie Burchell during leave.', '2026-04-01', 20, datetime('now'), datetime('now')),
  ('pos-dcs', 'Deputy Commander for Seniors', 'professional-development', 'pm-mel-osborne', 'pos-commander', 'FILLED', 'Also assigned Operations Officer duties.', '2026-04-01', 30, datetime('now'), datetime('now')),
  ('pos-ae', 'Aerospace Education Officer', 'aerospace-education', 'pm-tristan-maratos', 'pos-commander', 'FILLED', NULL, '2026-04-01', 40, datetime('now'), datetime('now')),
  ('pos-pa', 'Public Affairs Officer', 'public-affairs', 'pm-everett-chretien', 'pos-commander', 'FILLED', NULL, '2026-04-01', 50, datetime('now'), datetime('now')),
  ('pos-finance', 'Finance Officer', 'finance', 'pm-margaret-durgin', 'pos-commander', 'FILLED', NULL, '2026-04-01', 60, datetime('now'), datetime('now')),
  ('pos-character', 'Character Development Instructor', 'cadet-programs', 'pm-colleen-warthan', 'pos-dcc', 'FILLED', NULL, '2026-04-01', 70, datetime('now'), datetime('now')),
  ('pos-it', 'Information Technology Officer', 'it-systems', 'pm-tyler-thomas', 'pos-commander', 'FILLED', 'Also assigned Web Administrator duties.', '2026-04-01', 80, datetime('now'), datetime('now')),
  ('pos-logistics', 'Logistics Officer', 'logistics', 'pm-mel-osborne', 'pos-commander', 'FILLED', NULL, '2026-04-01', 90, datetime('now'), datetime('now')),
  ('pos-safety', 'Safety Officer', 'safety', 'pm-clarence-juneau', 'pos-commander', 'FILLED', NULL, '2026-04-01', 100, datetime('now'), datetime('now')),
  ('pos-education-training', 'Education and Training Officer', 'professional-development', 'pm-rebecca-chretien', 'pos-dcs', 'FILLED', NULL, '2026-04-01', 110, datetime('now'), datetime('now')),
  ('pos-administration', 'Administration Officer', 'administration', 'pm-margaret-durgin', 'pos-commander', 'FILLED', 'Also assigned Personnel Officer duties.', '2026-04-01', 120, datetime('now'), datetime('now')),
  ('pos-nco-advisor', 'NCO Advisor', 'command', NULL, 'pos-commander', 'VACANT', NULL, '2026-04-01', 130, datetime('now'), datetime('now')),
  ('pos-leadership-ed', 'Leadership Education Officer', 'cadet-programs', 'pm-anthony-warthan', 'pos-dcc', 'FILLED', NULL, '2026-04-01', 140, datetime('now'), datetime('now')),
  ('pos-fitness-ed', 'Fitness Education Officer', 'cadet-programs', NULL, 'pos-dcc', 'VACANT', NULL, '2026-04-01', 150, datetime('now'), datetime('now')),
  ('pos-es', 'Emergency Services Officer', 'emergency-services', 'pm-everett-chretien', 'pos-commander', 'FILLED', NULL, '2026-04-01', 160, datetime('now'), datetime('now')),
  ('pos-es-training', 'Emergency Services Training Officer', 'emergency-services', 'pm-rebecca-chretien', 'pos-es', 'FILLED', NULL, '2026-04-01', 170, datetime('now'), datetime('now')),
  ('pos-cyber', 'Cyber Education Officer', 'it-systems', 'pm-tyler-thomas', 'pos-commander', 'FILLED', NULL, '2026-04-01', 180, datetime('now'), datetime('now')),
  ('pos-communications', 'Communications Officer', 'communications', 'pm-zachary-johnson', 'pos-commander', 'ACTING', 'Covering for 1st Lt. Eddie Burchell during leave.', '2026-04-01', 190, datetime('now'), datetime('now')),
  ('pos-testing', 'Testing Officer', 'professional-development', 'pm-annabelle-thomas', 'pos-dcs', 'FILLED', NULL, '2026-04-01', 200, datetime('now'), datetime('now')),
  ('pos-recruiting', 'Recruiting and Retention Officer', 'recruiting-retention', NULL, 'pos-commander', 'VACANT', NULL, '2026-04-01', 210, datetime('now'), datetime('now')),
  ('pos-suas', 'sUAS Officer', 'emergency-services', 'pm-rebecca-chretien', 'pos-es', 'FILLED', NULL, '2026-04-01', 220, datetime('now'), datetime('now')),
  ('pos-fundraising', 'Fundraising Officer', 'finance', 'pm-tonya-osborne', 'pos-finance', 'FILLED', 'Also assigned Assistant Finance Officer duties.', '2026-04-01', 230, datetime('now'), datetime('now')),
  ('pos-health', 'Health Services Officer', 'safety', 'pm-zachary-johnson', 'pos-commander', 'FILLED', NULL, '2026-04-01', 240, datetime('now'), datetime('now'));

INSERT INTO personnel_committees (id, name, source_date, display_order) VALUES
  ('committee-finance', 'Finance Committee', '2026-04-01', 10),
  ('committee-awards', 'Awards Committee', '2026-04-01', 20),
  ('committee-membership', 'Membership Committee', '2026-04-01', 30),
  ('committee-promotion', 'Promotion Committee', '2026-04-01', 40);

INSERT INTO personnel_committee_members (committee_id, personnel_member_id, committee_role, display_order) VALUES
  ('committee-finance', 'pm-steven-mellard', 'CHAIR', 10),
  ('committee-finance', 'pm-margaret-durgin', 'MEMBER', 20),
  ('committee-finance', 'pm-anthony-warthan', 'MEMBER', 30),
  ('committee-finance', 'pm-mel-osborne', 'MEMBER', 40),
  ('committee-finance', 'pm-clarence-juneau', 'MEMBER', 50),
  ('committee-awards', 'pm-margaret-durgin', 'CHAIR', 10),
  ('committee-awards', 'pm-tristan-maratos', 'MEMBER', 20),
  ('committee-awards', 'pm-anthony-warthan', 'MEMBER', 30),
  ('committee-membership', 'pm-steven-mellard', 'CHAIR', 10),
  ('committee-membership', 'pm-margaret-durgin', 'MEMBER', 20),
  ('committee-membership', 'pm-clarence-juneau', 'MEMBER', 30),
  ('committee-promotion', 'pm-clarence-juneau', 'CHAIR', 10),
  ('committee-promotion', 'pm-rebecca-chretien', 'MEMBER', 20),
  ('committee-promotion', 'pm-margaret-durgin', 'MEMBER', 30);

UPDATE personnel_members
SET user_id = (
  SELECT users.id
  FROM users
  WHERE lower(trim(users.full_name)) = lower(trim(personnel_members.full_name))
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1
  FROM users
  WHERE lower(trim(users.full_name)) = lower(trim(personnel_members.full_name))
);
