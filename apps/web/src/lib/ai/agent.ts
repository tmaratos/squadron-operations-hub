import { z } from "zod";
import { listTaskTags } from "@/lib/operations/tasks";
import { createAutomation } from "@/lib/work/automations";
import { createWidget, listDashboards } from "@/lib/work/dashboards";
import { createItem, updateItem } from "@/lib/work/items";
import { createField, createFolder, createList, createSpace, createView, getWorkspaceTree, listStatuses, saveStatuses } from "@/lib/work/structure";
import type { FieldType, ItemPriority, StatusCategory, ViewType } from "@/lib/work/types";
import { logBuild, recordCapabilityRequest } from "./capability-requests";
import { parseJsonReply } from "./local";
import { aiChatFor } from "./provider";

// The Hub assistant turns a request into a plan built from ordinary Hub actions, so it can never do more
// than the member could do by hand, and everything it makes can be edited or deleted afterwards like
// anything else. It builds the workspace too, not just the work in it: departments, lists, the fields a
// department needs, saved views, and automations.
//
// When a request needs something the Hub genuinely cannot do, the honest answer is "not yet" - so there is
// a step for exactly that, which records the ask rather than quietly building an approximation.

const FIELD_TYPES = ["text", "long_text", "number", "currency", "date", "checkbox", "dropdown", "labels", "person", "url", "email", "phone", "rating", "progress"] as const;
const PRIORITIES = ["URGENT", "HIGH", "NORMAL", "LOW"] as const;

export const stepSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_task"),
    list: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(300),
    dueOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    priority: z.enum(PRIORITIES).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(6).optional(),
    description: z.string().trim().max(4000).optional()
  }),
  // A department: Aerospace Education, Emergency Services, Cadet Programs.
  z.object({
    type: z.literal("create_department"),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(400).optional(),
    color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional()
  }),
  // A section inside a department, which is where work actually lives.
  z.object({
    type: z.literal("create_list"),
    name: z.string().trim().min(1).max(80),
    department: z.string().trim().max(120).optional(),
    description: z.string().trim().max(400).optional(),
    folder: z.string().trim().max(80).optional()
  }),
  // The steps a piece of work moves through, when the default To do / In progress / Done is not enough.
  z.object({
    type: z.literal("set_statuses"),
    list: z.string().trim().min(1).max(120),
    statuses: z.array(z.object({
      name: z.string().trim().min(1).max(40),
      category: z.enum(["NOT_STARTED", "ACTIVE", "DONE", "CLOSED"])
    })).min(2).max(12)
  }),
  // What a department needs to record that a task alone does not capture.
  z.object({
    type: z.literal("add_field"),
    list: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(60),
    fieldType: z.enum(FIELD_TYPES),
    options: z.array(z.string().trim().min(1).max(40)).max(20).optional()
  }),
  z.object({
    type: z.literal("create_view"),
    list: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(60),
    viewType: z.enum(["list", "board", "table", "calendar"]),
    groupBy: z.enum(["status", "priority", "assignee", "due", "none"]).optional(),
    due: z.enum(["overdue", "today", "next7", "next14", "none"]).optional()
  }),
  z.object({
    type: z.literal("create_automation"),
    list: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(80),
    when: z.enum(["item_created", "status_changed", "assignee_added", "tag_added"]),
    whenStatus: z.string().trim().max(40).optional(),
    whenTag: z.string().trim().max(40).optional(),
    then: z.enum(["set_status", "set_priority", "add_tag", "add_comment", "set_due_in_days"]),
    thenValue: z.string().trim().max(200).optional()
  }),
  z.object({
    type: z.literal("add_dashboard_card"),
    cardType: z.enum(["count", "item_list", "status_breakdown", "assignee_workload", "tag_breakdown"]),
    title: z.string().trim().min(1).max(80),
    dashboard: z.string().trim().max(120).optional(),
    list: z.string().trim().max(120).optional(),
    due: z.enum(["overdue", "today", "next7", "next14", "none"]).optional(),
    statusName: z.string().trim().max(40).optional(),
    tag: z.string().trim().max(40).optional()
  }),
  // The honest answer. Nothing is built; the ask is written down for whoever maintains the Hub.
  z.object({
    type: z.literal("not_possible_yet"),
    what: z.string().trim().min(3).max(500),
    why: z.string().trim().max(300).optional()
  })
]);

