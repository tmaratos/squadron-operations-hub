import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { listDiscordMessages, sendDiscordMessage } from "@/lib/discord/discord-api";
import { findLinkedChannel, recordDiscordMessage } from "@/lib/discord/repository";
import { recordAuditEvent } from "@/lib/db/audit";
import { assertSameOrigin } from "@/lib/security/origin";

const sendSchema = z.object({
  channelId: z.string().regex(/^\d{16,22}$/),
  content: z.string().trim().min(1).max(1800)
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  const channelId = new URL(request.url).searchParams.get("channelId") ?? "";
  if (!/^\d{16,22}$/.test(channelId) || !(await findLinkedChannel(channelId))) {
    return NextResponse.json({ message: "Choose a linked Discord channel." }, { status: 400 });
  }
  try {
    return NextResponse.json({ messages: await listDiscordMessages(channelId) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Discord messages could not be loaded." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getCurrentUser();
    if (!actor || actor.globalRole === "READ_ONLY") {
      return NextResponse.json({ message: "You are not authorized to send messages." }, { status: 403 });
    }
    const input = sendSchema.parse(await request.json());
    const channel = await findLinkedChannel(input.channelId);
    if (!channel) return NextResponse.json({ message: "That Discord channel is not linked." }, { status: 403 });
    const message = await sendDiscordMessage(channel.channelId, input.content);
    await recordDiscordMessage({ messageId: message.id, channelId: channel.channelId, actorId: actor.id, content: input.content });
    await recordAuditEvent({
      actorUserId: actor.id,
      action: "DISCORD_MESSAGE_SENT",
      entityType: "discord_message",
      entityId: message.id,
      summary: `${actor.fullName} sent a message to #${channel.displayName}`,
      metadata: { channelId: channel.channelId }
    });
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "Enter a message up to 1,800 characters." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "The Discord message could not be sent." }, { status: 502 });
  }
}
