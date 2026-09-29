-- What each senior member has done, as CAP records it.
--
-- The extract holds far more than the roster: safety briefings, courses completed, achievements, awards, and
-- the emergency services task qualifications that decide who may actually do what on a mission. All of it is
-- about adults, all of it is the member's own record of service, and none of it is sensitive in the way the
-- columns this Hub refuses are sensitive.
--
-- What is deliberately NOT here, having looked at every one of the sixty-three tables:
--
--   MbrAddresses        home addresses
--   MbrContact          telephone numbers and email, including cadets' parents
--   MbrChars            emergency notification numbers
--   CadetHFZInformation 447 rows of minors' fitness measurements and medical waivers
--   CadetAchv           mile run, push-ups, curl-ups, sit and reach - children's body performance
--   AttendanceLogGuest  visitors' phone numbers and email addresses
--   Member.txt          social security number, date of birth, gender, ethnicity, citizenship
--
-- Those are not omitted for tidiness. The unit's CAPWATCH request and its security attestation both say the
-- Hub does not hold them, and a table that could hold them is how that stops being true one afternoon when
-- somebody is adding a feature.
--
-- One shape for all four kinds, because they are the same fact - this member did this thing, on this date,
-- and it may expire - and four near-identical tables would only mean writing the same query four times.
CREATE TABLE IF NOT EXISTS member_records (
  capid TEXT NOT NULL,

  -- SAFETY:      the monthly safety briefing, which expires and is a compliance item
  -- TRAINING:    a course completed
  -- ACHIEVEMENT: a CAP achievement, including the professional development milestones
  -- AWARD:       a senior member award
  -- TASK:        an emergency services task qualification
  kind TEXT NOT NULL CHECK (kind IN ('SAFETY', 'TRAINING', 'ACHIEVEMENT', 'AWARD', 'TASK')),

  -- CAP's own identifier for the thing, which is what makes a record stable across syncs when the name of
  -- an achievement is reworded.
  code TEXT NOT NULL,
  title TEXT,
  functional_area TEXT,

  completed_on TEXT,
  -- CAP writes 01/01/1900 for "never expires", which is stored as null rather than as a date in the past
  -- that would make everything look lapsed.
  expires_on TEXT,
  status TEXT,

  source TEXT NOT NULL DEFAULT 'CAPWATCH',
  updated_at TEXT NOT NULL,

  PRIMARY KEY (capid, kind, code)
);

CREATE INDEX IF NOT EXISTS member_records_kind ON member_records(kind, capid);
-- Safety currency is asked as "who has lapsed", so the expiry is worth an index of its own.
CREATE INDEX IF NOT EXISTS member_records_expiry ON member_records(kind, expires_on);