export type PlanStep = z.infer<typeof stepSchema>;
export const planSchema = z.array(stepSchema).max(16);

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
    "You help a Civil Air Patrol squadron run their operations hub. Turn the member's request into a short plan of actions.",
    'Reply with JSON only, shaped like: {"reply": "one short sentence", "steps": [ ... ]}.',
    "Allowed steps:",
    '{"type":"create_task","list":"<existing list>","title":"...","dueOn":"YYYY-MM-DD","priority":"URGENT|HIGH|NORMAL|LOW","tags":["existing tag"],"description":"..."}',
    '{"type":"create_department","name":"Aerospace Education","description":"..."}',
    '{"type":"create_list","name":"Cadet Lessons","department":"<existing or newly created department>","description":"..."}',
    '{"type":"set_statuses","list":"...","statuses":[{"name":"Assigned","category":"NOT_STARTED"},{"name":"Plan submitted","category":"ACTIVE"},{"name":"Reviewed","category":"ACTIVE"},{"name":"Presented","category":"DONE"}]}',
    '{"type":"add_field","list":"...","name":"Presenter","fieldType":"person|date|dropdown|text|long_text|number|checkbox|url|rating|progress|labels|currency|email|phone","options":["only for dropdown"]}',
    '{"type":"create_view","list":"...","name":"By month","viewType":"list|board|table|calendar","groupBy":"status|priority|assignee|due|none","due":"overdue|today|next7|next14"}',
    '{"type":"create_automation","list":"...","name":"...","when":"item_created|status_changed|assignee_added|tag_added","whenStatus":"...","then":"set_status|set_priority|add_tag|add_comment|set_due_in_days","thenValue":"..."}',
    '{"type":"add_dashboard_card","cardType":"count|item_list|status_breakdown|assignee_workload|tag_breakdown","title":"...","due":"overdue|today|next7|next14","list":"<list>","tag":"<tag>"}',
    '{"type":"not_possible_yet","what":"<what they asked for, in their words>","why":"<short reason>"}',
    "",
    "Rules:",
    "- Build real structure when asked for something new: a department, then its lists, then the fields and views that department needs.",
    "- Use list and department names exactly as given, or as created earlier in the same plan.",
    "- Use tags only from the tag list. Never invent people, CAPIDs, regulations, or deadlines.",
    "- If part of the request needs something the Hub cannot do - sending mail, editing files, anything needing new code - use not_possible_yet for that part and still do the rest.",
    "- If the request is only a question, return an empty steps array and answer in reply.",
    "Today is " + today() + ".",
    "Departments: " + (context.spaces.map((space) => space.name).join(" | ") || "none yet"),
    "Lists: " + (context.lists.map((list) => list.name).join(" | ") || "none yet"),
    "Tags: " + context.tags.slice(0, 60).join(", ")
  ].join("\n");

  const raw = await aiChatFor(userId, [
    { role: "system", content: system },
    { role: "user", content: prompt }
  ], { json: true, maxTokens: 1100 });

  const parsed = parseJsonReply<{ reply?: unknown; steps?: unknown }>(raw, {});
  const steps: PlanStep[] = [];
  if (Array.isArray(parsed.steps)) {
    parsed.steps.forEach((candidate) => {
      const result = stepSchema.safeParse(candidate);
      if (result.success) steps.push(result.data);
    });
  }
  const reply = typeof parsed.reply === "string" && parsed.reply.trim()
    ? parsed.reply.trim()
    : steps.length ? "Here is what I can do." : "I could not turn that into actions. Try naming what you want and where it should go.";
  return { steps, reply };
}

function matchList(lists: Array<{ id: string; name: string }>, wanted?: string) {
  if (!wanted) return undefined;
  const needle = wanted.trim().toLowerCase();
  return lists.find((list) => list.name.toLowerCase() === needle)
    ?? lists.find((list) => list.name.toLowerCase().includes(needle))
    ?? lists.find((list) => needle.includes(list.name.toLowerCase()));
}

export interface AppliedStep {
  ok: boolean;
  label: string;
  href?: string;
}

