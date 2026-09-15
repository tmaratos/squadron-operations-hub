import { getDatabase } from "@/lib/cloudflare";
import { nowIso, parseJson, WORKSPACE_ID } from "./structure";
import type { Dashboard, DashboardWidget, ViewConfig, WidgetType } from "./types";

// Dashboards are rows in D1; their cards are computed from the items in the workspace at request time.

export interface DashboardItem {
  id: string;
  listId: string;
  listName: string;
  title: string;
  statusName: string | null;
  statusColor: string | null;
  closed: boolean;
  priority: string | null;
  dueOn: string | null;
  tags: string[];
  assignees: string[];
}

export type WidgetResult =
  | { kind: "count"; value: number }
  | { kind: "items"; items: DashboardItem[]; total: number }
  | { kind: "breakdown"; rows: Array<{ label: string; value: number; color?: string | null }> }
  | { kind: "text"; text: string };

export async function listDashboards(workspaceId = WORKSPACE_ID): Promise<Array<{ id: string; name: string; isHome: boolean }>> {
  const result = await getDatabase()
    .prepare("SELECT id, name, is_home FROM dashboards WHERE workspace_id = ? ORDER BY is_home DESC, name COLLATE NOCASE")
    .bind(workspaceId)
    .all<{ id: string; name: string; is_home: number }>();
  return result.results.map((row) => ({ id: row.id, name: row.name, isHome: Boolean(row.is_home) }));
}

export async function getDashboard(dashboardId: string): Promise<Dashboard | null> {
  const db = getDatabase();
  const row = await db.prepare("SELECT id, name, description, is_home FROM dashboards WHERE id = ?").bind(dashboardId)
    .first<{ id: string; name: string; description: string | null; is_home: number }>();
  if (!row) return null;
  const widgets = await db.prepare("SELECT id, dashboard_id, widget_type, title, config_json, grid_x, grid_y, grid_w, grid_h FROM dashboard_widgets WHERE dashboard_id = ? ORDER BY grid_y, grid_x")
    .bind(dashboardId)
    .all<{ id: string; dashboard_id: string; widget_type: WidgetType; title: string; config_json: string; grid_x: number; grid_y: number; grid_w: number; grid_h: number }>();
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isHome: Boolean(row.is_home),
    widgets: widgets.results.map((widget) => ({
      id: widget.id,
      dashboardId: widget.dashboard_id,
      type: widget.widget_type,
      title: widget.title,
      config: parseJson<DashboardWidget["config"]>(widget.config_json, {}),
      x: widget.grid_x,
      y: widget.grid_y,
      w: widget.grid_w,
      h: widget.grid_h
    }))
  };
}

export async function loadDashboardItems(workspaceId = WORKSPACE_ID): Promise<DashboardItem[]> {
  const db = getDatabase();
  const [rows, tags, people] = await Promise.all([
    db.prepare(
      "SELECT items.id, items.list_id, lists.name AS list_name, items.title, s.name AS status_name, s.color AS status_color, s.category, items.priority, items.due_on " +
      "FROM items JOIN lists ON lists.id = items.list_id JOIN spaces ON spaces.id = lists.space_id LEFT JOIN list_statuses s ON s.id = items.status_id " +
      "WHERE spaces.workspace_id = ? AND items.archived_at IS NULL AND lists.archived_at IS NULL"
    ).bind(workspaceId).all<{ id: string; list_id: string; list_name: string; title: string; status_name: string | null; status_color: string | null; category: string | null; priority: string | null; due_on: string | null }>(),
    db.prepare(
      "SELECT it.item_id, t.label FROM item_tags it JOIN task_tags t ON t.id = it.tag_id JOIN items ON items.id = it.item_id JOIN lists ON lists.id = items.list_id JOIN spaces ON spaces.id = lists.space_id WHERE spaces.workspace_id = ?"
    ).bind(workspaceId).all<{ item_id: string; label: string }>(),
    db.prepare(
      "SELECT a.item_id, u.full_name FROM item_assignees a JOIN users u ON u.id = a.user_id JOIN items ON items.id = a.item_id JOIN lists ON lists.id = items.list_id JOIN spaces ON spaces.id = lists.space_id WHERE spaces.workspace_id = ?"
    ).bind(workspaceId).all<{ item_id: string; full_name: string }>()
  ]);
  const tagMap = new Map<string, string[]>();
  tags.results.forEach((tag) => tagMap.set(tag.item_id, [...(tagMap.get(tag.item_id) ?? []), tag.label]));
  const personMap = new Map<string, string[]>();
  people.results.forEach((person) => personMap.set(person.item_id, [...(personMap.get(person.item_id) ?? []), person.full_name]));
  return rows.results.map((row) => ({
    id: row.id,
    listId: row.list_id,
    listName: row.list_name,
    title: row.title,
    statusName: row.status_name,
    statusColor: row.status_color,
    closed: row.category === "DONE" || row.category === "CLOSED",
    priority: row.priority,
    dueOn: row.due_on,
    tags: tagMap.get(row.id) ?? [],
    assignees: personMap.get(row.id) ?? []
  }));
}

