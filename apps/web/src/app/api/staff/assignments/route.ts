import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { createDutyAssignment, listDutyAssignments } from "@/lib/operations/staff";
import { assertSameOrigin } from "@/lib/security/origin";

const createSchema = z.object({
  // Not every account id is a UUID - invited members and anything seeded are not - and rejecting those
  // here failed the form with "that was invalid" and no way to tell which field was the problem.
  // The form sends one of these. Most of a squadron has no Hub account, and a duty they hold is still a
  // fact about the squadron - so a roster name is as valid a holder here as a member who has signed in.
  userId: z.string().trim().min(1).max(80).optional(),
  personnelMemberId: z.string().trim().min(1).max(80).optional(),
  functionalAreaKey: z.string().trim().min(1).max(80),
  dutyTitle: z.string().trim().min(2).max(180),
  isPrimary: z.boolean().default(false),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  return NextResponse.json({ assignments: await listDutyAssignments() });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (!["SYSTEM_OWNER", "ADMINISTRATOR"].includes(user.globalRole)) {
      return NextResponse.json({ message: "Only a system owner or administrator may assign duty positions." }, { status: 403 });
    }

    const input = createSchema.parse(await request.json());
    if (!input.userId && !input.personnelMemberId) {
      return NextResponse.json({ message: "Choose who holds this duty." }, { status: 400 });
    }
    const assignment = await createDutyAssignment({ ...input, assignedBy: user.id });
    await recordAuditEvent({
      actorUserId: user.id,
      action: "DUTY_ASSIGNMENT_CREATED",
      entityType: "duty_assignment",
      entityId: assignment.id,
      summary: `${user.fullName} assigned ${assignment.userName} as ${assignment.dutyTitle}`,
      metadata: { functionalArea: assignment.functionalAreaKey, isPrimary: assignment.isPrimary, startsOn: assignment.startsOn }
    });
    return NextResponse.json({ assignment, message: "Duty assignment created." }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "Review the duty assignment details.", issues: error.issues }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "The duty assignment could not be created." }, { status: 500 });
  }
}
