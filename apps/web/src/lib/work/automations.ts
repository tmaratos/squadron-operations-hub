import { getDatabase } from "@/lib/cloudflare";
import { addComment, updateItem } from "./items";
import { nowIso, parseJson, WORKSPACE_ID } from "./structure";
import type { Automation, AutomationAction, AutomationCondition, AutomationTrigger, ItemPriority, ScopeType } from "./types";

// Automations: when a trigger happens to an item and every condition matches, run the actions in order.
// Actions write directly through the item layer and do not fire further automations, so rules cannot loop.

export type AutomationEvent =
  | { type: "item_created" }
  | { type: "status_changed"; statusName: string }
  | { type: "priority_changed"; priority: ItemPriority | null }
  | { type: "tag_added"; tags: string[] }
  | { type: "assignee_added" };

interface AutomationRow {
  id: string;
  scope_type: ScopeType;
  scope_id: string;
  name: string;
  trigger_json: string;
  conditions_json: string;
  actions_json: string;
  enabled: number;
  last_run_at: string | null;
}

interface ItemState {
  list_id: string;
  priority: ItemPriority | null;
  status_name: string | null;
  assignees: number;
  tags: string[];
}

const COLUMNS = "id, scope_type, scope_id, name, trigger_json, conditions_json, actions_json, enabled, last_run_at";

function toAutomation(row: AutomationRow): Automation {
  return {
    id: row.id,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    name: row.name,
    trigger: parseJson<AutomationTrigger>(row.trigger_json, { type: "item_created" }),
    conditions: parseJson<AutomationCondition[]>(row.conditions_json, []),
    actions: parseJson<AutomationAction[]>(row.actions_json, []),
    enabled: Boolean(row.enabled),
    lastRunAt: row.last_run_at
  };
}

export async function listAutomations(scopeType: ScopeType, scopeId: string): Promise<Automation[]> {
  const result = await getDatabase()
    .prepare("SELECT " + COLUMNS + " FROM automations WHERE scope_type = ? AND scope_id = ? ORDER BY created_at ASC")
    .bind(scopeType, scopeId)
    .all<AutomationRow>();
  return result.results.map(toAutomation);
}

