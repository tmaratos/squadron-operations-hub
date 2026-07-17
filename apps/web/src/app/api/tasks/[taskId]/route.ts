import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { deleteTask, findTaskById, updateTask } from "@/lib/operations/tasks";
import { assertSameOrigin } from "@/lib/security/origin";

const updateTaskSchema = z.object({
  title: z.string().trim().min(3).max(180).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "BLOCKED", "AWAITING_APPROVAL", "COMPLETED", "CANCELLED"]).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).optional(),
  functionalAreaKey: z.string().trim().min(1).max(80).optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  requiresApproval: z.boolean().optional()
});

export async function PATCH(request: Request, context: { params: Promise<{ taskId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (user.globalRole === "READ_ONLY") {
      return NextResponse.json({ message: "Read-only accounts cannot update tasks." }, { status: 403 });
    }

    const { taskId } = await context.params;
    const current = await findTaskById(taskId);
    if (!current) return NextResponse.json({ message: "Task not found." }, { status: 404 });

    const input = updateTaskSchema.parse(await request.json());
    const task = await updateTask(taskId, input);
    await recordAuditEvent({
      actorUserId: user.id,
      action: "TASK_UPDATED",
      entityType: "task",
      entityId: task.id,
      summary: `${user.fullName} updated task: ${task.title}`,
      metadata: {
        previousStatus: current.status,
        newStatus: task.status,
        previousOwnerUserId: current.ownerUserId,
        newOwnerUserId: task.ownerUserId,
        priority: task.priority,
        dueOn: task.dueOn
      }
    });

    return NextResponse.json({ task, message: "Task updated." });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "The task update was invalid.", issues: error.issues }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ message: "The task could not be updated." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ taskId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (!["SYSTEM_OWNER", "ADMINISTRATOR"].includes(user.globalRole)) {
      return NextResponse.json({ message: "Only an administrator may permanently delete tasks." }, { status: 403 });
    }

    const { taskId } = await context.params;
    const task = await findTaskById(taskId);
    if (!task) return NextResponse.json({ message: "Task not found." }, { status: 404 });

    await deleteTask(taskId);
    await recordAuditEvent({
      actorUserId: user.id,
      action: "TASK_DELETED",
      entityType: "task",
      entityId: task.id,
      summary: `${user.fullName} deleted task: ${task.title}`,
      metadata: { title: task.title, status: task.status }
    });

    return NextResponse.json({ message: "Task deleted." });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "The task could not be deleted." }, { status: 500 });
  }
}