// Describes a step in plain English so a member knows exactly what they are approving.
export function describeStep(step: PlanStep): string {
  switch (step.type) {
    case "create_task": {
      const extras = [
        step.dueOn ? "due " + step.dueOn : "",
        step.priority ? step.priority.toLowerCase() + " priority" : "",
        step.tags?.length ? "tags: " + step.tags.join(", ") : ""
      ].filter(Boolean).join(", ");
      return 'Create task "' + step.title + '" in ' + step.list + (extras ? " (" + extras + ")" : "");
    }
    case "create_department":
      return 'Create a department called "' + step.name + '"';
    case "create_list":
      return 'Create a list called "' + step.name + '"' + (step.department ? " in " + step.department : "");
    case "set_statuses":
      return "Set " + step.list + " to move through: " + step.statuses.map((status) => status.name).join(" → ");
    case "add_field":
      return 'Add a "' + step.name + '" field (' + step.fieldType.replace(/_/g, " ") + ") to " + step.list;
    case "create_view":
      return 'Add a "' + step.name + '" ' + step.viewType + " view to " + step.list;
    case "create_automation":
      return 'Add a rule to ' + step.list + ': "' + step.name + '"';
    case "add_dashboard_card":
      return 'Add a "' + step.title + '" card to the dashboard';
    case "not_possible_yet":
      return "The Hub cannot do this yet: " + step.what + ". It will be written down for the people who maintain it.";
  }
}

function priorityFrom(value: string | undefined): ItemPriority | null {
  const upper = (value ?? "").toUpperCase();
  return (PRIORITIES as readonly string[]).includes(upper) ? (upper as ItemPriority) : null;
}

