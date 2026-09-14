import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { assertSameOrigin } from "@/lib/security/origin";
import { addChecklist, addChecklistEntry, addComment, archiveItem, getItemDetail, setChecklistEntryDone, updateItem } from "@/lib/work/items";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();

const updateItemSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(100000).nullable().optional(),
  statusId: z.string().trim().max(80).nullable().optional(),
  priority: z.enum(["URGENT", "HIGH", "NORMAL", "LOW"]).nullable().optional(),
  startOn: date,
  dueOn: date,
  parentId: z.string().trim().max(80).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  assigneeIds: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  fieldValues: z.record(z.string(), z.unknown()).optional(),
  comment: z.string().trim().min(1).max(10000).optional(),
  checklist: z.object({ name: z.string().trim().min(1).max(200) }).optional(),
  checklistEntry: z.object({ checklistId: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(300) }).optional(),
  entryDone: z.object({ entryId: z.string().trim().min(1).max(80), done: z.boolean() }).optional()
});

type Params = { params: Promise<{ itemId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  const { itemId } = await params;
  const item = await getItemDetail(itemId);
  if (!item) return NextResponse.json({ message: "Item not found." }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (user.globalRole === "READ_ONLY") return NextResponse.json({ message: "Read-only accounts cannot change items." }, { status: 403 });

    const { itemId } = await params;
    const before = await getItemDetail(itemId);
    if (!before) return NextResponse.json({ message: "Item not found." }, { status: 404 });

    const { comment, checklist, checklistEntry, entryDone, ...changes } = updateItemSchema.parse(await request.json());
    await updateItem(itemId, changes);
    if (comment) await addComment({ itemId, body: comment, userId: user.id });
    if (checklist) await addChecklist({ itemId, name: checklist.name });
    if (checklistEntry) await addChecklistEntry(checklistEntry);
    if (entryDone) await setChecklistEntryDone(entryDone.entryId, entryDone.done);

    const changed = Object.keys(changes);
    if (comment) changed.push("comment");
    if (checklist || checklistEntry || entryDone) changed.push("checklist");
    await recordAuditEvent({
      actorUserId: user.id,
      action: "ITEM_UPDATED",
      entityType: "item",
      entityId: itemId,
      summary: user.fullName + " updated " + before.title + " (" + changed.join(", ") + ")",
      metadata: { changed, previousStatusId: before.statusId, newStatusId: changes.statusId ?? before.statusId }
    });
    return NextResponse.json({ item: await getItemDetail(itemId), message: "Saved." });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "The change was invalid.", issues: error.issues }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "The item could not be saved." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  assertSameOrigin(request);
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  if (user.globalRole === "READ_ONLY") return NextResponse.json({ message: "Read-only accounts cannot archive items." }, { status: 403 });
  const { itemId } = await params;
  const before = await getItemDetail(itemId);
  if (!before) return NextResponse.json({ message: "Item not found." }, { status: 404 });
  await archiveItem(itemId);
  await recordAuditEvent({ actorUserId: user.id, action: "ITEM_ARCHIVED", entityType: "item", entityId: itemId, summary: user.fullName + " archived " + before.title, metadata: {} });
  return NextResponse.json({ message: "Archived." });
}
