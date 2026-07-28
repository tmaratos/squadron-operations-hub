import { getCloudflareEnv } from "@/lib/cloudflare";

const API = "https://discord.com/api/v10";

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  parent_id?: string | null;
  position?: number;
}

export interface DiscordMessage {
  id: string;
  content: string;
  timestamp: string;
  author: { id: string; username: string; global_name?: string | null; avatar?: string | null };
}

export function discordConfigured(): boolean {
  const env = getCloudflareEnv();
  return Boolean(env.DISCORD_BOT_TOKEN && env.DISCORD_GUILD_ID);
}

export async function listGuildTextChannels(): Promise<DiscordChannel[]> {
  const env = requiredDiscordEnv();
  const channels = await discordJson<DiscordChannel[]>(`/guilds/${env.guildId}/channels`);
  const allowed = allowedChannelIds();
  return channels
    .filter((channel) => channel.type === 0 || channel.type === 5)
    .filter((channel) => !allowed.size || allowed.has(channel.id))
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
}

export async function listDiscordMessages(channelId: string): Promise<DiscordMessage[]> {
  assertAllowedChannel(channelId);
  return discordJson<DiscordMessage[]>(`/channels/${encodeURIComponent(channelId)}/messages?limit=25`);
}

export async function sendDiscordMessage(channelId: string, content: string): Promise<DiscordMessage> {
  assertAllowedChannel(channelId);
  return discordJson<DiscordMessage>(`/channels/${encodeURIComponent(channelId)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } })
  });
}

function requiredDiscordEnv() {
  const env = getCloudflareEnv();
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) throw new Error("Discord is not configured.");
  return { token: env.DISCORD_BOT_TOKEN, guildId: env.DISCORD_GUILD_ID };
}

function allowedChannelIds(): Set<string> {
  return new Set((getCloudflareEnv().DISCORD_ALLOWED_CHANNEL_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
}

function assertAllowedChannel(channelId: string) {
  const allowed = allowedChannelIds();
  if (allowed.size && !allowed.has(channelId)) throw new Error("That Discord channel is not allowed.");
}

async function discordJson<T>(path: string, init?: RequestInit): Promise<T> {
  const { token } = requiredDiscordEnv();
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bot ${token}`, ...(init?.headers ?? {}) }
  });
  if (!response.ok) throw new Error(`Discord request failed (${response.status}).`);
  return response.json() as Promise<T>;
}
