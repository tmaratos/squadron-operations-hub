import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/origin";
import { recordAuditEvent } from "@/lib/db/audit";
import { accessTokenFor, listMailAccounts, removeMailAccount, setMailboxScanMode } from "@/lib/google/mail-accounts";
import { getScanMode } from "@/lib/google/mail-suggestions";
import { listMailForToken } from "@/lib/google/gmail";
import { listMicrosoftMail } from "@/lib/microsoft/graph";

// Adding a mailbox is an OAuth round trip and lives in the auth routes. This is the other half: listing
// what is connected, and disconnecting one.

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("remove"), id: z.string().trim().min(1).max(80) }),
  // Reads one page of a mailbox and reports what it found. The only way to know a connection works without
  // waiting for the assistant to happen to find something worth suggesting.
  z.object({ action: z.literal("check"), id: z.string().trim().min(1).max(80) }),
  // How much of this one mailbox to read. Null follows the member's own default.
  z.object({
    action: z.literal("scan"),
    id: z.string().trim().min(1).max(80),
    mode: z.enum(["UNREAD", "INBOX", "ALL"]).nullable()
  })
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

    if (input.action === "scan") {
      const account = (await listMailAccounts(user.id)).find((entry) => entry.id === input.id);
      if (!account) return NextResponse.json({ message: "That mailbox is not connected." }, { status: 404 });

      await setMailboxScanMode(user.id, input.id, input.mode);
      await recordAuditEvent({
        actorUserId: user.id,
        action: "MAILBOX_SCAN_" + (input.mode ?? "DEFAULT"),
        entityType: "user",
        entityId: user.id,
        summary: user.fullName + " set " + account.email + " to be read " + (
          input.mode === "ALL" ? "in every folder except the trash"
            : input.mode === "INBOX" ? "in the inbox only"
              : input.mode === "UNREAD" ? "when unread only"
                : "the same as their other mail"
        ),
        metadata: { email: account.email, mode: input.mode }
      });

      return NextResponse.json({
        accounts: await listMailAccounts(user.id),
        message: account.email + " will be read " + (
          input.mode === "ALL" ? "in every folder except the trash."
            : input.mode === "INBOX" ? "in the inbox only."
              : input.mode === "UNREAD" ? "when something in it is unread."
                : "the same way as the rest of your mail."
        )
      });
    }

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
        // Checked the way the member has actually set it, not the narrowest way.
        //
        // This used to read unread mail whatever the setting said, so somebody who had asked for every
        // folder was told "there is nothing unread in it right now" - which reads as the Hub only caring
        // about unread mail, and is alarming when the whole point is that it reads everything else too.
        // This mailbox's own scope, falling back to the member's default when it has none of its own -
        // exactly what the real scan does, so the check cannot report on a different scope from the one
        // that will actually be used.
        const mode = account.scanMode ?? (await getScanMode(user.id));
        const messages = account.provider === "MICROSOFT"
          ? await listMicrosoftMail(token, mode, 5)
          : await listMailForToken(token, mode, 5);

        const what = mode === "ALL"
          ? "in every folder except the trash"
          : mode === "INBOX"
            ? "in the inbox"
            : "unread";
        return NextResponse.json({
          ok: true,
          message: messages.length
            ? "Working. Reading " + what + ", it can see " + messages.length +
              (messages.length === 1 ? " message" : " messages") + ", the most recent from " +
              (messages[0].from || "somebody") + "."
            : "Working — it opened the mailbox, and reading " + what + " there is nothing there to read."
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
