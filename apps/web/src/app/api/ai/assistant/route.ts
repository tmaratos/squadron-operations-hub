import { NextResponse } from "next/server";
import { z } from "zod";
import { applyPlan, buildPlan, describeStep, planSchema } from "@/lib/ai/agent";
import { aiSource, AiUnavailableError } from "@/lib/ai/provider";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { assertSameOrigin } from "@/lib/security/origin";

// Two steps on purpose: "plan" only proposes, "apply" only runs steps a member approved.
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("plan"), prompt: z.string().trim().min(3).max(1000) }),
  z.object({ action: z.literal("apply"), steps: planSchema })
]);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  const source = aiSource();
  return NextResponse.json({ available: source !== "none", source });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (user.globalRole === "READ_ONLY") return NextResponse.json({ message: "Read-only accounts cannot create work." }, { status: 403 });
    const input = requestSchema.parse(await request.json());

    if (input.action === "plan") {
      const plan = await buildPlan(input.prompt);
      return NextResponse.json({ reply: plan.reply, steps: plan.steps, descriptions: plan.steps.map(describeStep) });
    }

    const applied = await applyPlan(input.steps, user.id);
    await recordAuditEvent({
      actorUserId: user.id,
      action: "ASSISTANT_APPLIED",
      entityType: "workspace",
      entityId: "tn-170",
      summary: user.fullName + " approved " + applied.filter((step) => step.ok).length + " assistant action(s)",
      metadata: { steps: input.steps.map(describeStep), results: applied.map((step) => step.label) }
    });
    return NextResponse.json({ applied });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That request was invalid." }, { status: 400 });
    if (error instanceof AiUnavailableError) return NextResponse.json({ message: error.message }, { status: 503 });
    console.error(error);
    return NextResponse.json({ message: "The assistant couldn't finish that. Try again in a minute." }, { status: 502 });
  }
}
