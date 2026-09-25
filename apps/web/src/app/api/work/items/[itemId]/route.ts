import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { unavailableAssignees } from "@/lib/org/directory";
import { recordAuditEvent } from "@/lib/db/audit";
import { notifyAssigned, notifyComment, notifyMentions, notifyStatus, setWatching, watchersOf } from "@/lib/notify/events";
import { assertSameOrigin } from "@/lib/security/origin";
import { runAutomations, type AutomationEvent } from "@/lib/work/automations";
import { addChecklist, addChecklistEntry, addComment, archiveItem, getItemDetail, moveItem, setChecklistEntryDone, updateItem } from "@/lib/work/items";
import { listStatuses } from "@/lib/work/structure";

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
  // Following a task without taking it on.
  watching: z.boolean().optional(),
  fieldValues: z.record(z.string(), z.unknown()).optional(),
  comment: z.string().trim().min(1).max(10000).optional(),
  checklist: z.object({ name: z.string().trim().min(1).max(200) }).optional(),
  checklistEntry: z.object({ checklistId: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(300) }).optional(),
  entryDone: z.object({ entryId: z.string().trim().min(1).max(80), done: z.boolean() }).optional(),
  // Moving the task somewhere else entirely, which is not a field on the task but a change of home.
  listId: z.string().trim().min(1).max(80).optional()
});

type Params = { params: Promise<{ itemId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  const { itemId } = await params;
  const item = await getItemDetail(itemId);
  if (!item) return NextResponse.json({ message: "Item not found." }, { status: 404 });
  const watchers = await watchersOf(itemId);
  return NextResponse.json({ item, watching: watchers.includes(user.id), watcherCount: watchers.length });
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

    const { comment, checklist, checklistEntry, entryDone, listId, watching, ...changes } = updateItemSchema.parse(await request.json());

    if (watching !== undefined) {
      await setWatching(itemId, user.id, watching);
    }

    // Somebody on leave or inactive does not get handed new work, whatever asked for it.
    if (changes.assigneeIds?.length) {
      const away = await unavailableAssignees(changes.assigneeIds);
      if (away.length) {
        return NextResponse.json({
          message: away.map((person) => person.fullName + " is " + (person.status === "LEAVE" ? "on leave" : "inactive")).join("; ") +
            ". Change that on the People and positions page first."
        }, { status: 409 });
      }
    }
    // The move happens first, so anything else in the same request applies to the task in its new home.
    if (listId && listId !== before.listId) await moveItem(itemId, listId);
    await updateItem(itemId, changes);
    if (comment) await addComment({ itemId, body: comment, userId: user.id });
    if (checklist) await addChecklist({ itemId, name: checklist.name });
    if (checklistEntry) await addChecklistEntry(checklistEntry);
    if (entryDone) await setChecklistEntryDone(entryDone.entryId, entryDone.done);

    const after = await getItemDetail(itemId);
    if (after) {
      const events: AutomationEvent[] = [];
      if (after.statusId && after.statusId !== before.statusId) {
        const statusName = (await listStatuses(after.listId)).find((status) => status.id === after.statusId)?.name;
        if (statusName) events.push({ type: "status_changed", statusName });
      }
      if (after.priority !== before.priority) events.push({ type: "priority_changed", priority: after.priority });
      const previousTags = new Set(before.tags.map((tag) => tag.label));
      const addedTags = after.tags.map((tag) => tag.label).filter((label) => !previousTags.has(label));
      if (addedTags.length) events.push({ type: "tag_added", tags: addedTags });
      const newlyAssigned = after.assignees.filter((person) => !before.assignees.some((previous) => previous.id === person.id));
      if (newlyAssigned.length) events.push({ type: "assignee_added" });
      if (events.length) await runAutomations({ itemId, listId: after.listId, events, userId: user.id });

      // Tell the people who need to know. A failure here must never cost the member their save.
      const actor = { id: user.id, fullName: user.fullName };
      try {
        await notifyAssigned({ item: after, addedUserIds: newlyAssigned.map((person) => person.id), actor });
        if (comment) {
          // Naming somebody is asking them directly, so they hear about it even if the task was nothing
          // to do with them until now.
          await notifyMentions({ item: after, comment, actor });
          await notifyComment({ item: after, comment, actor });
        }
        const statusEvent = events.find((event) => event.type === "status_changed");
        if (statusEvent && statusEvent.type === "status_changed") await notifyStatus({ item: after, statusName: statusEvent.statusName, actor });
      } catch (notifyError) {
        console.error(notifyError);
      }
    }

    const changed = Object.keys(changes);
    if (listId && listId !== before.listId) changed.push("list");
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
    const watchers = await watchersOf(itemId);
    return NextResponse.json({
      item: await getItemDetail(itemId),
      watching: watchers.includes(user.id),
      watcherCount: watchers.length,
      message: "Saved."
    });
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
