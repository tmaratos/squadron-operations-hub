-- The people who help hold a position.
--
-- A CAP position has an officer in charge and, very often, assistants: an Aerospace Education Officer with
-- somebody helping run AEX, a Safety Officer with an assistant who covers the briefings. The chart recorded
-- one name per position, so the assistants were invisible - and worse, work routed to a functional area
-- reached one person who might be away, when two others were already doing the job.
--
-- Kept beside the position rather than inside it. The officer in charge is still the incumbent on the
-- position itself, which is the thing CAP paperwork asks for; this is who else holds it with them.
CREATE TABLE IF NOT EXISTS position_assistants (
  id TEXT PRIMARY KEY,
  position_id TEXT NOT NULL,
  personnel_member_id TEXT NOT NULL,
  -- What they are called, where it is not simply "Assistant". "Assistant AEO", "Deputy", "Trainee".
  role_title TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (position_id, personnel_member_id),
  FOREIGN KEY (position_id) REFERENCES personnel_positions(id) ON DELETE CASCADE,
  FOREIGN KEY (personnel_member_id) REFERENCES personnel_members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS position_assistants_position ON position_assistants(position_id);
