import { aiChatFor } from "@/lib/ai/provider";
import { parseJsonReply } from "@/lib/ai/local";
import { getDatabase } from "@/lib/cloudflare";
import { listChannels, permalinkFor, readSince, type DiscordMessage } from "./client";

// Turning what was said in Discord into something the squadron can act on.
//
// The useful cases are the ones that never get written down: "Tristan can you take care of this",
// "we need this before the 15th". The Hub offers; a person decides. Nothing is created on its own.

export interface DiscordSuggestion {
  id: string;
  channelName: string;
  author: string | null;
  title: string;
  dueOn: string | null;
  because: string | null;
  permalink: string | null;
  said: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function listWatchable(): Promise<Array<{ channelId: string; name: string; watching: boolean }>> {
  const db = getDatabase();
  const live = await listChannels();
  let held: Array<{ channel_id: string; watching: number }> = [];
  try {
    const rows = await db.prepare("SELECT channel_id, watching FROM discord_channels").all<{ channel_id: string; watching: number }>();
    held = rows.results;
  } catch { /* the table is not there yet */ }

  const watching = new Map(held.map((row) => [row.channel_id, Boolean(row.watching)]));
  return live.map((channel) => ({ channelId: channel.id, name: channel.name, watching: watching.get(channel.id) ?? false }));
}

export async function setWatching(input: { guildId: string; channelId: string; channelName: string; watching: boolean; userId: string }): Promise<void> {
  const db = getDatabase();
  const now = nowIso();
  await db
    .prepare(
      "INSERT INTO discord_channels (id, guild_id, channel_id, channel_name, watching, added_by, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(channel_id) DO UPDATE SET watching = excluded.watching, channel_name = excluded.channel_name, updated_at = excluded.updated_at"
    )
    .bind(crypto.randomUUID(), input.guildId, input.channelId, input.channelName, input.watching ? 1 : 0, input.userId, now, now)
    .run();
}

/**
 * Reads the watched channels and keeps anything that looks like work somebody agreed to.
 *
 * Deliberately conservative. Most of a squadron's Discord is conversation, and a suggestion for every
 * message would be worse than none: people would turn it off within a day.
 */
export async function readDiscord(userId: string): Promise<number> {
  const db = getDatabase();
  let channels: Array<{ channel_id: string; channel_name: string; last_message_id: string | null }> = [];
  try {
    const rows = await db
      .prepare("SELECT channel_id, channel_name, last_message_id FROM discord_channels WHERE watching = 1")
      .all<{ channel_id: string; channel_name: string; last_message_id: string | null }>();
    channels = rows.results;
  } catch {
    return 0;
  }
  if (!channels.length) return 0;

  let kept = 0;
  for (const channel of channels) {
    let messages: DiscordMessage[] = [];
    try {
      messages = await readSince(channel.channel_id, channel.last_message_id, 30);
    } catch {
      continue; // one unreadable channel does not stop the others
    }
    if (!messages.length) continue;

    for (const message of messages) {
      const suggestion = await judge(userId, message, channel.channel_name);
      if (suggestion) {
        try {
          await db
            .prepare(
              "INSERT OR IGNORE INTO discord_suggestions (id, channel_id, message_id, author, said, permalink, title, due_on, because, status, created_at) " +
              "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)"
            )
            .bind(
              crypto.randomUUID(),
              channel.channel_id,
              message.id,
              message.authorName,
              message.content.slice(0, 1000),
              permalinkFor(channel.channel_id, message.id),
              suggestion.title,
              suggestion.dueOn,
              suggestion.because,
              nowIso()
            )
            .run();
          kept += 1;
        } catch { /* already kept */ }
      }
    }

    // Marked read whether or not anything was kept, so the same messages are not judged twice.
    await db
      .prepare("UPDATE discord_channels SET last_message_id = ?, last_checked_at = ? WHERE channel_id = ?")
      .bind(messages[messages.length - 1].id, nowIso(), channel.channel_id)
      .run();
  }

  return kept;
}

async function judge(userId: string, message: DiscordMessage, channelName: string): Promise<{ title: string; dueOn: string | null; because: string } | null> {
  // Not worth a model call: a message too short to contain a commitment.
  if (message.content.trim().length < 20) return null;

  const system = [
    "You read one message from a Civil Air Patrol squadron's Discord and decide whether it contains work somebody has to do.",
    "Most messages do not. Chat, thanks, reactions, questions already answered, and discussion with no commitment are all not actionable.",
    "Actionable means somebody asked for something to be done, agreed to do something, or named a deadline.",
    'Reply with JSON only: {"actionable": true|false, "title": "...", "dueOn": "YYYY-MM-DD" or null, "because": "<an exact quote from the message>"}.',
    "- title is what a person must DO, in plain words, starting with a verb.",
    "- because must be words copied exactly from the message. Never paraphrase and never invent.",
    "- dueOn only when a date is actually stated. Never guess one.",
    "Today is " + new Date().toISOString().slice(0, 10) + "."
  ].join("\n");

  try {
    const raw = await aiChatFor(userId, [
      { role: "system", content: system },
      { role: "user", content: "Channel #" + channelName + "\n" + message.authorName + " said:\n" + message.content.slice(0, 1500) }
    ], { json: true, maxTokens: 220 });

    const parsed = parseJsonReply<{ actionable?: unknown; title?: unknown; dueOn?: unknown; because?: unknown }>(raw, {});
    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    if (parsed.actionable !== true || title.length < 3) return null;

    // The quote has to be in the message. A model that invents its evidence is worse than one that says
    // nothing, because the evidence is the only reason to believe the rest of it.
    const because = typeof parsed.because === "string" ? parsed.because.trim() : "";
    if (!because || !message.content.toLowerCase().includes(because.toLowerCase().slice(0, 40))) return null;

    const dueOn = typeof parsed.dueOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dueOn) ? parsed.dueOn : null;
    return { title: title.slice(0, 200), dueOn, because: because.slice(0, 300) };
  } catch {
    return null;
  }
}

export async function openDiscordSuggestions(limit = 6): Promise<DiscordSuggestion[]> {
  try {
    const rows = await getDatabase()
      .prepare(
        "SELECT s.id, s.author, s.title, s.due_on, s.because, s.permalink, s.said, c.channel_name " +
        "FROM discord_suggestions s LEFT JOIN discord_channels c ON c.channel_id = s.channel_id " +
        "WHERE s.status = 'OPEN' ORDER BY s.created_at DESC LIMIT ?"
      )
      .bind(limit)
      .all<Record<string, unknown>>();
    return rows.results.map((row) => ({
      id: row.id as string,
      channelName: (row.channel_name as string) ?? "a channel",
      author: (row.author as string | null) ?? null,
      title: row.title as string,
      dueOn: (row.due_on as string | null) ?? null,
      because: (row.because as string | null) ?? null,
      permalink: (row.permalink as string | null) ?? null,
      said: row.said as string
    }));
  } catch {
    return [];
  }
}

export async function settleDiscordSuggestion(id: string, status: "ADDED" | "DISMISSED", itemId?: string | null): Promise<void> {
  await getDatabase()
    .prepare("UPDATE discord_suggestions SET status = ?, item_id = ?, settled_at = ? WHERE id = ?")
    .bind(status, itemId ?? null, nowIso(), id)
    .run();
}
