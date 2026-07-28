CREATE TABLE IF NOT EXISTS discord_channels (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'OTHER',
  is_active INTEGER NOT NULL DEFAULT 1,
  linked_by TEXT NOT NULL,
  linked_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (linked_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS discord_channels_active
ON discord_channels(is_active, display_name);

CREATE TABLE IF NOT EXISTS discord_message_audit (
  id TEXT PRIMARY KEY,
  discord_message_id TEXT NOT NULL UNIQUE,
  channel_id TEXT NOT NULL,
  sent_by TEXT NOT NULL,
  content_preview TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  FOREIGN KEY (channel_id) REFERENCES discord_channels(channel_id),
  FOREIGN KEY (sent_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS discord_message_audit_sent
ON discord_message_audit(sent_at DESC);
