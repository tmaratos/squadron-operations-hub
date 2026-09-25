import { getCloudflareEnv } from "@/lib/cloudflare";

// Talking to Discord as the squadron's bot.
//
// A bot, not a member's account: Discord's user OAuth can tell you who somebody is and which servers they
// are in, but the scope that reads messages only works inside the desktop client's local connection, not
// over the API. Reading a channel means a bot that has been invited to the server and given permission to
// see that channel.
//
// The token is a Cloudflare secret. It is never asked for in the app, never stored in the database, and
// never sent to the browser.

const API = "https://discord.com/api/v10";

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
}

export interface DiscordMessage {
  id: string;
  content: string;
  authorName: string;
  authorId: string;
  isBot: boolean;
  timestamp: string;
}

export function isDiscordConfigured(): boolean {
  const env = getCloudflareEnv() as unknown as { DISCORD_BOT_TOKEN?: string; DISCORD_GUILD_ID?: string };
  return Boolean(env.DISCORD_BOT_TOKEN && env.DISCORD_GUILD_ID);
}

function credentials(): { token: string; guildId: string } {
  const env = getCloudflareEnv() as unknown as { DISCORD_BOT_TOKEN?: string; DISCORD_GUILD_ID?: string };
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) {
    throw new Error("Discord is not connected. The bot token and server id are not set.");
  }
  return { token: env.DISCORD_BOT_TOKEN, guildId: env.DISCORD_GUILD_ID };
}

async function call<T>(path: string): Promise<T> {
  const { token } = credentials();
  const response = await fetch(API + path, {
    headers: { Authorization: "Bot " + token, "User-Agent": "TN170-Operations-Hub (squadron, 1.0)" }
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // Say which of the several ordinary causes it is, rather than "Discord refused".
    if (response.status === 401) throw new Error("Discord rejected the bot token.");
    if (response.status === 403) throw new Error("The bot is in the server but cannot see that channel. Give it View Channel and Read Message History.");
    if (response.status === 404) throw new Error("That channel is not there, or the bot is not in the server.");
    if (response.status === 429) throw new Error("Discord asked us to slow down. It will be read on the next run.");
    throw new Error("Discord returned " + response.status + (detail ? ": " + detail.slice(0, 160) : ""));
  }

  return (await response.json()) as T;
}

/** The text channels the bot can see. Voice and category entries are left out. */
export async function listChannels(): Promise<DiscordChannel[]> {
  const { guildId } = credentials();
  const rows = await call<Array<{ id: string; name: string; type: number }>>("/guilds/" + guildId + "/channels");
  // 0 is a text channel, 5 an announcement channel, 15 a forum. Nothing else holds a conversation.
  return rows
    .filter((row) => [0, 5, 15].includes(row.type))
    .map((row) => ({ id: row.id, name: row.name, type: row.type }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Messages posted since the one given, oldest first.
 *
 * Bots are skipped, including this squadron's own: the Hub reporting something and then offering to make
 * a task of its own report is a loop nobody asked for.
 */
export async function readSince(channelId: string, afterMessageId: string | null, limit = 30): Promise<DiscordMessage[]> {
  const query = "?limit=" + Math.min(limit, 100) + (afterMessageId ? "&after=" + afterMessageId : "");
  const rows = await call<Array<{
    id: string;
    content: string;
    timestamp: string;
    author: { id: string; username: string; global_name?: string | null; bot?: boolean };
  }>>("/channels/" + channelId + "/messages" + query);

  return rows
    .map((row) => ({
      id: row.id,
      content: row.content ?? "",
      authorName: row.author.global_name || row.author.username,
      authorId: row.author.id,
      isBot: Boolean(row.author.bot),
      timestamp: row.timestamp
    }))
    .filter((message) => !message.isBot && message.content.trim().length > 0)
    .sort((left, right) => (left.id > right.id ? 1 : -1));
}

export function permalinkFor(channelId: string, messageId: string): string {
  const { guildId } = credentials();
  return "https://discord.com/channels/" + guildId + "/" + channelId + "/" + messageId;
}
