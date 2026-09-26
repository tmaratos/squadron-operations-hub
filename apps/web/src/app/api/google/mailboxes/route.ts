import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/origin";
import { recordAuditEvent } from "@/lib/db/audit";
import { accessTokenFor, listMailAccounts, removeMailAccount } from "@/lib/google/mail-accounts";
import { listMailForToken } from "@/lib/google/gmail";
import { listMicrosoftMail } from "@/lib/microsoft/graph";

// Adding a mailbox is an OAuth round trip and lives in the auth routes. This is the other half: listing
// what is connected, and disconnecting one.

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("remove"), id: z.string().trim().min(1).max(80) }),
  // Reads one page of a mailbox and reports what it found. The only way to know a connection works without
  // waiting for the assistant to happen to find something worth suggesting.
  z.object({ action: z.literal("check"), id: z.string().trim().min(1).max(80) })
]);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  return NextResponse.json({ accounts: await listMailAccounts(user.id) });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });

    const input = schema.parse(await request.json());

    if (input.action === "check") {
      const account = (await listMailAccounts(user.id)).find((entry) => entry.id === input.id);
      if (!account) return NextResponse.json({ message: "That mailbox is not connected." }, { status: 404 });

      const token = await accessTokenFor(user.id, input.id);
      if (!token) {
        return NextResponse.json({
          ok: false,
          message: "That mailbox will not open. Its permission has probably been withdrawn — remove it and connect it again."
        });
      }

      try {
        // Unread is the narrowest of the three, so this reads as little as possible while still proving it works.
        const messages = account.provider === "MICROSOFT"
          ? await listMicrosoftMail(token, "UNREAD", 5)
          : await listMailForToken(token, "UNREAD", 5);
        return NextResponse.json({
          ok: true,
          message: messages.length
            ? "Working. It can see " + messages.length + (messages.length === 1 ? " unread message" : " unread messages") +
              ", the most recent from " + (messages[0].from || "somebody") + "."
            : "Working — it opened the mailbox and there is nothing unread in it right now."
        });
      } catch (error) {
        return NextResponse.json({
          ok: false,
          message: error instanceof Error ? error.message : "That mailbox could not be read."
        });
      }
    }

    // Scoped to this member inside removeMailAccount, so one person's id cannot reach another's mailbox.
    await removeMailAccount(user.id, input.id);
    await recordAuditEvent({
      actorUserId: user.id,
      action: "MAILBOX_REMOVED",
      entityType: "user",
      entityId: user.id,
      summary: user.fullName + " disconnected one of their mailboxes",
      metadata: { mailboxId: input.id }
    });
    return NextResponse.json({ accounts: await listMailAccounts(user.id), message: "Disconnected." });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That request was not valid." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "That could not be done." }, { status: 500 });
  }
}
