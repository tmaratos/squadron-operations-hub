-- Saved assistant conversations, one set per member.
-- Deleting a conversation only removes the chat record. Work the assistant already created (tasks, lists, dashboard cards)
-- stays exactly where it is, and History keeps the record of who approved it.
CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ai_conversations_user ON ai_conversations(user_id, updated_at);

CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  plan_json TEXT,
  applied_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ai_messages_conversation ON ai_messages(conversation_id, created_at);
