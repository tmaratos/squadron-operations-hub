import { NextResponse } from "next/server";
import { getScanMode, setScanMode } from "@/lib/google/mail-suggestions";
import { getAutopilot, setAutopilot } from "@/lib/google/mail-autopilot";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { canRead } from "@/lib/google/gmail";
import { suggestFromMail } from "@/lib/google/mail-suggestions";
import { assertSameOrigin } from "@/lib/security/origin";
import { createItem, updateItem } from "@/lib/work/items";
import { getWorkspaceTree } from "@/lib/work/structure";

// GET  looks at the mail the member labelled and says what it thinks needs doing. Nothing is created.
// POST creates one task from one suggestion, because the member pressed Add on that one.

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });

  // Sent whether or not mail can be read, so the page can always show what the setting currently is rather
  // than defaulting the switch to off on screen while it is on underneath.
  const autopilot = await getAutopilot(user.id);
  const lists = await listChoices();
  const mode = await getScanMode(user.id);

  // Asking only for the settings, which is what the page needs to draw itself correctly. Reading a mailbox
  // takes the better part of a minute, and doing it just to find out which radio button to fill in meant
  // the page never asked at all - so it always drew the first one, whatever the member had actually chosen.
  if (new URL(request.url).searchParams.get("settings")) {
    return NextResponse.json({ connected: await canRead(user.id).catch(() => false), mode, autopilot, lists, suggestions: [] });
  }

  if (!(await canRead(user.id))) {
    return NextResponse.json({ connected: false, suggestions: [], mode, autopilot, lists });
  }
  try {
    const result = await suggestFromMail(user.id);
    return NextResponse.json({ connected: true, mode, autopilot, lists, ...result });
  } catch (error) {
    return NextResponse.json({ connected: true, suggestions: [], message: error instanceof Error ? error.message : "Your mail could not be read." }, { status: 400 });
  }
}

const scanSchema = z.object({ action: z.literal("scan"), mode: z.enum(["UNREAD", "INBOX", "ALL"]) });

const autopilotSchema = z.object({
  action: z.literal("autopilot"),
  on: z.boolean()
});

/** Every list a task could go in, loose ones and the ones inside folders. */
async function listChoices(): Promise<Array<{ id: string; name: string }>> {
  try {
    const spaces = await getWorkspaceTree();
    return spaces
      .flatMap((space) => [...space.lists, ...space.folders.flatMap((folder) => folder.lists)])
      .map((list) => ({ id: list.id, name: list.name }));
  } catch {
    return [];
  }
}

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
          ? " had the Hub read every folder except trash"
          : asScan.data.mode === "INBOX"
            ? " had the Hub read their whole inbox"
            : " had the Hub read their unread mail"),
        metadata: { mode: asScan.data.mode }
      });
      return NextResponse.json({
        mode: asScan.data.mode,
        message: asScan.data.mode === "ALL"
          ? "Reading every folder except the trash."
          : asScan.data.mode === "INBOX"
            ? "Reading your whole inbox."
            : "Reading your unread mail."
      });
    }

    // Letting the Hub create tasks by itself is creating work, so a read-only account cannot turn it on.
    const asAutopilot = autopilotSchema.safeParse(body);
    if (asAutopilot.success) {
      if (user.globalRole === "READ_ONLY") {
        return NextResponse.json({ message: "Read-only accounts cannot create work." }, { status: 403 });
      }
      await setAutopilot(user.id, { on: asAutopilot.data.on });
      await recordAuditEvent({
        actorUserId: user.id,
        action: asAutopilot.data.on ? "MAIL_AUTOCREATE_ON" : "MAIL_AUTOCREATE_OFF",
        entityType: "user",
        entityId: user.id,
        summary: user.fullName + (asAutopilot.data.on
          ? " let the Hub create tasks from dated mail"
          : " stopped the Hub creating tasks from mail"),
        metadata: {}
      });

      return NextResponse.json({
        autopilot: await getAutopilot(user.id),
        message: asAutopilot.data.on
          ? "Mail that states a date will become a task, filed where it belongs, with its reminders already set. You will be told each time."
          : "Nothing will be created on its own. Suggestions still wait for you."
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
