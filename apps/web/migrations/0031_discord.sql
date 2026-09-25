-- Reading the squadron's Discord for work that was agreed in conversation.
--
-- Things get decided in Discord and never written down: "can you take care of this", "we need to do this
-- before the 15th". The Hub can read a channel and offer to make a task of it, the same way it already
-- reads labelled mail - and with the same rule, that nothing is created until a person says so.
--
-- One channel at a time, chosen deliberately. A bot that can read a server can read everything in it, and
-- "the Hub is listening" is a thing the squadron should be able to point at a channel and say yes to,
-- rather than something that quietly applies everywhere.
CREATE TABLE IF NOT EXISTS discord_channels (
  id TEXT PRIMARY KEY,
  -- Discord's own ids, kept as text because they are 64-bit and JSON is not to be trusted with those.
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL UNIQUE,
  channel_name TEXT NOT NULL,
  -- Nothing is read until somebody turns it on.
  watching INTEGER NOT NULL DEFAULT 0,
  -- Where the last read stopped, so the same message is never considered twice.
  last_message_id TEXT,
  last_checked_at TEXT,
  added_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS discord_channels_watching ON discord_channels(watching);

-- What the Hub thinks somebody agreed to do, with the message it came from so the claim can be checked.
CREATE TABLE IF NOT EXISTS discord_suggestions (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL UNIQUE,
  author TEXT,
  said TEXT NOT NULL,
  -- A link straight to the message in Discord, so somebody can read the whole exchange.
  permalink TEXT,
  title TEXT NOT NULL,
  due_on TEXT,
  -- The words in the message that made the Hub think there was something to do. Quoted, never paraphrased.
  because TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ADDED', 'DISMISSED')),
  item_id TEXT,
  created_at TEXT NOT NULL,
  settled_at TEXT
);

CREATE INDEX IF NOT EXISTS discord_suggestions_open ON discord_suggestions(status, created_at);
