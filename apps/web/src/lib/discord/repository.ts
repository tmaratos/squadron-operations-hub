import { getCloudflareEnv, getDatabase } from "@/lib/cloudflare";

export interface LinkedChannel {
  id: string;
  guildId: string;
  channelId: string;
  displayName: string;
  purpose: string;
  isActive: boolean;
}

interface ChannelRow {
  id: string;
  guild_id: string;
  channel_id: string;
  display_name: string;
  purpose: string;
  is_active: number;
}

export async function listLinkedChannels(): Promise<LinkedChannel[]> {
  const result = await getDatabase().prepare("SELECT * FROM discord_channels WHERE is_active = 1 ORDER BY display_name").all<ChannelRow>();
  return result.results.map(mapChannel);
}

export async function findLinkedChannel(channelId: string): Promise<LinkedChannel | null> {
  const row = await getDatabase().prepare("SELECT * FROM discord_channels WHERE channel_id = ? AND is_active = 1").bind(channelId).first<ChannelRow>();
  return row ? mapChannel(row) : null;
}

export async function linkDiscordChannel(input: { channelId: string; displayName: string; purpose: string; actorId: string }): Promise<void> {
  const guildId = getCloudflareEnv().DISCORD_GUILD_ID;
  if (!guildId) throw new Error("Discord guild is not configured.");
  const now = new Date().toISOString();
  await getDatabase().prepare(
    `INSERT INTO discord_channels (id, guild_id, channel_id, display_name, purpose, is_active, linked_by, linked_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
     ON CONFLICT(channel_id) DO UPDATE SET display_name = excluded.display_name, purpose = excluded.purpose,
     is_active = 1, linked_by = excluded.linked_by, updated_at = excluded.updated_at`
  ).bind(crypto.randomUUID(), guildId, input.channelId, input.displayName, input.purpose, input.actorId, now, now).run();
}

export async function unlinkDiscordChannel(channelId: string): Promise<void> {
  await getDatabase().prepare("UPDATE discord_channels SET is_active = 0, updated_at = ? WHERE channel_id = ?").bind(new Date().toISOString(), channelId).run();
}

export async function recordDiscordMessage(input: { messageId: string; channelId: string; actorId: string; content: string }): Promise<void> {
  await getDatabase().prepare(
    `INSERT INTO discord_message_audit (id, discord_message_id, channel_id, sent_by, content_preview, sent_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), input.messageId, input.channelId, input.actorId, input.content.slice(0, 180), new Date().toISOString()).run();
}

function mapChannel(row: ChannelRow): LinkedChannel {
  return { id: row.id, guildId: row.guild_id, channelId: row.channel_id, displayName: row.display_name, purpose: row.purpose, isActive: row.is_active === 1 };
}
