import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { assertSameOrigin } from "@/lib/security/origin";
import { addTarget, createGoal, deleteGoal, listGoals, removeTarget, setTargetValue, updateGoal } from "@/lib/goals/goals";

const horizon = z.enum(["SHORT", "LONG"]);
const status = z.enum(["OPEN", "MET", "MISSED", "ABANDONED"]);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().trim().min(3).max(160),
    detail: z.string().trim().max(2000).optional(),
    horizon,
    targetDate: date,
    ownerUserId: z.string().trim().max(80).nullable().optional()
  }),
  z.object({
    action: z.literal("update"),
    id: z.string().trim().min(1).max(80),
    name: z.string().trim().min(3).max(160).optional(),
    detail: z.string().trim().max(2000).nullable().optional(),
    horizon: horizon.optional(),
    targetDate: date,
    ownerUserId: z.string().trim().max(80).nullable().optional(),
    status: status.optional()
  }),
  z.object({ action: z.literal("delete"), id: z.string().trim().min(1).max(80) }),
  z.object({
    action: z.literal("addTarget"),
    goalId: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(160),
    kind: z.enum(["NUMBER", "CHECK", "TASKS"]),
    targetValue: z.number().min(0).max(1000000).optional(),
    unit: z.string().trim().max(24).nullable().optional(),
    sourceListId: z.string().trim().max(80).nullable().optional(),
    sourceTag: z.string().trim().max(60).nullable().optional()
  }),
  z.object({ action: z.literal("setTarget"), targetId: z.string().trim().min(1).max(80), current: z.number().min(0).max(1000000) }),
  z.object({ action: z.literal("removeTarget"), targetId: z.string().trim().min(1).max(80) })
]);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  return NextResponse.json({ goals: await listGoals() });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (user.globalRole === "READ_ONLY") {
      return NextResponse.json({ message: "Read-only accounts cannot change goals." }, { status: 403 });
    }
    const input = schema.parse(await request.json());

    if (input.action === "create") {
      const id = await createGoal({ ...input, userId: user.id });
      await recordAuditEvent({
        actorUserId: user.id,
        action: "GOAL_CREATED",
        entityType: "goal",
        entityId: id,
        summary: user.fullName + " set a " + (input.horizon === "LONG" ? "long" : "short") + " term goal: " + input.name,
        metadata: { horizon: input.horizon }
      });
    } else if (input.action === "update") {
      await updateGoal(input.id, input);
    } else if (input.action === "delete") {
      await deleteGoal(input.id);
      await recordAuditEvent({
        actorUserId: user.id,
        action: "GOAL_DELETED",
        entityType: "goal",
        entityId: input.id,
        summary: user.fullName + " removed a goal",
        metadata: {}
      });
    } else if (input.action === "addTarget") {
      await addTarget(input);
    } else if (input.action === "setTarget") {
      await setTargetValue(input.targetId, input.current);
    } else {
      await removeTarget(input.targetId);
    }

    return NextResponse.json({ goals: await listGoals(), message: "Saved." });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That goal was not valid." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "That could not be saved." }, { status: 500 });
  }
}
