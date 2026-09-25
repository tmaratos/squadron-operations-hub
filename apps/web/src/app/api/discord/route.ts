import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { recordAuditEvent } from "@/lib/db/audit";
import { assertSameOrigin } from "@/lib/security/origin";
import { isDiscordConfigured } from "@/lib/discord/client";
import { listWatchable, openDiscordSuggestions, readDiscord, setWatching, settleDiscordSuggestion } from "@/lib/discord/suggestions";
import { createItem, updateItem } from "@/lib/work/items";

// Which Discord channels the Hub reads, and what it found there.

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("watch"),
    channelId: z.string().trim().min(1).max(40),
    channelName: z.string().trim().min(1).max(120),
    watching: z.boolean()
  }),
  z.object({ action: z.literal("read") }),
  z.object({
    action: z.literal("add"),
    id: z.string().trim().min(1).max(80),
    listId: z.string().trim().min(1).max(80)
  }),
  z.object({ action: z.literal("dismiss"), id: z.string().trim().min(1).max(80) })
]);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  if (!isDiscordConfigured()) {
    return NextResponse.json({ configured: false, channels: [], suggestions: [] });
  }
  try {
    return NextResponse.json({
      configured: true,
      channels: await listWatchable(),
      suggestions: await openDiscordSuggestions()
    });
  } catch (error) {
    return NextResponse.json({
      configured: true,
      channels: [],
      suggestions: await openDiscordSuggestions().catch(() => []),
      message: error instanceof Error ? error.message : "Discord could not be read."
    });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (user.globalRole === "READ_ONLY") {
      return NextResponse.json({ message: "Read-only accounts cannot change this." }, { status: 403 });
    }
    if (!isDiscordConfigured()) {
      return NextResponse.json({ message: "Discord is not connected yet." }, { status: 400 });
    }

    const input = schema.parse(await request.json());
    const env = getCloudflareEnv() as unknown as { DISCORD_GUILD_ID?: string };

    if (input.action === "watch") {
      await setWatching({
        guildId: env.DISCORD_GUILD_ID ?? "",
        channelId: input.channelId,
        channelName: input.channelName,
        watching: input.watching,
        userId: user.id
      });
      await recordAuditEvent({
        actorUserId: user.id,
        action: input.watching ? "DISCORD_CHANNEL_WATCHED" : "DISCORD_CHANNEL_UNWATCHED",
        entityType: "discord_channel",
        entityId: input.channelId,
        summary: user.fullName + (input.watching ? " had the Hub start reading #" : " had the Hub stop reading #") + input.channelName,
        metadata: { channelName: input.channelName }
      });
      return NextResponse.json({ channels: await listWatchable(), message: input.watching ? "Reading #" + input.channelName + "." : "Stopped reading #" + input.channelName + "." });
    }

    if (input.action === "read") {
      const kept = await readDiscord(user.id);
      return NextResponse.json({
        suggestions: await openDiscordSuggestions(),
        message: kept ? kept + " thing" + (kept === 1 ? "" : "s") + " worth looking at." : "Nothing in there that looked like work."
      });
    }

    if (input.action === "dismiss") {
      await settleDiscordSuggestion(input.id, "DISMISSED");
      return NextResponse.json({ suggestions: await openDiscordSuggestions(), message: "Left alone." });
    }

    // Making the task is the only thing that changes the squadron's work, and only on this button.
    const open = await openDiscordSuggestions(50);
    const found = open.find((entry) => entry.id === input.id);
    if (!found) return NextResponse.json({ message: "That suggestion is gone." }, { status: 404 });

    const itemId = await createItem({ listId: input.listId, title: found.title, userId: user.id });
    await updateItem(itemId, {
      dueOn: found.dueOn ?? null,
      description:
        "From Discord, #" + found.channelName + (found.author ? ", " + found.author : "") + ".\n\n" +
        (found.because ? "They said: \u201c" + found.because + "\u201d\n\n" : "") +
        (found.permalink ? found.permalink : "")
    });
    await settleDiscordSuggestion(input.id, "ADDED", itemId);

    return NextResponse.json({
      suggestions: await openDiscordSuggestions(),
      itemId,
      message: "Added \u201c" + found.title.slice(0, 50) + "\u201d."
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That request was not valid." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "That could not be done." }, { status: 500 });
  }
}
