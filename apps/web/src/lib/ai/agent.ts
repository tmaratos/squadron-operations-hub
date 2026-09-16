import { z } from "zod";
import { listTaskTags } from "@/lib/operations/tasks";
import { createWidget, listDashboards } from "@/lib/work/dashboards";
import { createItem, updateItem } from "@/lib/work/items";
import { createList, getWorkspaceTree } from "@/lib/work/structure";
import { parseJsonReply } from "./local";
import { aiChatFor } from "./provider";

// The Hub assistant proposes work in plain English and only acts after a member approves the plan.
// Every step maps to an ordinary Hub action, so the assistant can never do more than a member could do by hand.

export const stepSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_task"),
    list: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(300),
    dueOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    priority: z.enum(["URGENT", "HIGH", "NORMAL", "LOW"]).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(6).optional(),
    description: z.string().trim().max(4000).optional()
  }),
  z.object({ type: z.literal("create_list"), name: z.string().trim().min(1).max(80), space: z.string().trim().max(120).optional() }),
  z.object({
    type: z.literal("add_dashboard_card"),
    cardType: z.enum(["count", "item_list", "status_breakdown", "assignee_workload", "tag_breakdown"]),
    title: z.string().trim().min(1).max(80),
    dashboard: z.string().trim().max(120).optional(),
    list: z.string().trim().max(120).optional(),
    due: z.enum(["overdue", "today", "next7", "next14", "none"]).optional(),
    statusName: z.string().trim().max(40).optional(),
    tag: z.string().trim().max(40).optional()
  })
]);

export type PlanStep = z.infer<typeof stepSchema>;
export const planSchema = z.array(stepSchema).max(12);

