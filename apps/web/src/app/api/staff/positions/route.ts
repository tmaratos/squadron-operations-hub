import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { canApproveAccounts } from "@/lib/auth/types";
import { recordAuditEvent } from "@/lib/db/audit";
import { createPosition, listPersonnelMembers, listPersonnelPositions, removePosition, setMemberStatus, setPositionHolder } from "@/lib/operations/personnel";
import { assertSameOrigin } from "@/lib/security/origin";

// Changing the organisation chart from inside the app.
//
// It used to be seeded records with a date on them and no way to edit, which meant the one thing that
// changes every time somebody swaps jobs was the one thing nobody could correct.

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  const [positions, members] = await Promise.all([listPersonnelPositions(), listPersonnelMembers()]);
  return NextResponse.json({ positions, members, canEdit: canApproveAccounts(user.globalRole) });
}

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign"),
    positionId: z.string().trim().min(1).max(80),
    incumbentId: z.string().trim().max(80).nullable(),
    assignmentStatus: z.enum(["FILLED", "ACTING", "VACANT"]).default("FILLED"),
    notes: z.string().trim().max(400).nullable().optional()
  }),
  z.object({
    action: z.literal("create"),
    title: z.string().trim().min(3).max(120),
    functionalAreaKey: z.string().trim().min(1).max(80),
    reportsToPositionId: z.string().trim().max(80).nullable().optional()
  }),
  z.object({ action: z.literal("remove"), positionId: z.string().trim().min(1).max(80) }),
  z.object({
    action: z.literal("member"),
    memberId: z.string().trim().min(1).max(80),
    status: z.enum(["ACTIVE", "LEAVE", "INACTIVE"]),
    // An empty string clears the note rather than leaving yesterday's explanation in place.
    statusNote: z.string().trim().max(400).nullable().optional()
  })
]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (!canApproveAccounts(user.globalRole)) {
      return NextResponse.json({ message: "Only administrators can change the organisation chart." }, { status: 403 });
    }
    const input = schema.parse(await request.json());

    if (input.action === "assign") {
      await setPositionHolder(input);
      const positions = await listPersonnelPositions();
      const position = positions.find((entry) => entry.id === input.positionId);
      await recordAuditEvent({
        actorUserId: user.id,
        action: "POSITION_ASSIGNED",
        entityType: "position",
        entityId: input.positionId,
        summary: user.fullName + (position?.incumbentName
          ? " put " + position.incumbentName + " in " + position.title
          : " left " + (position?.title ?? "a position") + " vacant"),
        metadata: { incumbentId: input.incumbentId, status: input.assignmentStatus }
      });
      return NextResponse.json({
        positions,
        members: await listPersonnelMembers(),
        message: position?.incumbentName
          ? position.title + " is " + position.incumbentName + " now. Recurring work for that job goes to them."
          : (position?.title ?? "That position") + " is vacant. Its recurring work will have no owner until somebody holds it."
      });
    }

    if (input.action === "member") {
      await setMemberStatus(input);
      const members = await listPersonnelMembers();
      const member = members.find((entry) => entry.id === input.memberId);
      await recordAuditEvent({
        actorUserId: user.id,
        action: "MEMBER_STATUS_SET",
        entityType: "personnel_member",
        entityId: input.memberId,
        summary: user.fullName + " marked " + (member?.fullName ?? "a member") + " as " + input.status.toLowerCase(),
        metadata: { status: input.status }
      });
      return NextResponse.json({
        positions: await listPersonnelPositions(),
        members,
        message: (member?.fullName ?? "That member") + " is " + (input.status === "LEAVE" ? "on leave" : input.status === "INACTIVE" ? "inactive" : "active") + "."
      });
    }

    if (input.action === "create") {
      await createPosition(input);
      await recordAuditEvent({
        actorUserId: user.id,
        action: "POSITION_CREATED",
        entityType: "position",
        entityId: input.title,
        summary: user.fullName + " added the position " + input.title,
        metadata: {}
      });
      return NextResponse.json({
        positions: await listPersonnelPositions(),
        members: await listPersonnelMembers(),
        message: input.title + " added. Give it to somebody when you are ready."
      });
    }

    await removePosition(input.positionId);
    await recordAuditEvent({
      actorUserId: user.id,
      action: "POSITION_REMOVED",
      entityType: "position",
      entityId: input.positionId,
      summary: user.fullName + " removed a position from the organisation chart",
      metadata: {}
    });
    return NextResponse.json({
      positions: await listPersonnelPositions(),
      members: await listPersonnelMembers(),
      message: "Removed."
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That change was invalid." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "That change could not be saved." }, { status: 500 });
  }
}
