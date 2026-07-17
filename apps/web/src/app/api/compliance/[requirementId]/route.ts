import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import {
  deleteComplianceRequirement,
  findComplianceRequirementById,
  setComplianceStatus
} from "@/lib/operations/compliance";
import { assertSameOrigin } from "@/lib/security/origin";

const statusSchema = z.object({ status: z.enum(["ACTIVE", "PAUSED", "RETIRED"]) });

export async function PATCH(request: Request, context: { params: Promise<{ requirementId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (user.globalRole === "READ_ONLY") return NextResponse.json({ message: "Read-only accounts cannot update requirements." }, { status: 403 });

    const { requirementId } = await context.params;
    const previous = await findComplianceRequirementById(requirementId);
    if (!previous) return NextResponse.json({ message: "Requirement not found." }, { status: 404 });
    const input = statusSchema.parse(await request.json());
    const requirement = await setComplianceStatus(requirementId, input.status);
    await recordAuditEvent({
      actorUserId: user.id,
      action: "COMPLIANCE_STATUS_CHANGED",
      entityType: "compliance_requirement",
      entityId: requirement.id,
      summary: `${user.fullName} changed ${requirement.name} from ${previous.status} to ${requirement.status}`,
      metadata: { previousStatus: previous.status, newStatus: requirement.status }
    });
    return NextResponse.json({ requirement, message: "Requirement updated." });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "The requested status is invalid." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "The requirement could not be updated." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ requirementId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (!["SYSTEM_OWNER", "ADMINISTRATOR"].includes(user.globalRole)) {
      return NextResponse.json({ message: "Only an administrator may permanently delete requirements." }, { status: 403 });
    }
    const { requirementId } = await context.params;
    const requirement = await findComplianceRequirementById(requirementId);
    if (!requirement) return NextResponse.json({ message: "Requirement not found." }, { status: 404 });
    await deleteComplianceRequirement(requirementId);
    await recordAuditEvent({
      actorUserId: user.id,
      action: "COMPLIANCE_REQUIREMENT_DELETED",
      entityType: "compliance_requirement",
      entityId: requirement.id,
      summary: `${user.fullName} deleted requirement: ${requirement.name}`
    });
    return NextResponse.json({ message: "Requirement deleted." });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "The requirement could not be deleted." }, { status: 500 });
  }
}
