import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { assertSameOrigin } from "@/lib/security/origin";
import { addStep, addTarget, createGoal, deleteGoal, listGoals, removeStep, removeTarget, setTargetValue, updateGoal, updateStep } from "@/lib/goals/goals";
import { draftGoal } from "@/lib/goals/draft";
import { benchmarksFor } from "@/lib/goals/benchmarks";
import { departmentName, tellDepartment, type TellResult } from "@/lib/goals/department";
import { createItem, updateItem } from "@/lib/work/items";

const horizon = z.enum(["SHORT", "LONG"]);
const status = z.enum(["OPEN", "MET", "MISSED", "ABANDONED"]);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    areaKey: z.string().trim().max(60).nullable().optional(),
    name: z.string().trim().min(3).max(160),
    detail: z.string().trim().max(2000).optional(),
    horizon,
    targetDate: date,
    ownerUserId: z.string().trim().max(80).nullable().optional()
  }),
  z.object({
    action: z.literal("update"),
    areaKey: z.string().trim().max(60).nullable().optional(),
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
  z.object({ action: z.literal("removeTarget"), targetId: z.string().trim().min(1).max(80) }),

  // Describe it and the assistant proposes. This one only reads and returns; it writes nothing.
  z.object({ action: z.literal("draft"), prompt: z.string().trim().min(8).max(2000) }),

  // What the person confirmed after looking at the draft, which is not necessarily what was proposed.
  z.object({
    action: z.literal("createFromDraft"),
    name: z.string().trim().min(3).max(160),
    detail: z.string().trim().max(2000).nullable().optional(),
    horizon: horizon,
    targetDate: date,
    steps: z.array(z.object({
      title: z.string().trim().min(3).max(200),
      dueOn: date,
      listId: z.string().trim().max(80).nullable().optional()
    })).max(12)
  }),

  z.object({ action: z.literal("addStep"), goalId: z.string().trim().min(1).max(80), title: z.string().trim().min(3).max(200), listId: z.string().trim().max(80).nullable().optional(), dueOn: date }),
  z.object({ action: z.literal("renameStep"), stepId: z.string().trim().min(1).max(80), title: z.string().trim().min(3).max(200) }),
  z.object({ action: z.literal("removeStep"), stepId: z.string().trim().min(1).max(80) }),
  // One press: the Hub reads the regulation and fills the steps in.
  z.object({ action: z.literal("fillFromRegs"), goalId: z.string().trim().min(1).max(80) })
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

    if (input.action === "draft") {
      // Reading and proposing only. Nothing is created here, whatever the assistant comes back with.
      return NextResponse.json(await draftGoal(input.prompt, user.id));
    }

    if (input.action === "createFromDraft") {
      const goalId = await createGoal({
        name: input.name,
        detail: input.detail ?? null,
        horizon: input.horizon,
        targetDate: input.targetDate ?? null,
        userId: user.id
      });

      // Each step becomes a real task where a list was chosen, and stays a plain line where one was not. A
      // step with no home is still worth keeping: it is the part somebody has not decided about yet.
      let made = 0;
      for (const step of input.steps) {
        let itemId: string | null = null;
        if (step.listId) {
          itemId = await createItem({ listId: step.listId, title: step.title, userId: user.id });
          if (step.dueOn) await updateItem(itemId, { dueOn: step.dueOn });
          made += 1;
        }
        await addStep({ goalId, title: step.title, itemId });
      }

      await recordAuditEvent({
        actorUserId: user.id,
        action: "GOAL_CREATED",
        entityType: "goal",
        entityId: goalId,
        summary: user.fullName + " set up the goal \u201c" + input.name + "\u201d with " + input.steps.length + " steps, " + made + " of them as tasks",
        metadata: { steps: input.steps.length, tasksMade: made, viaAssistant: true }
      });

      return NextResponse.json({
        goals: await listGoals(),
        goalId,
        message: made
          ? "Set up, and " + made + (made === 1 ? " task was made" : " tasks were made") + " for the steps."
          : "Set up. No step had a list chosen, so no tasks were made yet."
      });
    }

    if (input.action === "fillFromRegs") {
      const goal = (await listGoals()).find((candidate) => candidate.id === input.goalId);
      if (!goal) return NextResponse.json({ message: "That goal is no longer there." }, { status: 404 });

      const found = await benchmarksFor({ userId: user.id, goalName: goal.name, goalDetail: goal.detail });

      // Filled in rather than offered for approval, because the point of the button is not to hand somebody a
      // second list to retype. What makes that safe is not trust: every step has already been checked in code
      // against a passage in the squadron's own documents, and anything that could not be tied to one was
      // dropped before getting here. Each carries where it came from, and any of them can be removed.
      const already = new Set(goal.steps.map((step) => step.title.trim().toLowerCase()));
      let added = 0;
      for (const benchmark of found.benchmarks) {
        if (already.has(benchmark.title.trim().toLowerCase())) continue;
        await addStep({ goalId: input.goalId, title: benchmark.title });
        added += 1;
      }

      // The department is told what it is now expected to do, not merely that a goal exists. Steps appearing
      // under a goal nobody was told about is how a checklist gets discovered a week before the inspection.
      let reached: TellResult | null = null;
      if (added && goal.areaKey && goal.areaName) {
        reached = await tellDepartment({
          areaKey: goal.areaKey,
          areaName: goal.areaName,
          title: goal.name + ": " + added + " step" + (added === 1 ? "" : "s") + " added from the regulations",
          body:
            found.benchmarks.map((benchmark) => "- " + benchmark.title + " (" + benchmark.source + ")").join("\n") +
            "\n\nEach came from a squadron document and shows which one. Check them in the Hub.",
          url: "/goals",
          actorUserId: user.id
        });
      }

      return NextResponse.json({
        goals: await listGoals(),
        told: reached?.names ?? [],
        sources: found.benchmarks.map((benchmark) => ({
          title: benchmark.title,
          source: benchmark.source,
          webViewLink: benchmark.webViewLink,
          quote: benchmark.quote
        })),
        message: added
          ? "Filled in " + added + " step" + (added === 1 ? "" : "s") + " from " +
            [...new Set(found.benchmarks.map((benchmark) => benchmark.source))].join(", ") + "." +
            (reached?.told ? " " + reached.names.length + " in " + goal.areaName + " emailed." : "")
          : found.benchmarks.length
            ? "Everything the regulations set out for this is already here."
            : found.message
      });
    }

    if (input.action === "addStep") {
      let itemId: string | null = null;
      if (input.listId) {
        itemId = await createItem({ listId: input.listId, title: input.title, userId: user.id });
        if (input.dueOn) await updateItem(itemId, { dueOn: input.dueOn });
      }
      await addStep({ goalId: input.goalId, title: input.title, itemId });
      return NextResponse.json({ goals: await listGoals(), message: itemId ? "Step added, and a task made for it." : "Step added." });
    }

    if (input.action === "renameStep") {
      await updateStep(input.stepId, { title: input.title });
      return NextResponse.json({ goals: await listGoals(), message: "Saved." });
    }

    if (input.action === "removeStep") {
      // The step goes and the task stays. Taking something off a goal is not a reason to destroy work.
      await removeStep(input.stepId);
      return NextResponse.json({ goals: await listGoals(), message: "Step removed. The task it pointed at is still in its list." });
    }

    let told: TellResult | null = null;

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

      // A goal given to a department is given to the people holding posts in it, and they are told so. A
      // department has no inbox of its own and should not have one: post holders change, and a shared address
      // is how something ends up being nobody's.
      if (input.areaKey) {
        const area = await departmentName(input.areaKey);
        if (area) {
          told = await tellDepartment({
            areaKey: input.areaKey,
            areaName: area,
            title: area + " has a new goal: " + input.name,
            body:
              (input.detail ? input.detail + "\n\n" : "") +
              "Set by " + user.fullName + "." +
              (input.targetDate ? " It has to be true by " + input.targetDate + "." : ""),
            url: "/goals",
            actorUserId: user.id
          });
        }
      }
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
    } else if (input.action === "removeTarget") {
      await removeTarget(input.targetId);
    }

    return NextResponse.json({
      goals: await listGoals(),
      message: told?.told
        // Said out loud, with the names, because "the department was told" is not something a member can check
        // and a goal quietly reaching nobody is the failure worth noticing.
        ? "Saved, and " + told.names.length + " " + (told.names.length === 1 ? "person" : "people") +
          " in that department told by email: " + told.names.join(", ") + "." +
          (told.emailedOnly ? " " + told.emailedOnly + " of them have no Hub account, so it went to their CAP address." : "")
        : "Saved."
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That goal was not valid." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "That could not be saved." }, { status: 500 });
  }
}
