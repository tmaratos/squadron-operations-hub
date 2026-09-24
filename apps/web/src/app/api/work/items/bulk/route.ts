import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { getDatabase } from "@/lib/cloudflare";
import { recordAuditEvent } from "@/lib/db/audit";
import { assertSameOrigin } from "@/lib/security/origin";
import { archiveItem, moveItem } from "@/lib/work/items";

// Doing the same thing to several tasks at once.
//
// Clearing up after an import, or after the assistant has made a mess, is not a task-at-a-time job: it is
// twenty tasks that should not exist, and twenty separate confirmations is how people give up halfway.

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"), itemIds: z.array(z.string().trim().min(1).max(80)).min(1).max(200) }),
  z.object({
    action: z.literal("move"),
    itemIds: z.array(z.string().trim().min(1).max(80)).min(1).max(200),
    listId: z.string().trim().min(1).max(80)
  })
]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (user.globalRole === "READ_ONLY") return NextResponse.json({ message: "Read-only accounts cannot change work." }, { status: 403 });
    const input = schema.parse(await request.json());

    if (input.action === "move") {
      const list = await getDatabase().prepare("SELECT name FROM lists WHERE id = ?").bind(input.listId).first<{ name: string }>();
      if (!list) return NextResponse.json({ message: "That list no longer exists." }, { status: 400 });
      for (const itemId of input.itemIds) await moveItem(itemId, input.listId);
      await recordAuditEvent({
        actorUserId: user.id,
        action: "ITEMS_MOVED",
        entityType: "item",
        entityId: input.itemIds[0],
        summary: user.fullName + " moved " + input.itemIds.length + " task" + (input.itemIds.length === 1 ? "" : "s") + " to " + list.name,
        metadata: { count: input.itemIds.length, listId: input.listId }
      });
      return NextResponse.json({ message: input.itemIds.length + " moved to " + list.name + "." });
    }

    for (const itemId of input.itemIds) await archiveItem(itemId);
    await recordAuditEvent({
      actorUserId: user.id,
      action: "ITEMS_ARCHIVED",
      entityType: "item",
      entityId: input.itemIds[0],
      summary: user.fullName + " deleted " + input.itemIds.length + " task" + (input.itemIds.length === 1 ? "" : "s"),
      metadata: { count: input.itemIds.length }
    });
    return NextResponse.json({ message: input.itemIds.length + " deleted." });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That request was invalid." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "Those could not be changed." }, { status: 500 });
  }
}