export async function createAutomation(input: {
  scopeType: ScopeType;
  scopeId: string;
  name: string;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  userId: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  const now = nowIso();
  await getDatabase()
    .prepare(
      "INSERT INTO automations (id, workspace_id, scope_type, scope_id, name, trigger_json, conditions_json, actions_json, enabled, created_by, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)"
    )
    .bind(id, WORKSPACE_ID, input.scopeType, input.scopeId, input.name.trim(), JSON.stringify(input.trigger), JSON.stringify(input.conditions), JSON.stringify(input.actions), input.userId, now, now)
    .run();
  return id;
}

export async function setAutomationEnabled(automationId: string, enabled: boolean): Promise<void> {
  await getDatabase().prepare("UPDATE automations SET enabled = ?, updated_at = ? WHERE id = ?").bind(enabled ? 1 : 0, nowIso(), automationId).run();
}

export async function deleteAutomation(automationId: string): Promise<void> {
  await getDatabase().prepare("DELETE FROM automations WHERE id = ?").bind(automationId).run();
}

export async function recentRuns(automationIds: string[], limit = 20): Promise<Array<{ automationId: string; outcome: string; detail: string | null; createdAt: string }>> {
  if (!automationIds.length) return [];
  const marks = automationIds.map(() => "?").join(", ");
  const result = await getDatabase()
    .prepare("SELECT automation_id, outcome, detail, created_at FROM automation_runs WHERE automation_id IN (" + marks + ") ORDER BY created_at DESC LIMIT ?")
    .bind(...automationIds, limit)
    .all<{ automation_id: string; outcome: string; detail: string | null; created_at: string }>();
  return result.results.map((row) => ({ automationId: row.automation_id, outcome: row.outcome, detail: row.detail, createdAt: row.created_at }));
}

function triggerMatches(trigger: AutomationTrigger, event: AutomationEvent): boolean {
  if (trigger.type === "status_changed") {
    return event.type === "status_changed" && (!trigger.toStatusName || trigger.toStatusName.toLowerCase() === event.statusName.toLowerCase());
  }
  if (trigger.type === "priority_changed") {
    return event.type === "priority_changed" && (!trigger.toPriority || trigger.toPriority === event.priority);
  }
  if (trigger.type === "tag_added") {
    return event.type === "tag_added" && (!trigger.tag || event.tags.includes(trigger.tag.toLowerCase()));
  }
  return trigger.type === event.type;
}

async function loadState(itemId: string): Promise<ItemState | null> {
  const db = getDatabase();
  const row = await db
    .prepare(
      "SELECT items.list_id, items.priority, s.name AS status_name, (SELECT COUNT(*) FROM item_assignees a WHERE a.item_id = items.id) AS assignees " +
      "FROM items LEFT JOIN list_statuses s ON s.id = items.status_id WHERE items.id = ?"
    )
    .bind(itemId)
    .first<{ list_id: string; priority: ItemPriority | null; status_name: string | null; assignees: number }>();
  if (!row) return null;
  const tags = await db.prepare("SELECT t.label FROM item_tags it JOIN task_tags t ON t.id = it.tag_id WHERE it.item_id = ?").bind(itemId).all<{ label: string }>();
  return { ...row, assignees: Number(row.assignees ?? 0), tags: tags.results.map((tag) => tag.label) };
}

function conditionMatches(condition: AutomationCondition, state: ItemState): boolean {
  switch (condition.type) {
    case "has_tag":
      return state.tags.includes(condition.tag.toLowerCase());
    case "priority_is":
      return state.priority === condition.priority;
    case "status_is":
      return (state.status_name ?? "").toLowerCase() === condition.statusName.toLowerCase();
    case "no_assignee":
      return state.assignees === 0;
    default:
      return false;
  }
}

async function applyAction(action: AutomationAction, itemId: string, state: ItemState, userId: string): Promise<string> {
  const db = getDatabase();
  switch (action.type) {
    case "set_status": {
      const status = await db.prepare("SELECT id FROM list_statuses WHERE list_id = ? AND lower(name) = lower(?) LIMIT 1").bind(state.list_id, action.statusName).first<{ id: string }>();
      if (!status) throw new Error("This list has no status named " + action.statusName + ".");
      await updateItem(itemId, { statusId: status.id });
      state.status_name = action.statusName;
      return "set status to " + action.statusName;
    }
    case "set_priority":
      await updateItem(itemId, { priority: action.priority });
      state.priority = action.priority;
      return "set priority to " + action.priority.toLowerCase();
    case "add_tag": {
      const tag = action.tag.trim().toLowerCase();
      if (!state.tags.includes(tag)) {
        state.tags = [...state.tags, tag];
        await updateItem(itemId, { tags: state.tags });
      }
      return "added tag " + tag;
    }
    case "remove_tag": {
      const tag = action.tag.trim().toLowerCase();
      state.tags = state.tags.filter((entry) => entry !== tag);
      await updateItem(itemId, { tags: state.tags });
      return "removed tag " + tag;
    }
    case "assign":
      await db.prepare("INSERT OR IGNORE INTO item_assignees (item_id, user_id, assigned_at) VALUES (?, ?, ?)").bind(itemId, action.userId, nowIso()).run();
      state.assignees += 1;
      return "assigned a member";
    case "add_comment":
      await addComment({ itemId, body: action.body, userId });
      return "posted a comment";
    case "set_due_in_days": {
      const dueOn = new Date(Date.now() + action.days * 86400000).toISOString().slice(0, 10);
      await updateItem(itemId, { dueOn });
      return "set due date to " + dueOn;
    }
    default:
      throw new Error("Unknown action.");
  }
}

async function recordRun(automationId: string, itemId: string, outcome: "SUCCESS" | "SKIPPED" | "FAILED", detail: string): Promise<void> {
  const db = getDatabase();
  const now = nowIso();
  await db.batch([
    db.prepare("INSERT INTO automation_runs (id, automation_id, item_id, outcome, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), automationId, itemId, outcome, detail.slice(0, 1000), now),
    db.prepare("UPDATE automations SET last_run_at = ? WHERE id = ?").bind(now, automationId)
  ]);
}

// Runs every enabled automation for the item's list (and workspace-wide rules) whose trigger matches one of the events.
// Never throws: a broken rule is recorded as FAILED and must not block the member's own edit.
export async function runAutomations(input: { itemId: string; listId: string; events: AutomationEvent[]; userId: string }): Promise<number> {
  if (!input.events.length) return 0;
  let ran = 0;
  try {
    const rows = await getDatabase()
      .prepare("SELECT " + COLUMNS + " FROM automations WHERE enabled = 1 AND ((scope_type = 'list' AND scope_id = ?) OR (scope_type = 'workspace' AND scope_id = ?)) ORDER BY created_at ASC")
      .bind(input.listId, WORKSPACE_ID)
      .all<AutomationRow>();
    for (const automation of rows.results.map(toAutomation)) {
      if (!input.events.some((event) => triggerMatches(automation.trigger, event))) continue;
      const state = await loadState(input.itemId);
      if (!state) break;
      if (!automation.conditions.every((condition) => conditionMatches(condition, state))) {
        await recordRun(automation.id, input.itemId, "SKIPPED", "Conditions did not match.");
        continue;
      }
      try {
        const done: string[] = [];
        for (const action of automation.actions) done.push(await applyAction(action, input.itemId, state, input.userId));
        await recordRun(automation.id, input.itemId, "SUCCESS", done.join("; "));
        ran += 1;
      } catch (error) {
        await recordRun(automation.id, input.itemId, "FAILED", error instanceof Error ? error.message : "Action failed.");
      }
    }
  } catch (error) {
    console.error("Automations could not run", error);
  }
  return ran;
}
