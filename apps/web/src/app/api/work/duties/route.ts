import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { assertSameOrigin } from "@/lib/security/origin";
import { createDuty, deleteDuty, listDuties, outlook, setDutyConfidence, updateDuty } from "@/lib/work/duties";

// The duty catalog API. The "import" action is the format an AI (or a person) writes into:
// every duty must say which role owes it, how often it comes round, and where the requirement comes from.
// Imported duties always arrive UNVERIFIED and do nothing until a member confirms them. A duty a member
// types in themselves is confirmed on the spot: they are the one who would otherwise be confirming it.

const dutySchema = z.object({
  role: z.string().trim().min(2).max(80),
  title: z.string().trim().min(3).max(200),
  detail: z.string().trim().max(2000).optional(),
  cadence: z.enum(["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL", "EVERY_N_YEARS", "ONE_TIME"]),
  intervalYears: z.number().int().min(1).max(10).optional(),
  dueMonth: z.number().int().min(1).max(12).optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
  anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  leadDays: z.number().int().min(0).max(365).optional(),
  sourceCitation: z.string().trim().max(200).optional(),
  sourceUrl: z.string().trim().url().max(500).optional(),
  sourceItemId: z.string().trim().max(80).optional(),
  sourceDocumentId: z.string().trim().max(120).optional(),
  sourceQuote: z.string().trim().max(600).optional()
});

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), duty: dutySchema }),
  z.object({ action: z.literal("import"), duties: z.array(dutySchema).min(1).max(100) }),
  z.object({ action: z.literal("confirm"), dutyId: z.string().trim().min(1).max(80) }),
  z.object({ action: z.literal("reject"), dutyId: z.string().trim().min(1).max(80) }),
  z.object({ action: z.literal("update"), dutyId: z.string().trim().min(1).max(80), duty: dutySchema.partial() }),
  z.object({ action: z.literal("delete"), dutyId: z.string().trim().min(1).max(80) })
]);

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  const years = Number(new URL(request.url).searchParams.get("years") ?? 5);
  const duties = await listDuties();
  return NextResponse.json({
    duties,
    roles: Array.from(new Set(duties.map((duty) => duty.role))).sort(),
    outlook: await outlook(Number.isFinite(years) && years > 0 && years <= 10 ? years : 5)
  });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (user.globalRole === "READ_ONLY") return NextResponse.json({ message: "Read-only accounts cannot change the duty list." }, { status: 403 });
    const input = requestSchema.parse(await request.json());

    let summary = "";
    if (input.action === "create") {
      await createDuty(input.duty, user.id, "CONFIRMED");
      summary = "added the duty " + input.duty.title + " for " + input.duty.role;
    } else if (input.action === "import") {
      for (const duty of input.duties) await createDuty(duty, user.id);
      summary = "imported " + input.duties.length + " proposed duties for review";
    } else if (input.action === "confirm") {
      await setDutyConfidence(input.dutyId, "CONFIRMED", user.id);
      summary = "confirmed a duty";
    } else if (input.action === "reject") {
      await setDutyConfidence(input.dutyId, "REJECTED", user.id);
      summary = "rejected a proposed duty";
    } else if (input.action === "update") {
      await updateDuty(input.dutyId, input.duty);
      summary = "edited a duty";
    } else {
      await deleteDuty(input.dutyId);
      summary = "deleted a duty";
    }

    await recordAuditEvent({
      actorUserId: user.id,
      action: "ROLE_DUTIES_UPDATED",
      entityType: "workspace",
      entityId: "tn-170",
      summary: user.fullName + " " + summary,
      metadata: { action: input.action }
    });

    const duties = await listDuties();
    return NextResponse.json({ duties, roles: Array.from(new Set(duties.map((duty) => duty.role))).sort(), outlook: await outlook(5), message: "Saved." });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "Each duty needs a role, a title, how often it happens, and ideally where the requirement comes from.", issues: error.issues }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ message: "That could not be saved." }, { status: 500 });
  }
}
