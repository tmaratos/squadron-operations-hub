import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { assertSameOrigin } from "@/lib/security/origin";
import { createItem, getItemDetail, listItems } from "@/lib/work/items";

const createItemSchema = z.object({
  title: z.string().trim().min(1).max(300),
  parentId: z.string().trim().max(80).nullable().optional(),
  statusId: z.string().trim().max(80).nullable().optional(),
  priority: z.enum(["URGENT", "HIGH", "NORMAL", "LOW"]).nullable().optional(),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
});

export async function GET(_request: Request, { params }: { params: Promise<{ listId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  const { listId } = await params;
  return NextResponse.json({ items: await listItems(listId) });
}

export async function POST(request: Request, { params }: { params: Promise<{ listId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (user.globalRole === "READ_ONLY") return NextResponse.json({ message: "Read-only accounts cannot add items." }, { status: 403 });

    const { listId } = await params;
    const input = createItemSchema.parse(await request.json());
    const id = await createItem({ ...input, listId, userId: user.id });
    await recordAuditEvent({
      actorUserId: user.id,
      action: "ITEM_CREATED",
      entityType: "item",
      entityId: id,
      summary: user.fullName + " added " + input.title,
      metadata: { listId, parentId: input.parentId ?? null }
    });
    return NextResponse.json({ item: await getItemDetail(id), message: "Item added." }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "The item was invalid.", issues: error.issues }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "The item could not be added." }, { status: 500 });
  }
}
