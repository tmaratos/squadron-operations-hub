import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { createComplianceRequirement, listComplianceRequirements } from "@/lib/operations/compliance";
import { assertSameOrigin } from "@/lib/security/origin";

const createSchema = z.object({
  name: z.string().trim().min(3).max(180),
  description: z.string().trim().max(5000).nullable().optional(),
  governingSource: z.string().trim().max(500).nullable().optional(),
  functionalAreaKey: z.string().trim().min(1).max(80),
  responsibleUserId: z.string().uuid().nullable().optional(),
  recurrenceRule: z.enum(["FREQ=DAILY", "FREQ=WEEKLY", "FREQ=MONTHLY", "FREQ=QUARTERLY", "FREQ=ANNUALLY"]).nullable().optional(),
  nextDueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  requiredEvidence: z.array(z.string().trim().min(1).max(180)).max(20).default([])
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  return NextResponse.json({ requirements: await listComplianceRequirements() });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (user.globalRole === "READ_ONLY") return NextResponse.json({ message: "Read-only accounts cannot create requirements." }, { status: 403 });

    const input = createSchema.parse(await request.json());
    const requirement = await createComplianceRequirement({ ...input, createdBy: user.id });
    await recordAuditEvent({
      actorUserId: user.id,
      action: "COMPLIANCE_REQUIREMENT_CREATED",
      entityType: "compliance_requirement",
      entityId: requirement.id,
      summary: `${user.fullName} created requirement: ${requirement.name}`,
      metadata: {
        recurrenceRule: requirement.recurrenceRule,
        nextDueOn: requirement.nextDueOn,
        functionalArea: requirement.functionalAreaKey
      }
    });
    return NextResponse.json({ requirement, message: "Compliance requirement created." }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "Review the requirement details.", issues: error.issues }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "The compliance requirement could not be created." }, { status: 500 });
  }
}
