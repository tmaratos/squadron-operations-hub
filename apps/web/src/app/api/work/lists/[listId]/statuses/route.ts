import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { assertSameOrigin } from "@/lib/security/origin";
import { saveStatuses } from "@/lib/work/structure";

const statusesSchema = z.object({
  statuses: z.array(z.object({
    id: z.string().trim().max(80).nullable().optional(),
    name: z.string().trim().min(1).max(40),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    category: z.enum(["NOT_STARTED", "ACTIVE", "DONE", "CLOSED"])
  })).min(1).max(20)
});

export async function PUT(request: Request, { params }: { params: Promise<{ listId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (user.globalRole === "READ_ONLY") return NextResponse.json({ message: "Read-only accounts cannot change workflows." }, { status: 403 });
    const { listId } = await params;
    const input = statusesSchema.parse(await request.json());
    const statuses = await saveStatuses(listId, input.statuses);
    await recordAuditEvent({
      actorUserId: user.id,
      action: "LIST_WORKFLOW_UPDATED",
      entityType: "list",
      entityId: listId,
      summary: user.fullName + " updated the statuses of a list (" + statuses.map((status) => status.name).join(", ") + ")",
      metadata: { statuses: statuses.map((status) => ({ id: status.id, name: status.name, category: status.category })) }
    });
    return NextResponse.json({ statuses, message: "Statuses saved." });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "The statuses were invalid.", issues: error.issues }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "The statuses could not be saved." }, { status: 500 });
  }
}
