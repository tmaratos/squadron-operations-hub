import { NextResponse } from "next/server";
import { getScanMode, setScanMode } from "@/lib/google/mail-suggestions";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { canRead, HUB_LABEL } from "@/lib/google/gmail";
import { suggestFromMail } from "@/lib/google/mail-suggestions";
import { assertSameOrigin } from "@/lib/security/origin";
import { createItem, updateItem } from "@/lib/work/items";
import { getWorkspaceTree } from "@/lib/work/structure";

// GET  looks at the mail the member labelled and says what it thinks needs doing. Nothing is created.
// POST creates one task from one suggestion, because the member pressed Add on that one.

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  if (!(await canRead(user.id))) {
    return NextResponse.json({ connected: false, label: HUB_LABEL, suggestions: [], mode: await getScanMode(user.id) });
  }
  try {
    const label = new URL(request.url).searchParams.get("label") || HUB_LABEL;
    const result = await suggestFromMail(user.id, label);
    return NextResponse.json({ connected: true, label, mode: await getScanMode(user.id), ...result });
  } catch (error) {
    return NextResponse.json({ connected: true, suggestions: [], message: error instanceof Error ? error.message : "Your mail could not be read." }, { status: 400 });
  }
}

const scanSchema = z.object({ action: z.literal("scan"), mode: z.enum(["LABEL", "INBOX", "ALL"]) });

const schema = z.object({
  title: z.string().trim().min(2).max(300),
  dueOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  listId: z.string().trim().max(80).optional(),
  from: z.string().trim().max(300).optional(),
  subject: z.string().trim().max(300).optional()
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    const body = await request.json();

    // Changing what the Hub reads is a setting, not creating work, so it is allowed before the read-only
    // check - and it is the one thing on this endpoint that a read-only member should still control.
    const asScan = scanSchema.safeParse(body);
    if (asScan.success) {
      await setScanMode(user.id, asScan.data.mode);
      await recordAuditEvent({
        actorUserId: user.id,
        action: "MAIL_SCAN_" + asScan.data.mode,
        entityType: "user",
        entityId: user.id,
        summary: user.fullName + (asScan.data.mode === "ALL"
          ? " had the Hub read all their mail except trash and spam"
          : asScan.data.mode === "INBOX"
            ? " had the Hub read their recent inbox"
            : " had the Hub read only mail they label"),
        metadata: { mode: asScan.data.mode }
      });
      return NextResponse.json({
        mode: asScan.data.mode,
        message: asScan.data.mode === "ALL"
          ? "Reading everything except trash and spam."
          : asScan.data.mode === "INBOX"
            ? "Reading your recent inbox."
            : "Reading only what you label."
      });
    }

    if (user.globalRole === "READ_ONLY") return NextResponse.json({ message: "Read-only accounts cannot create work." }, { status: 403 });
    const input = schema.parse(body);

    const spaces = await getWorkspaceTree();
    const lists = spaces.flatMap((space) => [...space.lists, ...space.folders.flatMap((folder) => folder.lists)]);
    const list = (input.listId && lists.find((entry) => entry.id === input.listId))
      ?? lists.find((entry) => entry.name.toLowerCase().includes("intake"))
      ?? lists[0];
    if (!list) return NextResponse.json({ message: "There is no list to put this in yet." }, { status: 400 });

    const id = await createItem({ listId: list.id, title: input.title, userId: user.id });
    await updateItem(id, {
      dueOn: input.dueOn ?? null,
      // Where it came from stays on the task, so months later it is obvious why this exists.
      description: ["Made from an email.", input.from ? "From: " + input.from : "", input.subject ? "Subject: " + input.subject : ""].filter(Boolean).join("\n")
    });

    await recordAuditEvent({
      actorUserId: user.id,
      action: "ITEM_CREATED",
      entityType: "item",
      entityId: id,
      summary: user.fullName + " added " + input.title + " from an email",
      metadata: { listId: list.id, source: "gmail" }
    });

    return NextResponse.json({ id, listId: list.id, listName: list.name, message: "Added to " + list.name + "." }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That task was invalid." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "That task could not be created." }, { status: 500 });
  }
}
