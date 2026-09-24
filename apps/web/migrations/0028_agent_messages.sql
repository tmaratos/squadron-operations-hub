-- Where an agent speaks when nobody asked it to.
--
-- Until now an agent only existed inside a conversation somebody started, which makes it a better prompt
-- box and nothing more. An agent that watches a list has to be able to say "three of these are overdue and
-- two have no owner" without waiting to be asked - and that means somewhere for it to say it, per member,
-- with a record of whether they have read it.
--
-- This is also what an unread count counts. A badge with nothing behind it is decoration.
CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  -- Who it is for. An agent watching a shared list reports to everybody who can see it, and each of them
  -- reads it in their own time.
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  -- Somewhere to go when it is about something in particular.
  url TEXT,
  -- What the run was looking at, so the same finding is not reported twice in a day.
  dedupe_key TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES ai_agents(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS agent_messages_unread ON agent_messages(user_id, read_at, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS agent_messages_once ON agent_messages(agent_id, user_id, dedupe_key);

-- How often an agent looks, and when it last did. NULL schedule means it never runs on its own: it only
-- answers when spoken to, which stays the default because an agent that acts unasked is a decision.
ALTER TABLE ai_agents ADD COLUMN schedule TEXT;
ALTER TABLE ai_agents ADD COLUMN last_run_at TEXT;
