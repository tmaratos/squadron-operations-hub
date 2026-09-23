-- What a member asked the Hub to do that it genuinely could not do.
--
-- This exists so the assistant never has to pretend. When someone asks for something outside what the Hub
-- can build - a new kind of page, an integration that is not connected, anything needing real code - it says
-- so plainly and records the ask here, where the people who maintain the Hub can see what is actually wanted.
CREATE TABLE IF NOT EXISTS capability_requests (
  id TEXT PRIMARY KEY,
  asked_by TEXT NOT NULL,
  request TEXT NOT NULL,
  -- What the assistant understood, in its own words, so a half-remembered ask is still actionable later.
  interpretation TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PLANNED', 'BUILT', 'DECLINED')),
  note TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (asked_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS capability_requests_open ON capability_requests(status, created_at DESC);

-- A record of what the assistant built, so anything it did can be found and undone by hand.
CREATE TABLE IF NOT EXISTS ai_build_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  step_type TEXT NOT NULL,
  label TEXT NOT NULL,
  target_kind TEXT,
  target_id TEXT,
  ok INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_build_log_recent ON ai_build_log(created_at DESC);
