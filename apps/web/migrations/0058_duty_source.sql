-- Which duty assignments CAP owns, so a corrected sync can replace them.
--
-- The reconciler inserted duty positions with ON CONFLICT DO NOTHING, which meant a row written from a wrong
-- reading stayed wrong for ever: re-syncing could add what was missing but could never take back a duty filed
-- under the wrong section. That is how four communications officers came to sit under Command and stay there.
--
-- With a source, a sync can clear what it wrote last time and write it again from scratch, while anything a
-- person entered by hand is left alone - which is the distinction that was missing.
ALTER TABLE duty_assignments ADD COLUMN source TEXT NOT NULL DEFAULT 'MANUAL';

-- Every row presently in this table was written by the first CAPWATCH sync, on 29 September 2026, and none by
-- hand - checked before writing this, rather than assumed. Marking them lets the next sync correct them.
UPDATE duty_assignments SET source = 'CAPWATCH';

CREATE INDEX IF NOT EXISTS duty_assignments_source ON duty_assignments(source);
