-- Where each member stands, and what would move them forward.
--
-- Two things the Hub could not answer before: who holds which duty position, and how far along each member
-- is in professional development. CAPWATCH would carry both, but squadron accounts are not granted it, so
-- this is filled the way the roster was - pasted from what eServices already shows, or set by hand.
CREATE TABLE IF NOT EXISTS member_development (
  capid TEXT PRIMARY KEY,
  duty_position TEXT,
  -- Level as CAP writes it: I, II, III, IV, V. NULL means nobody has told the Hub.
  pd_level TEXT,
  specialty_track TEXT,
  -- TECHNICIAN, SENIOR or MASTER within that track.
  track_rating TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('ESERVICES', 'MANUAL')),
  updated_by TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS member_development_position ON member_development(duty_position);

-- What it takes to reach the next level. Like the duties catalogue, every step carries the words it came
-- from and waits for a person to confirm it, because a professional development requirement invented by a
-- model is a member sent down the wrong path for months.
CREATE TABLE IF NOT EXISTS development_steps (
  id TEXT PRIMARY KEY,
  from_level TEXT NOT NULL,
  to_level TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  source_citation TEXT,
  source_quote TEXT,
  confidence TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (confidence IN ('UNVERIFIED', 'CONFIRMED', 'REJECTED')),
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS development_steps_from ON development_steps(from_level, confidence);

-- Which prompt has already been put in front of which member, so the Hub nudges once rather than daily.
CREATE TABLE IF NOT EXISTS development_prompts (
  id TEXT PRIMARY KEY,
  capid TEXT NOT NULL,
  step_id TEXT NOT NULL,
  item_id TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS development_prompts_once ON development_prompts(capid, step_id);