export async function applyPlan(steps: PlanStep[], userId: string, prompt = ""): Promise<AppliedStep[]> {
  const context = await workspaceContext();
  const lists = context.lists.map((list) => ({ id: list.id, name: list.name }));
  const spaces = context.spaces.map((space) => ({ id: space.id, name: space.name }));
  const applied: AppliedStep[] = [];

  const record = async (step: PlanStep, result: AppliedStep, targetKind?: string, targetId?: string) => {
    applied.push(result);
    await logBuild({ userId, prompt, stepType: step.type, label: result.label, ok: result.ok, targetKind, targetId });
  };

  for (const step of steps) {
    try {
      switch (step.type) {
        case "create_task": {
          const list = matchList(lists, step.list);
          if (!list) {
            await record(step, { ok: false, label: 'No list named "' + step.list + '", so "' + step.title + '" was not created.' });
            break;
          }
          const id = await createItem({ listId: list.id, title: step.title, userId });
          const allowed = new Set(context.tags.map((tag) => tag.toLowerCase()));
          await updateItem(id, {
            dueOn: step.dueOn ?? null,
            priority: step.priority ?? null,
            description: step.description ?? null,
            tags: (step.tags ?? []).map((tag) => tag.toLowerCase()).filter((tag) => allowed.has(tag))
          });
          await record(step, { ok: true, label: 'Created "' + step.title + '" in ' + list.name, href: "/lists/" + list.id + "?item=" + encodeURIComponent(id) }, "item", id);
          break;
        }

        case "create_department": {
          const id = await createSpace({ name: step.name, description: step.description ?? null, color: step.color, userId });
          spaces.push({ id, name: step.name });
          await record(step, { ok: true, label: 'Created the department "' + step.name + '"', href: "/spaces" }, "space", id);
          break;
        }

        case "create_list": {
          // A list goes in the department it was asked for, including one created earlier in this same plan.
          const space = step.department
            ? spaces.find((entry) => entry.name.toLowerCase() === step.department!.trim().toLowerCase())
              ?? spaces.find((entry) => entry.name.toLowerCase().includes(step.department!.trim().toLowerCase()))
            : spaces[0];
          if (!space) {
            await record(step, { ok: false, label: 'There is no department called "' + step.department + '" to put "' + step.name + '" in.' });
            break;
          }
          const folderId = step.folder ? await createFolder({ spaceId: space.id, name: step.folder }) : null;
          const id = await createList({ spaceId: space.id, folderId, name: step.name, description: step.description ?? null, userId });
          lists.push({ id, name: step.name });
          await record(step, { ok: true, label: 'Created the list "' + step.name + '" in ' + space.name, href: "/lists/" + id }, "list", id);
          break;
        }

        case "set_statuses": {
          const list = matchList(lists, step.list);
          if (!list) {
            await record(step, { ok: false, label: 'No list named "' + step.list + '".' });
            break;
          }
          const palette = ["#87909e", "#2a78d6", "#eda100", "#7b68ee", "#1baf7a", "#0ca30c"];
          await saveStatuses(list.id, step.statuses.map((status, index) => ({
            name: status.name,
            category: status.category as StatusCategory,
            color: status.category === "DONE" || status.category === "CLOSED" ? "#0ca30c" : palette[index % palette.length]
          })));
          await record(step, { ok: true, label: "Set the steps for " + list.name + ": " + step.statuses.map((status) => status.name).join(" → "), href: "/lists/" + list.id }, "list", list.id);
          break;
        }

        case "add_field": {
          const list = matchList(lists, step.list);
          if (!list) {
            await record(step, { ok: false, label: 'No list named "' + step.list + '".' });
            break;
          }
          const id = await createField({
            listId: list.id,
            name: step.name,
            type: step.fieldType as FieldType,
            options: step.fieldType === "dropdown" || step.fieldType === "labels"
              ? (step.options ?? []).map((label, index) => ({ id: "opt-" + index + "-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: label }))
              : undefined
          });
          await record(step, { ok: true, label: 'Added the field "' + step.name + '" to ' + list.name, href: "/lists/" + list.id }, "field", id);
          break;
        }

        case "create_view": {
          const list = matchList(lists, step.list);
          if (!list) {
            await record(step, { ok: false, label: 'No list named "' + step.list + '".' });
            break;
          }
          const id = await createView({
            scopeType: "list",
            scopeId: list.id,
            name: step.name,
            type: step.viewType as ViewType,
            config: {
              ...(step.groupBy ? { groupBy: step.groupBy } : {}),
              ...(step.due ? { filters: { due: step.due } } : {})
            },
            userId
          });
          await record(step, { ok: true, label: 'Added the "' + step.name + '" view to ' + list.name, href: "/lists/" + list.id }, "view", id);
          break;
        }

        case "create_automation": {
          const list = matchList(lists, step.list);
          if (!list) {
            await record(step, { ok: false, label: 'No list named "' + step.list + '".' });
            break;
          }
          const statuses = await listStatuses(list.id);
          const statusNames = new Set(statuses.map((status) => status.name.toLowerCase()));
          const trigger = step.when === "status_changed"
            ? { type: "status_changed" as const, toStatusName: step.whenStatus }
            : step.when === "tag_added"
              ? { type: "tag_added" as const, tag: step.whenTag }
              : step.when === "assignee_added"
                ? { type: "assignee_added" as const }
                : { type: "item_created" as const };

          let action;
          if (step.then === "set_status") {
            if (!step.thenValue || !statusNames.has(step.thenValue.toLowerCase())) {
              await record(step, { ok: false, label: 'The rule "' + step.name + '" needs a status that exists on ' + list.name + "." });
              break;
            }
            action = { type: "set_status" as const, statusName: step.thenValue };
          } else if (step.then === "set_priority") {
            const priority = priorityFrom(step.thenValue);
            if (!priority) {
              await record(step, { ok: false, label: 'The rule "' + step.name + '" needs a real priority.' });
              break;
            }
            action = { type: "set_priority" as const, priority };
          } else if (step.then === "add_tag") {
            action = { type: "add_tag" as const, tag: (step.thenValue ?? "").toLowerCase() };
          } else if (step.then === "add_comment") {
            action = { type: "add_comment" as const, body: step.thenValue ?? "" };
          } else {
            const days = Number(step.thenValue);
            if (!Number.isFinite(days)) {
              await record(step, { ok: false, label: 'The rule "' + step.name + '" needs a number of days.' });
              break;
            }
            action = { type: "set_due_in_days" as const, days: Math.round(days) };
          }

          const id = await createAutomation({
            scopeType: "list",
            scopeId: list.id,
            name: step.name,
            trigger,
            conditions: [],
            actions: [action],
            userId
          });
          await record(step, { ok: true, label: 'Added the rule "' + step.name + '" to ' + list.name, href: "/lists/" + list.id }, "automation", id);
          break;
        }

        case "add_dashboard_card": {
          const dashboard = context.dashboards.find((entry) => !step.dashboard || entry.name.toLowerCase().includes(step.dashboard.toLowerCase())) ?? context.dashboards[0];
          if (!dashboard) {
            await record(step, { ok: false, label: "There is no dashboard to add a card to." });
            break;
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
          await record(step, { ok: true, label: 'Added the card "' + step.title + '" to ' + dashboard.name, href: "/dashboards?id=" + dashboard.id }, "dashboard", dashboard.id);
          break;
        }

        case "not_possible_yet": {
          await recordCapabilityRequest({ userId, request: prompt || step.what, interpretation: step.what + (step.why ? " — " + step.why : "") });
          await record(step, { ok: true, label: "Written down as something the Hub cannot do yet: " + step.what });
          break;
        }
      }
    } catch (error) {
      await record(step, { ok: false, label: describeStep(step) + " failed: " + (error instanceof Error ? error.message : "unknown error") });
    }
  }
  return applied;
}
