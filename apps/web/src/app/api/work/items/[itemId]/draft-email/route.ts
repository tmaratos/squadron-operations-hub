import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { createGmailDraft } from "@/lib/google/gmail";
import { addressesForCapid } from "@/lib/org/roster";
import { assertSameOrigin } from "@/lib/security/origin";
import { getItemDetail } from "@/lib/work/items";
import { getDatabase } from "@/lib/cloudflare";

// Turns a task into a draft in the member's own Gmail: who it is for, what it is, when it is due.
// It is a draft. The Hub does not send it, and says so everywhere it offers this.

const schema = z.object({ note: z.string().trim().max(2000).optional() });

export async function POST(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    const { itemId } = await params;
    const item = await getItemDetail(itemId);
    if (!item) return NextResponse.json({ message: "That task no longer exists." }, { status: 404 });
    const { note } = schema.parse(await request.json().catch(() => ({})));

    // Addressed to whoever the work belongs to, at every address that reaches them.
    const recipients: string[] = [];
    for (const person of item.assignees) {
      const row = await getDatabase().prepare("SELECT email, capid FROM users WHERE id = ?").bind(person.id)
        .first<{ email: string; capid: string | null }>();
      if (!row) continue;
      const addresses = row.capid ? await addressesForCapid(row.capid) : [row.email.toLowerCase()];
      addresses.forEach((address) => { if (!recipients.includes(address)) recipients.push(address); });
    }
    if (!recipients.length) return NextResponse.json({ message: "Give this task an owner first, so there is somebody to write to." }, { status: 400 });

    const lines = [
      item.title,
      "",
      item.dueOn ? "Due: " + item.dueOn : "No due date set.",
      "In: " + item.listName,
      ""
    ];
    if (note) lines.push(note, "");
    if (item.description) lines.push(item.description.slice(0, 2000), "");
    lines.push("Open it in the Hub: " + (process.env.APP_URL ?? "https://tn170adminhub.tristanmaratos.com") + "/lists/" + item.listId + "?item=" + item.id);
    lines.push("", "— " + user.fullName);

    const draft = await createGmailDraft({
      userId: user.id,
      to: recipients,
      subject: item.title,
      body: lines.join("\n")
    });

    await recordAuditEvent({
      actorUserId: user.id,
      action: "GMAIL_DRAFT_CREATED",
      entityType: "item",
      entityId: item.id,
      summary: user.fullName + " drafted an email about " + item.title + " to " + recipients.join(", "),
      metadata: { recipients }
    });

    return NextResponse.json({ ...draft, recipients, message: "The draft is in your Gmail. Nothing has been sent." });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That request was invalid." }, { status: 400 });
    return NextResponse.json({ message: error instanceof Error ? error.message : "The draft could not be created." }, { status: 400 });
  }
}
