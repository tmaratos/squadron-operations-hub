import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { deleteDutyAssignment, endDutyAssignment, findDutyAssignmentById } from "@/lib/operations/staff";
import { assertSameOrigin } from "@/lib/security/origin";

const endSchema = z.object({ endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export async function PATCH(request: Request, context: { params: Promise<{ assignmentId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (!["SYSTEM_OWNER", "ADMINISTRATOR"].includes(user.globalRole)) return NextResponse.json({ message: "You are not authorized to end duty assignments." }, { status: 403 });
    const { assignmentId } = await context.params;
    const current = await findDutyAssignmentById(assignmentId);
    if (!current) return NextResponse.json({ message: "Duty assignment not found." }, { status: 404 });
    const input = endSchema.parse(await request.json());
    const assignment = await endDutyAssignment(assignmentId, input.endsOn);
    await recordAuditEvent({
      actorUserId: user.id,
      action: "DUTY_ASSIGNMENT_ENDED",
      entityType: "duty_assignment",
      entityId: assignment.id,
      summary: `${user.fullName} ended ${assignment.userName}'s ${assignment.dutyTitle} assignment`,
      metadata: { endsOn: assignment.endsOn }
    });
    return NextResponse.json({ assignment, message: "Duty assignment ended." });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "Select a valid end date." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "The duty assignment could not be ended." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ assignmentId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (user.globalRole !== "SYSTEM_OWNER") return NextResponse.json({ message: "Only a system owner may permanently delete duty assignments." }, { status: 403 });
    const { assignmentId } = await context.params;
    const assignment = await findDutyAssignmentById(assignmentId);
    if (!assignment) return NextResponse.json({ message: "Duty assignment not found." }, { status: 404 });
    await deleteDutyAssignment(assignmentId);
    await recordAuditEvent({
      actorUserId: user.id,
      action: "DUTY_ASSIGNMENT_DELETED",
      entityType: "duty_assignment",
      entityId: assignment.id,
      summary: `${user.fullName} deleted ${assignment.userName}'s ${assignment.dutyTitle} assignment`
    });
    return NextResponse.json({ message: "Duty assignment deleted." });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "The duty assignment could not be deleted." }, { status: 500 });
  }
}