export interface PlanResult {
  steps: PlanStep[];
  reply: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function workspaceContext() {
  const [spaces, tags, dashboards] = await Promise.all([getWorkspaceTree(), listTaskTags(), listDashboards()]);
  const lists = spaces.flatMap((space) => [...space.lists, ...space.folders.flatMap((folder) => folder.lists)]);
  return { spaces, lists, tags: tags.map((tag) => tag.label), dashboards };
}

export async function buildPlan(prompt: string, userId: string): Promise<PlanResult> {
  const context = await workspaceContext();
  const system = [
    "You help a Civil Air Patrol squadron run their work tracker. Turn the member's request into a short plan of actions.",
    "Reply with JSON only, shaped like: {\"reply\": \"one short sentence\", \"steps\": [ ... ]}.",
    "Allowed steps:",
    '{"type":"create_task","list":"<existing list name>","title":"...","dueOn":"YYYY-MM-DD","priority":"URGENT|HIGH|NORMAL|LOW","tags":["existing tag"],"description":"..."}',
    '{"type":"create_list","name":"..."}',
    '{"type":"add_dashboard_card","cardType":"count|item_list|status_breakdown|assignee_workload|tag_breakdown","title":"...","due":"overdue|today|next7|next14","list":"<list name>","tag":"<tag>"}',
    "Rules: use list names exactly as given; use tags only from the tag list; never invent people; if the request is only a question, return an empty steps array and answer in reply.",
    "Today is " + today() + ".",
    "Lists: " + context.lists.map((list) => list.name).join(" | "),
    "Tags: " + context.tags.slice(0, 60).join(", ")
  ].join("\n");

  const raw = await aiChatFor(userId, [
    { role: "system", content: system },
    { role: "user", content: prompt }
  ], { json: true, maxTokens: 700 });

  const parsed = parseJsonReply<{ reply?: unknown; steps?: unknown }>(raw, {});
  const steps: PlanStep[] = [];
  if (Array.isArray(parsed.steps)) {
    parsed.steps.forEach((candidate) => {
      const result = stepSchema.safeParse(candidate);
      if (result.success) steps.push(result.data);
    });
  }
  const reply = typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : steps.length ? "Here is what I can do." : "I could not turn that into actions. Try naming a list and what you want created.";
  return { steps, reply };
}

function matchList(lists: Array<{ id: string; name: string }>, wanted?: string) {
  if (!wanted) return undefined;
  const needle = wanted.trim().toLowerCase();
  return lists.find((list) => list.name.toLowerCase() === needle) ?? lists.find((list) => list.name.toLowerCase().includes(needle)) ?? lists.find((list) => needle.includes(list.name.toLowerCase()));
}

export interface AppliedStep {
  ok: boolean;
  label: string;
  href?: string;
}

// Describes a step in plain English so a member knows exactly what they are approving.
export function describeStep(step: PlanStep): string {
  if (step.type === "create_task") {
    const extras = [
      step.dueOn ? "due " + step.dueOn : "",
      step.priority ? step.priority.toLowerCase() + " priority" : "",
      step.tags?.length ? "tags: " + step.tags.join(", ") : ""
    ].filter(Boolean).join(", ");
    return 'Create task "' + step.title + '" in ' + step.list + (extras ? " (" + extras + ")" : "");
  }
  if (step.type === "create_list") return 'Create a new list called "' + step.name + '"';
  return 'Add a "' + step.title + '" card to the dashboard';
}

export async function applyPlan(steps: PlanStep[], userId: string): Promise<AppliedStep[]> {
  const context = await workspaceContext();
  const lists = context.lists.map((list) => ({ id: list.id, name: list.name }));
  const applied: AppliedStep[] = [];

  for (const step of steps) {
    try {
      if (step.type === "create_task") {
        const list = matchList(lists, step.list);
        if (!list) {
          applied.push({ ok: false, label: 'No list named "' + step.list + '", so "' + step.title + '" was not created.' });
          continue;
        }
        const id = await createItem({ listId: list.id, title: step.title, userId });
        const allowed = new Set(context.tags.map((tag) => tag.toLowerCase()));
        await updateItem(id, {
          dueOn: step.dueOn ?? null,
          priority: step.priority ?? null,
          description: step.description ?? null,
          tags: (step.tags ?? []).map((tag) => tag.toLowerCase()).filter((tag) => allowed.has(tag))
        });
        applied.push({ ok: true, label: 'Created "' + step.title + '" in ' + list.name, href: "/lists/" + list.id + "?item=" + encodeURIComponent(id) });
        continue;
      }

      if (step.type === "create_list") {
        const space = context.spaces[0];
        if (!space) {
          applied.push({ ok: false, label: "There is no space to put a new list in." });
          continue;
        }
        const id = await createList({ spaceId: space.id, name: step.name, userId });
        applied.push({ ok: true, label: 'Created the list "' + step.name + '"', href: "/lists/" + id });
        continue;
      }

      const dashboard = context.dashboards.find((entry) => !step.dashboard || entry.name.toLowerCase().includes(step.dashboard.toLowerCase())) ?? context.dashboards[0];
      if (!dashboard) {
        applied.push({ ok: false, label: "There is no dashboard to add a card to." });
        continue;
      }
      const list = matchList(lists, step.list);
      await createWidget(dashboard.id, {
        type: step.cardType,
        title: step.title,
        config: {
          filters: {
            ...(step.due ? { due: step.due } : {}),
            ...(step.statusName ? { statusName: step.statusName } : {}),
            ...(step.tag ? { tags: [step.tag.toLowerCase()] } : {})
          },
          ...(list ? { listIds: [list.id] } : {}),
          ...(step.cardType === "item_list" ? { limit: 10, sortBy: "due" as const } : {}),
          ...(step.cardType === "count" ? { tone: "accent" as const } : {})
        },
        w: step.cardType === "count" ? 3 : 6
      });
      applied.push({ ok: true, label: 'Added the card "' + step.title + '" to ' + dashboard.name, href: "/dashboards?id=" + dashboard.id });
    } catch (error) {
      applied.push({ ok: false, label: describeStep(step) + " failed: " + (error instanceof Error ? error.message : "unknown error") });
    }
  }
  return applied;
}
