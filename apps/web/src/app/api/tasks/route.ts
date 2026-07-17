import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { createTask, listTasks } from "@/lib/operations/tasks";
import { assertSameOrigin } from "@/lib/security/origin";

const createTaskSchema = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().max(5000).nullable().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  functionalAreaKey: z.string().trim().min(1).max(80),
  ownerUserId: z.string().uuid().nullable().optional(),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  sourceType: z.enum(["MANUAL", "MEETING", "DISCORD", "COMPLIANCE", "SYSTEM"]).default("MANUAL"),
  sourceReference: z.string().trim().max(1000).nullable().optional(),
  requiresApproval: z.boolean().default(false)
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  const tasks = await listTasks();
  return NextResponse.json({ tasks });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (user.globalRole === "READ_ONLY") {
      return NextResponse.json({ message: "Read-only accounts cannot create tasks." }, { status: 403 });
    }

    const input = createTaskSchema.parse(await request.json());
    const task = await createTask({ ...input, createdBy: user.id });
    await recordAuditEvent({
      actorUserId: user.id,
      action: "TASK_CREATED",
      entityType: "task",
      entityId: task.id,
      summary: `${user.fullName} created task: ${task.title}`,
      metadata: {
        status: task.status,
        priority: task.priority,
        functionalArea: task.functionalAreaKey,
        ownerUserId: task.ownerUserId,
        dueOn: task.dueOn
      }
    });

    return NextResponse.json({ task, message: "Task created." }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "Review the task details and try again.", issues: error.issues }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ message: "The task could not be created." }, { status: 500 });
  }
}
