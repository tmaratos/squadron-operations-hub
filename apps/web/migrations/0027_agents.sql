-- Assistants a squadron can keep, rather than one assistant everybody re-explains themselves to.
--
-- The Hub already had conversations, but every one of them started from nothing: a member who wanted the
-- same help twice had to describe the job twice. An agent is that description, kept - a name, what it is
-- for, and standing instructions that go in front of everything it is asked.
--
-- Shared or personal is decided by owner_user_id. NULL means the whole squadron can see and use it, which
-- is how a squadron keeps one Compliance assistant rather than eleven private ones that disagree.
CREATE TABLE IF NOT EXISTS ai_agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- One line, shown beside the name, so somebody can tell what it is for without opening it.
  purpose TEXT,
  -- The standing instructions. Put in front of every request this agent is given.
  brief TEXT,
  emoji TEXT NOT NULL DEFAULT '🤖',
  -- NULL: shared with the squadron. Otherwise the member whose agent it is.
  owner_user_id TEXT,
  -- Optionally tied to somewhere, so it can be offered where it is relevant rather than everywhere.
  scope_type TEXT CHECK (scope_type IS NULL OR scope_type IN ('list', 'space')),
  scope_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ai_agents_owner ON ai_agents(owner_user_id, name);

-- Which agent a conversation is with. Conversations that predate agents keep working with none.
ALTER TABLE ai_conversations ADD COLUMN agent_id TEXT;
