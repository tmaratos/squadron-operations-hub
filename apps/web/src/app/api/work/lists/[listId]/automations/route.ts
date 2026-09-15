import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { assertSameOrigin } from "@/lib/security/origin";
import { createAutomation, deleteAutomation, listAutomations, recentRuns, setAutomationEnabled } from "@/lib/work/automations";

const priority = z.enum(["URGENT", "HIGH", "NORMAL", "LOW"]);
const label = z.string().trim().min(1).max(40);

const triggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("item_created") }),
  z.object({ type: z.literal("status_changed"), toStatusName: label.optional() }),
  z.object({ type: z.literal("assignee_added") }),
  z.object({ type: z.literal("priority_changed"), toPriority: priority.optional() }),
  z.object({ type: z.literal("tag_added"), tag: label.optional() })
]);

const conditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("has_tag"), tag: label }),
  z.object({ type: z.literal("priority_is"), priority }),
  z.object({ type: z.literal("status_is"), statusName: label }),
  z.object({ type: z.literal("no_assignee") })
]);

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_status"), statusName: label }),
  z.object({ type: z.literal("set_priority"), priority }),
  z.object({ type: z.literal("add_tag"), tag: label }),
  z.object({ type: z.literal("remove_tag"), tag: label }),
  z.object({ type: z.literal("assign"), userId: z.string().trim().min(1).max(80) }),
  z.object({ type: z.literal("add_comment"), body: z.string().trim().min(1).max(2000) }),
  z.object({ type: z.literal("set_due_in_days"), days: z.number().int().min(0).max(365) })
]);

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().trim().min(1).max(100),
    trigger: triggerSchema,
    conditions: z.array(conditionSchema).max(5).default([]),
    actions: z.array(actionSchema).min(1).max(5)
  }),
  z.object({ action: z.literal("toggle"), automationId: z.string().trim().min(1).max(80), enabled: z.boolean() }),
  z.object({ action: z.literal("delete"), automationId: z.string().trim().min(1).max(80) })
]);

async function payload(listId: string) {
  const automations = await listAutomations("list", listId);
  return { automations, runs: await recentRuns(automations.map((automation) => automation.id)) };
}

export async function GET(_request: Request, { params }: { params: Promise<{ listId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  const { listId } = await params;
  return NextResponse.json(await payload(listId));
}

export async function POST(request: Request, { params }: { params: Promise<{ listId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (user.globalRole === "READ_ONLY") return NextResponse.json({ message: "Read-only accounts cannot change automations." }, { status: 403 });
    const { listId } = await params;
    const input = requestSchema.parse(await request.json());

    let summary = "";
    if (input.action === "create") {
      await createAutomation({ scopeType: "list", scopeId: listId, name: input.name, trigger: input.trigger, conditions: input.conditions, actions: input.actions, userId: user.id });
      summary = "created the automation " + input.name;
    } else if (input.action === "toggle") {
      await setAutomationEnabled(input.automationId, input.enabled);
      summary = (input.enabled ? "turned on" : "turned off") + " an automation";
    } else {
      await deleteAutomation(input.automationId);
      summary = "deleted an automation";
    }

    await recordAuditEvent({
      actorUserId: user.id,
      action: "AUTOMATION_UPDATED",
      entityType: "list",
      entityId: listId,
      summary: user.fullName + " " + summary,
      metadata: { action: input.action }
    });
    return NextResponse.json({ ...(await payload(listId)), message: "Automations saved." });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "The automation was invalid.", issues: error.issues }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "The automation could not be saved." }, { status: 500 });
  }
}
