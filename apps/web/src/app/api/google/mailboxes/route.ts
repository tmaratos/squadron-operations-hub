import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/origin";
import { recordAuditEvent } from "@/lib/db/audit";
import { listMailAccounts, removeMailAccount } from "@/lib/google/mail-accounts";

// Adding a mailbox is an OAuth round trip and lives in the auth routes. This is the other half: listing
// what is connected, and disconnecting one.

const schema = z.object({ action: z.literal("remove"), id: z.string().trim().min(1).max(80) });

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
