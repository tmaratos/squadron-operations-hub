import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { listGuildTextChannels, discordConfigured } from "@/lib/discord/discord-api";
import { linkDiscordChannel, listLinkedChannels, unlinkDiscordChannel } from "@/lib/discord/repository";
import { recordAuditEvent } from "@/lib/db/audit";
import { assertSameOrigin } from "@/lib/security/origin";

const schema = z.object({
  action: z.enum(["link", "unlink"]),
  channelId: z.string().regex(/^\d{16,22}$/),
  displayName: z.string().trim().min(1).max(100).optional(),
  purpose: z.enum(["STAFF", "ANNOUNCEMENTS", "CADET_STAFF", "PARENTS", "LOGISTICS", "OTHER"]).default("OTHER")
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  if (!discordConfigured()) return NextResponse.json({ configured: false, available: [], linked: [] });
  try {
    const [available, linked] = await Promise.all([listGuildTextChannels(), listLinkedChannels()]);
    return NextResponse.json({ configured: true, available, linked });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Discord channels could not be loaded." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getCurrentUser();
    if (!actor || !["SYSTEM_OWNER", "ADMINISTRATOR"].includes(actor.globalRole)) {
      return NextResponse.json({ message: "Administrator access is required." }, { status: 403 });
    }
    const input = schema.parse(await request.json());
    if (input.action === "link") {
      const available = await listGuildTextChannels();
      const channel = available.find((item) => item.id === input.channelId);
      if (!channel) return NextResponse.json({ message: "That channel is not available to this bot." }, { status: 404 });
      await linkDiscordChannel({ channelId: channel.id, displayName: input.displayName || channel.name, purpose: input.purpose, actorId: actor.id });
      await recordAuditEvent({ actorUserId: actor.id, action: "DISCORD_CHANNEL_LINKED", entityType: "discord_channel", entityId: channel.id, summary: `${actor.fullName} linked #${channel.name}` });
    } else {
      await unlinkDiscordChannel(input.channelId);
      await recordAuditEvent({ actorUserId: actor.id, action: "DISCORD_CHANNEL_UNLINKED", entityType: "discord_channel", entityId: input.channelId, summary: `${actor.fullName} unlinked a Discord channel` });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "The channel request is invalid." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "The Discord channel could not be updated." }, { status: 500 });
  }
}
