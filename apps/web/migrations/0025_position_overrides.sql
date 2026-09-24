-- Being able to disagree with the staff chart.
--
-- Duty positions come from the staff records the squadron already keeps, which were entered in April 2026
-- and will go stale the moment somebody changes jobs. An override existed, but there was no way to say
-- "that record is simply wrong, ignore it" - so an out-of-date position kept coming back, and a position
-- drives who gets that job's recurring work.
ALTER TABLE member_development ADD COLUMN ignore_source INTEGER NOT NULL DEFAULT 0;

-- Settings that belong to the squadron rather than to a member.
CREATE TABLE IF NOT EXISTS hub_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL
);
