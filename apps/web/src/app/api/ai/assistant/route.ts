import { NextResponse } from "next/server";
import { z } from "zod";
import { applyPlan, buildPlan, describeStep, planSchema } from "@/lib/ai/agent";
import { addMessage, deleteConversation, ensureConversation, listConversations, purgeExpired, readConversation, RETENTION_DAYS } from "@/lib/ai/conversations";
import { AiUnavailableError, sourceForUser } from "@/lib/ai/provider";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { assertSameOrigin } from "@/lib/security/origin";

// Two steps on purpose: "plan" only proposes, "apply" only runs steps a member approved.
// Conversations are saved so members can look back at what they asked for.
const conversationId = z.string().trim().min(1).max(80).nullable().optional();

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("plan"), prompt: z.string().trim().min(3).max(1000), conversationId }),
  z.object({ action: z.literal("apply"), steps: planSchema, conversationId })
]);

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  await purgeExpired(user.id);
  const wanted = new URL(request.url).searchParams.get("conversation");
  return NextResponse.json({
    ...(await sourceForUser(user.id)),
    retentionDays: RETENTION_DAYS,
    conversations: await listConversations(user.id),
    messages: wanted ? await readConversation(wanted, user.id) : []
  });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (user.globalRole === "READ_ONLY") return NextResponse.json({ message: "Read-only accounts cannot create work." }, { status: 403 });
    const input = requestSchema.parse(await request.json());

    if (input.action === "plan") {
      const plan = await buildPlan(input.prompt, user.id);
      const conversation = await ensureConversation(user.id, input.conversationId ?? null, input.prompt);
      await addMessage({ conversationId: conversation, role: "user", content: input.prompt });
      await addMessage({ conversationId: conversation, role: "assistant", content: plan.reply, steps: plan.steps });
      return NextResponse.json({ conversationId: conversation, reply: plan.reply, steps: plan.steps, descriptions: plan.steps.map(describeStep) });
    }

    const applied = await applyPlan(input.steps, user.id);
    if (input.conversationId) {
      await addMessage({
        conversationId: await ensureConversation(user.id, input.conversationId, "Assistant work"),
        role: "system",
        content: "Approved " + applied.filter((step) => step.ok).length + " of " + applied.length + " actions.",
        applied
      });
    }
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

// Deleting a conversation removes the chat only. Anything the assistant already created stays, and History keeps the record.
export async function DELETE(request: Request) {
  assertSameOrigin(request);
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("conversation");
  if (!id) return NextResponse.json({ message: "Which conversation?" }, { status: 400 });
  const removed = await deleteConversation(id, user.id);
  return NextResponse.json({ removed, conversations: await listConversations(user.id), message: removed ? "Conversation deleted. Anything it created is still there." : "That conversation was already gone." });
}