function addDays(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

export function applyFilters(items: DashboardItem[], filters: ViewConfig["filters"] = {}, listIds?: string[]): DashboardItem[] {
  const today = addDays(0);
  const needle = filters.search?.trim().toLowerCase();
  return items.filter((item) => {
    if (!filters.includeClosed && item.closed) return false;
    if (listIds?.length && !listIds.includes(item.listId)) return false;
    if (filters.due === "overdue" && !(item.dueOn && item.dueOn < today)) return false;
    if (filters.due === "today" && item.dueOn !== today) return false;
    if (filters.due === "next7" && !(item.dueOn && item.dueOn >= today && item.dueOn <= addDays(7))) return false;
    if (filters.due === "next14" && !(item.dueOn && item.dueOn >= today && item.dueOn <= addDays(14))) return false;
    if (filters.due === "none" && item.dueOn) return false;
    if (filters.statusName && (item.statusName ?? "").toLowerCase() !== filters.statusName.toLowerCase()) return false;
    if (filters.tags?.length && !filters.tags.some((tag) => item.tags.includes(tag.toLowerCase()))) return false;
    if (filters.priorities?.length && !filters.priorities.some((priority) => priority === item.priority)) return false;
    if (needle && !item.title.toLowerCase().includes(needle)) return false;
    return true;
  });
}

function sortItems(items: DashboardItem[], sortBy: ViewConfig["sortBy"]): DashboardItem[] {
  const rank: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
  return [...items].sort((a, b) => {
    if (sortBy === "priority") return (rank[a.priority ?? ""] ?? 9) - (rank[b.priority ?? ""] ?? 9);
    if (sortBy === "title") return a.title.localeCompare(b.title);
    return (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999");
  });
}

function breakdown(values: Array<{ label: string; color?: string | null }>, limit = 12) {
  const counts = new Map<string, { value: number; color?: string | null }>();
  values.forEach((entry) => {
    const current = counts.get(entry.label);
    counts.set(entry.label, { value: (current?.value ?? 0) + 1, color: current?.color ?? entry.color });
  });
  return Array.from(counts.entries())
    .map(([label, entry]) => ({ label, value: entry.value, color: entry.color }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function renderWidget(widget: DashboardWidget, items: DashboardItem[]): WidgetResult {
  const scoped = applyFilters(items, widget.config.filters, widget.config.listIds);
  switch (widget.type) {
    case "count":
      return { kind: "count", value: scoped.length };
    case "item_list":
      return { kind: "items", items: sortItems(scoped, widget.config.sortBy).slice(0, widget.config.limit ?? 10), total: scoped.length };
    case "status_breakdown":
      return { kind: "breakdown", rows: breakdown(scoped.map((item) => ({ label: item.statusName ?? "no status", color: item.statusColor })), widget.config.limit) };
    case "assignee_workload":
      return { kind: "breakdown", rows: breakdown(scoped.flatMap((item) => (item.assignees.length ? item.assignees : ["Unassigned"]).map((label) => ({ label }))), widget.config.limit) };
    case "tag_breakdown":
      return { kind: "breakdown", rows: breakdown(scoped.flatMap((item) => item.tags.map((label) => ({ label }))), widget.config.limit) };
    default:
      return { kind: "text", text: widget.config.text ?? "" };
  }
}

export interface WidgetInput {
  type: WidgetType;
  title: string;
  config: DashboardWidget["config"];
  w?: number;
}

export async function createWidget(dashboardId: string, input: WidgetInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = nowIso();
  await getDatabase()
    .prepare(
      "INSERT INTO dashboard_widgets (id, dashboard_id, widget_type, title, config_json, grid_x, grid_y, grid_w, grid_h, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, 0, (SELECT COALESCE(MAX(grid_y), 0) + 1 FROM dashboard_widgets WHERE dashboard_id = ?), ?, 3, ?, ?)"
    )
    .bind(id, dashboardId, input.type, input.title.trim(), JSON.stringify(input.config ?? {}), dashboardId, input.w ?? 6, now, now)
    .run();
  return id;
}

export async function updateWidget(widgetId: string, input: Partial<WidgetInput>): Promise<void> {
  const db = getDatabase();
  const current = await db.prepare("SELECT widget_type, title, config_json, grid_w FROM dashboard_widgets WHERE id = ?").bind(widgetId)
    .first<{ widget_type: WidgetType; title: string; config_json: string; grid_w: number }>();
  if (!current) throw new Error("Card not found.");
  await db.prepare("UPDATE dashboard_widgets SET widget_type = ?, title = ?, config_json = ?, grid_w = ?, updated_at = ? WHERE id = ?")
    .bind(input.type ?? current.widget_type, input.title?.trim() || current.title, input.config ? JSON.stringify(input.config) : current.config_json, input.w ?? current.grid_w, nowIso(), widgetId)
    .run();
}

export async function deleteWidget(widgetId: string): Promise<void> {
  await getDatabase().prepare("DELETE FROM dashboard_widgets WHERE id = ?").bind(widgetId).run();
}

// Saves the card order: position in the array becomes grid_y, and grid_x resets so order is purely top to bottom.
export async function reorderWidgets(dashboardId: string, widgetIds: string[]): Promise<void> {
  const db = getDatabase();
  const now = nowIso();
  await db.batch(widgetIds.map((widgetId, index) =>
    db.prepare("UPDATE dashboard_widgets SET grid_y = ?, grid_x = 0, updated_at = ? WHERE id = ? AND dashboard_id = ?").bind(index, now, widgetId, dashboardId)
  ));
}
