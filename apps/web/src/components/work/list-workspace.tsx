"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PeoplePicker } from "./people-picker";
import type { Automation, AutomationAction, AutomationCondition, AutomationTrigger, CustomField, ItemDetail, ItemPriority, ListDetail, ListStatus, WorkItem } from "@/lib/work/types";
import { ConfirmButton } from "@/components/confirm-button";

type Person = { id: string; fullName: string; pending?: boolean };
type Mode = "list" | "board" | "table" | "calendar";

const MODE_LABELS: Record<Mode, string> = { list: "☰ List", board: "▦ Board", table: "▤ Table", calendar: "▣ Calendar" };
const CATEGORY_LABELS: Record<ListStatus["category"], string> = { NOT_STARTED: "Not started", ACTIVE: "Active", DONE: "Done", CLOSED: "Closed" };
type ApiResult = { message?: string; item: ItemDetail; items: WorkItem[] };

const PRIORITIES: ItemPriority[] = ["URGENT", "HIGH", "NORMAL", "LOW"];
const PRIORITY_COLOR: Record<ItemPriority, string> = { URGENT: "#e5484d", HIGH: "#f5a623", NORMAL: "#5f55ee", LOW: "#87909e" };

async function send(url: string, method: string, body?: unknown): Promise<ApiResult> {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as ApiResult;
  if (!response.ok) throw new Error(data.message || "Request failed.");
  return data;
}

function formatDue(value: string | null): { text: string; late: boolean; today: boolean } {
  if (!value) return { text: "", late: false, today: false };
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const date = new Date(value + "T12:00:00");
  const text = value === today ? "Today" : value === tomorrow ? "Tomorrow" : date.toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "2-digit" });
  return { text, late: value < today, today: value === today };
}

function initials(name: string): string {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function StatusIcon({ status }: { status?: ListStatus }) {
  const color = status?.color ?? "#87909e";
  if (status && (status.category === "DONE" || status.category === "CLOSED")) {
    return (
      <span className="lw-sicon lw-sicon--done" style={{ background: color, borderColor: color }} title={status.name}>
        <svg viewBox="0 0 12 12" width="9" height="9" aria-hidden="true"><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
    );
  }
  if (status && status.category === "ACTIVE") {
    return <span className="lw-sicon" style={{ borderColor: color, background: "conic-gradient(" + color + " 0 50%, transparent 50% 100%)" }} title={status.name} />;
  }
  return <span className="lw-sicon lw-sicon--todo" style={{ borderColor: color }} title={status?.name ?? "no status"} />;
}

export function ListWorkspace({ list, initialItems, people, canEdit, initialOpenId }: { list: ListDetail; initialItems: WorkItem[]; people: Person[]; canEdit: boolean; initialOpenId?: string | null }) {
  const [items, setItems] = useState<WorkItem[]>(initialItems);
  const [mode, setMode] = useState<Mode>("list");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [expandAll, setExpandAll] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const [editingStatuses, setEditingStatuses] = useState(false);
  const [editingFields, setEditingFields] = useState(false);
  const [editingAutomations, setEditingAutomations] = useState(false);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const [error, setError] = useState("");

  const statusById = useMemo(() => new Map(list.statuses.map((status) => [status.id, status] as const)), [list.statuses]);
  const isClosed = (item: WorkItem) => {
    const status = item.statusId ? statusById.get(item.statusId) : undefined;
    return Boolean(status && (status.category === "DONE" || status.category === "CLOSED"));
  };

  const needle = search.trim().toLowerCase();
  const matches = (item: WorkItem) =>
    (showClosed || !isClosed(item)) &&
    (!needle || item.title.toLowerCase().includes(needle) || item.tags.some((tag) => tag.label.includes(needle)));

  const childrenOf = useMemo(() => {
    const map = new Map<string, WorkItem[]>();
    items.forEach((item) => {
      if (!item.parentId) return;
      map.set(item.parentId, [...(map.get(item.parentId) ?? []), item]);
    });
    return map;
  }, [items]);

  const topLevel = items.filter((item) => !item.parentId || !items.some((other) => other.id === item.parentId));

  async function reload() {
    const data = await send("/api/work/lists/" + list.id + "/items", "GET");
    setItems(data.items);
  }

  async function quickAdd(title: string, statusId: string | null, parentId: string | null = null) {
    if (!title.trim()) return;
    setError("");
    try {
      await send("/api/work/lists/" + list.id + "/items", "POST", { title, statusId, parentId });
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add the task.");
    }
  }

  async function patch(itemId: string, body: Record<string, unknown>) {
    setError("");
    try {
      const data = await send("/api/work/items/" + itemId, "PATCH", body);
      await reload();
      return data.item;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
      return null;
    }
  }

  const doneStatus = list.statuses.find((entry) => entry.category === "DONE") ?? list.statuses.find((entry) => entry.category === "CLOSED");
  const openStatus = list.statuses.find((entry) => entry.category === "NOT_STARTED") ?? list.statuses[0];

  // One click to finish (or reopen) a task, always with an Undo so a slip is never a problem.
  async function toggleDone(item: WorkItem) {
    const wasClosed = isClosed(item);
    const target = wasClosed ? openStatus : doneStatus;
    if (!target) return;
    const previous = item.statusId;
    const result = await patch(item.id, { statusId: target.id });
    if (result) {
      setToast({
        text: (wasClosed ? "Reopened: " : "Marked done: ") + item.title,
        undo: async () => {
          setToast(null);
          await patch(item.id, { statusId: previous });
        }
      });
    }
  }

  function renderRow(item: WorkItem, depth: number): ReactNode {
    const kids = (childrenOf.get(item.id) ?? []).filter(matches);
    const status = item.statusId ? statusById.get(item.statusId) : undefined;
    const due = formatDue(item.dueOn);
    const open = expandAll || expanded[item.id];
    return (
      <div key={item.id}>
        {/* A task can be picked up and dropped on any list in the sidebar. The id travels in the drag,
            and the sidebar does the move - so filing something in the wrong place is not a dead end. */}
        <div
          className="lw-row"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData("application/x-hub-item", item.id);
            event.dataTransfer.setData("text/plain", item.title);
            event.dataTransfer.effectAllowed = "move";
            document.body.dataset.draggingItem = item.id;
          }}
          onDragEnd={() => { delete document.body.dataset.draggingItem; }}
          onClick={() => setOpenId(item.id)}
        >
          <div className="lw-name" style={{ paddingLeft: depth * 26 }}>
            <button
              className="lw-caret"
              aria-label={open ? "Hide subtasks" : "Show subtasks"}
              onClick={(event) => {
                event.stopPropagation();
                setExpanded({ ...expanded, [item.id]: !open });
              }}
              style={{ visibility: item.childCount ? "visible" : "hidden" }}
            >
              <svg viewBox="0 0 10 10" width="9" height="9" style={{ transform: open ? "rotate(90deg)" : "none" }} aria-hidden="true"><path d="M3 1.5 7 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
            </button>
            <button
              type="button"
              className="lw-complete"
              title={isClosed(item) ? "Reopen this task" : "Mark as done"}
              aria-label={(isClosed(item) ? "Reopen: " : "Mark done: ") + item.title}
              disabled={!canEdit}
              onClick={(event) => {
                event.stopPropagation();
                toggleDone(item);
              }}
            >
              <StatusIcon status={status} />
            </button>
            <span className={"lw-title" + (isClosed(item) ? " lw-title--closed" : "")}>{item.title}</span>
            {item.childCount ? <span className="lw-mini" title="Subtasks">⑂ {item.childCount}</span> : null}
            {item.checklistTotal ? <span className="lw-mini" title="Checklist">☑ {item.checklistDone}/{item.checklistTotal}</span> : null}
            {item.tags.slice(0, 2).map((tag) => <span key={tag.id} className={"lw-tag work-tag work-tag--" + tag.color}>{tag.label}</span>)}
            {item.tags.length > 2 ? <span className="lw-mini">+{item.tags.length - 2}</span> : null}
          </div>
          <div className="lw-cell">
            {item.assignees.length ? (
              <span className="lw-avatars">{item.assignees.slice(0, 3).map((person) => <span key={person.id} className="lw-avatar" title={person.fullName}>{initials(person.fullName)}</span>)}</span>
            ) : <span className="lw-empty-person" aria-label="Unassigned">
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="5.5" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M3 13.5c.8-2.4 2.7-3.6 5-3.6s4.2 1.2 5 3.6" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
            </span>}
          </div>
          <div className={"lw-cell" + (due.late && !isClosed(item) ? " lw-late" : due.today ? " lw-today" : "")}>
            {due.text || <span className="lw-faint">—</span>}
          </div>
          <div className="lw-cell">
            {item.priority ? <span style={{ color: PRIORITY_COLOR[item.priority] }}>⚑ <span className="lw-priority-text">{item.priority[0] + item.priority.slice(1).toLowerCase()}</span></span> : <span className="lw-faint">—</span>}
          </div>
        </div>
        {open ? kids.map((kid) => renderRow(kid, depth + 1)) : null}
      </div>
    );
  }

  const visibleStatuses = list.statuses.filter((status) => showClosed || (status.category !== "DONE" && status.category !== "CLOSED"));
  const unassignedStatus = topLevel.filter((item) => matches(item) && (!item.statusId || !statusById.has(item.statusId)));
  const openCount = items.filter((item) => !isClosed(item)).length;

  return (
    <div className="lw">
      <style>{lwCss}</style>
      <header className="lw-head">
        <span className="lw-space-badge">{list.spaceName.slice(0, 1).toUpperCase()}</span>
        <h1>{list.name}</h1>
        <span className="lw-head-count">{openCount} open</span>
      </header>

      <div className="lw-views" role="tablist">
        {(Object.keys(MODE_LABELS) as Mode[]).map((value) => (
          <button key={value} role="tab" aria-selected={mode === value} className={mode === value ? "is-active" : ""} onClick={() => setMode(value)}>
            {MODE_LABELS[value]}
          </button>
        ))}
      </div>

      <div className="lw-toolbar">
        <div className="lw-chips">
          <span className="lw-chip lw-chip--on">Group: Status</span>
          <button className={"lw-chip" + (expandAll ? " lw-chip--on" : "")} onClick={() => setExpandAll(!expandAll)}>⑂ {expandAll ? "Expanded" : "Collapsed"}</button>
          <button className={"lw-chip" + (showClosed ? " lw-chip--on" : "")} onClick={() => setShowClosed(!showClosed)}>✓ Closed</button>
        </div>
        <div className="lw-tools">
          {searchOpen || search ? (
            <input autoFocus className="lw-search" placeholder="Search tasks..." value={search} onChange={(event) => setSearch(event.target.value)} onBlur={() => setSearchOpen(false)} />
          ) : (
            <button className="lw-icon-btn" aria-label="Search tasks" onClick={() => setSearchOpen(true)}>
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" /></svg>
            </button>
          )}
          {canEdit ? <button className="lw-ghost" onClick={() => setEditingAutomations(true)}>⚡ Automations</button> : null}
          {canEdit ? <button className="lw-ghost" onClick={() => setEditingFields(true)}>⊞ Fields{list.fields.length ? " " + list.fields.length : ""}</button> : null}
          {canEdit ? <button className="lw-ghost" onClick={() => setEditingStatuses(true)}>⚙ Statuses</button> : null}
          {canEdit ? <button className="lw-primary" onClick={() => { setMode("list"); setAddingIn(visibleStatuses[0]?.id ?? null); }}>+ Task</button> : null}
        </div>
      </div>
      {error ? <p className="lw-error" role="alert">{error}</p> : null}

      {mode === "list" ? (
        <div className="lw-groups">
          {visibleStatuses.map((status) => {
            const rows = topLevel.filter((item) => item.statusId === status.id && matches(item));
            const folded = collapsedGroups[status.id];
            return (
              <section key={status.id} className="lw-group">
                <div className="lw-group-head">
                  <button className="lw-caret" aria-label={folded ? "Expand group" : "Collapse group"} onClick={() => setCollapsedGroups({ ...collapsedGroups, [status.id]: !folded })}>
                    <svg viewBox="0 0 10 10" width="9" height="9" style={{ transform: folded ? "none" : "rotate(90deg)" }} aria-hidden="true"><path d="M3 1.5 7 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
                  </button>
                  <span className="lw-pill" style={{ background: status.color }}><StatusIcon status={status} />{status.name}</span>
                  <span className="lw-n">{rows.length}</span>
                  {canEdit ? <button className="lw-group-add" onClick={() => setAddingIn(status.id)}>+ Add Task</button> : null}
                </div>
                {folded ? null : (
                  <>
                    <div className="lw-colhead"><span>Name</span><span>Assignee</span><span>Due date</span><span>Priority</span></div>
                    {rows.map((item) => renderRow(item, 0))}
                    {canEdit ? (
                      addingIn === status.id ? (
                        <QuickAdd autoOpen onCancel={() => setAddingIn(null)} onAdd={(title) => quickAdd(title, status.id)} />
                      ) : (
                        <button className="lw-add" onClick={() => setAddingIn(status.id)}>+ Add Task</button>
                      )
                    ) : null}
                  </>
                )}
              </section>
            );
          })}
          {unassignedStatus.length ? (
            <section className="lw-group">
              <div className="lw-group-head">
                <span className="lw-pill" style={{ background: "#87909e" }}>no status</span>
                <span className="lw-n">{unassignedStatus.length}</span>
              </div>
              <div className="lw-colhead"><span>Name</span><span>Assignee</span><span>Due date</span><span>Priority</span></div>
              {unassignedStatus.map((item) => renderRow(item, 0))}
            </section>
          ) : null}
        </div>
      ) : mode === "table" ? (
        <TableView
          items={items.filter(matches)}
          statuses={list.statuses}
          canEdit={canEdit}
          onOpen={setOpenId}
          onPatch={patch}
        />
      ) : mode === "calendar" ? (
        <CalendarView items={items.filter(matches)} statusById={statusById} onOpen={setOpenId} />
      ) : (
        <div className="lw-board">
          {visibleStatuses.map((status) => {
            const cards = topLevel.filter((item) => item.statusId === status.id && matches(item));
            return (
              <section
                key={status.id}
                className="lw-column"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  const id = event.dataTransfer.getData("text/plain");
                  if (id && canEdit) patch(id, { statusId: status.id });
                }}
              >
                <div className="lw-column-head" style={{ borderTopColor: status.color }}>
                  <span className="lw-pill" style={{ background: status.color }}><StatusIcon status={status} />{status.name}</span>
                  <span className="lw-n">{cards.length}</span>
                </div>
                {cards.map((item) => {
                  const due = formatDue(item.dueOn);
                  return (
                    <article key={item.id} className="lw-card" draggable={canEdit} onDragStart={(event) => { event.dataTransfer.setData("text/plain", item.id); event.dataTransfer.setData("application/x-hub-item", item.id); }} onClick={() => setOpenId(item.id)}>
                      <strong>{item.title}</strong>
                      {item.tags.length ? (
                        <div className="lw-card-tags">
                          {item.tags.slice(0, 3).map((tag) => <span key={tag.id} className={"lw-tag work-tag work-tag--" + tag.color}>{tag.label}</span>)}
                        </div>
                      ) : null}
                      <div className="lw-card-foot">
                        {item.assignees.length ? <span className="lw-avatar">{initials(item.assignees[0].fullName)}</span> : null}
                        <span className={due.late && !isClosed(item) ? "lw-late" : ""}>{due.text}</span>
                        {item.childCount ? <span>⑂ {item.childCount}</span> : null}
                        {item.priority ? <span style={{ color: PRIORITY_COLOR[item.priority] }}>⚑</span> : null}
                      </div>
                    </article>
                  );
                })}
                {canEdit ? <QuickAdd onAdd={(title) => quickAdd(title, status.id)} /> : null}
              </section>
            );
          })}
        </div>
      )}

      {openId ? (
        <ItemPanel
          key={openId}
          itemId={openId}
          statuses={list.statuses}
          fields={list.fields}
          people={people}
          canEdit={canEdit}
          onClose={() => setOpenId(null)}
          onOpen={setOpenId}
          onPatch={patch}
          onAddChild={async (title) => {
            await quickAdd(title, null, openId);
          }}
        />
      ) : null}

      {toast ? (
        <div className="lw-toast" role="status" aria-live="polite">
          <span className="lw-toast-text">{toast.text}</span>
          {toast.undo ? <button type="button" className="lw-toast-undo" onClick={toast.undo}>Undo</button> : null}
          <button type="button" className="lw-toast-close" onClick={() => setToast(null)} aria-label="Dismiss">✕</button>
        </div>
      ) : null}
      {editingAutomations ? <AutomationEditor listId={list.id} statuses={list.statuses} people={people} onClose={() => setEditingAutomations(false)} /> : null}
      {editingFields ? <FieldEditor listId={list.id} fields={list.fields} onClose={() => setEditingFields(false)} /> : null}
      {editingStatuses ? <StatusEditor listId={list.id} statuses={list.statuses} onClose={() => setEditingStatuses(false)} /> : null}
    </div>
  );
}

function TableView({ items, statuses, canEdit, onOpen, onPatch }: {
  items: WorkItem[];
  statuses: ListStatus[];
  canEdit: boolean;
  onOpen: (id: string) => void;
  onPatch: (id: string, body: Record<string, unknown>) => Promise<ItemDetail | null>;
}) {
  const [sort, setSort] = useState<{ key: "title" | "status" | "due" | "priority"; dir: 1 | -1 }>({ key: "due", dir: 1 });
  const rank: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
  const statusOrder = new Map(statuses.map((status, index) => [status.id, index] as const));
  const titleOf = new Map(items.map((item) => [item.id, item.title] as const));
  const sorted = [...items].sort((a, b) => {
    let result = 0;
    if (sort.key === "title") result = a.title.localeCompare(b.title);
    if (sort.key === "status") result = (statusOrder.get(a.statusId ?? "") ?? 99) - (statusOrder.get(b.statusId ?? "") ?? 99);
    if (sort.key === "due") result = (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999");
    if (sort.key === "priority") result = (rank[a.priority ?? ""] ?? 9) - (rank[b.priority ?? ""] ?? 9);
    return result * sort.dir;
  });
  const header = (key: typeof sort.key, label: string) => (
    <th>
      <button className="lw-th" onClick={() => setSort({ key, dir: sort.key === key ? (sort.dir === 1 ? -1 : 1) : 1 })}>
        {label}{sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );

  return (
    <div className="lw-table-wrap">
      <table className="lw-table">
        <thead>
          <tr>
            {header("title", "Name")}
            {header("status", "Status")}
            <th>Assignees</th>
            <th>Start</th>
            {header("due", "Due date")}
            {header("priority", "Priority")}
            <th>Tags</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => {
            const status = statuses.find((entry) => entry.id === item.statusId);
            return (
              <tr key={item.id}>
                <td className="lw-td-name">
                  <button className="lw-link" onClick={() => onOpen(item.id)}>{item.title}</button>
                  {item.parentId && titleOf.has(item.parentId) ? <span className="lw-faint lw-parent">in {titleOf.get(item.parentId)}</span> : null}
                </td>
                <td>
                  <select className="lw-status-select" style={{ background: status?.color ?? "#87909e" }} value={item.statusId ?? ""} disabled={!canEdit} onChange={(event) => onPatch(item.id, { statusId: event.target.value || null })}>
                    {statuses.map((entry) => <option key={entry.id} value={entry.id}>{entry.name.toUpperCase()}</option>)}
                  </select>
                </td>
                <td>{item.assignees.map((person) => person.fullName).join(", ") || <span className="lw-faint">—</span>}</td>
                <td>
                  <input type="date" className="lw-cell-input" value={item.startOn ?? ""} disabled={!canEdit} onChange={(event) => onPatch(item.id, { startOn: event.target.value || null })} />
                </td>
                <td>
                  <input type="date" className="lw-cell-input" value={item.dueOn ?? ""} disabled={!canEdit} onChange={(event) => onPatch(item.id, { dueOn: event.target.value || null })} />
                </td>
                <td>
                  <select className="lw-cell-input" value={item.priority ?? ""} disabled={!canEdit} onChange={(event) => onPatch(item.id, { priority: event.target.value || null })}>
                    <option value="">—</option>
                    {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority[0] + priority.slice(1).toLowerCase()}</option>)}
                  </select>
                </td>
                <td className="lw-td-tags">{item.tags.map((tag) => <span key={tag.id} className={"lw-tag work-tag work-tag--" + tag.color}>{tag.label}</span>)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length === 0 ? <p className="lw-faint" style={{ padding: 16 }}>No tasks match.</p> : null}
    </div>
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function CalendarView({ items, statusById, onOpen }: { items: WorkItem[]; statusById: Map<string, ListStatus>; onOpen: (id: string) => void }) {
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const first = new Date(cursor.year, cursor.month, 1);
  const start = new Date(cursor.year, cursor.month, 1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  const key = (date: Date) => date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  const todayKey = key(now);
  const byDay = new Map<string, WorkItem[]>();
  items.forEach((item) => {
    if (item.dueOn) byDay.set(item.dueOn, [...(byDay.get(item.dueOn) ?? []), item]);
  });
  const undated = items.filter((item) => !item.dueOn).length;
  const move = (delta: number) => {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  };

  return (
    <div className="lw-cal">
      <div className="lw-cal-head">
        <button className="lw-ghost" onClick={() => move(-1)} aria-label="Previous month">‹</button>
        <button className="lw-ghost" onClick={() => setCursor({ year: now.getFullYear(), month: now.getMonth() })}>Today</button>
        <button className="lw-ghost" onClick={() => move(1)} aria-label="Next month">›</button>
        <h2>{first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
        <span className="lw-faint">{undated} without a due date</span>
      </div>
      <div className="lw-cal-grid">
        {WEEKDAYS.map((day) => <div key={day} className="lw-cal-weekday">{day}</div>)}
        {days.map((date) => {
          const dayKey = key(date);
          const dayItems = byDay.get(dayKey) ?? [];
          return (
            <div key={dayKey} className={"lw-cal-day" + (date.getMonth() !== cursor.month ? " is-outside" : "") + (dayKey === todayKey ? " is-today" : "")}>
              <span className="lw-cal-date">{date.getDate()}</span>
              {dayItems.slice(0, 4).map((item) => {
                const status = item.statusId ? statusById.get(item.statusId) : undefined;
                return (
                  <button key={item.id} className="lw-cal-item" style={{ borderLeftColor: status?.color ?? "#87909e" }} onClick={() => onOpen(item.id)} title={item.title}>
                    {item.title}
                  </button>
                );
              })}
              {dayItems.length > 4 ? <span className="lw-faint lw-cal-more">+{dayItems.length - 4} more</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type StatusDraft = { id: string | null; name: string; color: string; category: ListStatus["category"] };

function StatusEditor({ listId, statuses, onClose }: { listId: string; statuses: ListStatus[]; onClose: () => void }) {
  const [rows, setRows] = useState<StatusDraft[]>(statuses.map((status) => ({ id: status.id, name: status.name, color: /^#[0-9a-fA-F]{6}$/.test(status.color) ? status.color : "#87909e", category: status.category })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (index: number, change: Partial<StatusDraft>) => setRows(rows.map((row, position) => (position === index ? { ...row, ...change } : row)));
  const moveRow = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
  };

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/work/lists/" + listId + "/statuses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statuses: rows.map((row) => ({ ...row, name: row.name.trim() })) })
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(data.message || "Could not save.");
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
      setSaving(false);
    }
  }

  return (
    <div className="lw-overlay lw-overlay--center" onClick={onClose}>
      <div className="lw-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Edit statuses">
        <div className="lw-panel-top"><strong>Statuses for this list</strong><button className="lw-close" onClick={onClose} aria-label="Close">✕</button></div>
        <p className="lw-faint">Tasks in a deleted status lose their status. Done and Closed statuses count as finished.</p>
        <div className="lw-status-rows">
          {rows.map((row, index) => (
            <div key={(row.id ?? "new") + index} className="lw-status-row">
              <input type="color" value={row.color} onChange={(event) => update(index, { color: event.target.value })} aria-label="Status color" />
              <input value={row.name} maxLength={40} onChange={(event) => update(index, { name: event.target.value })} aria-label="Status name" />
              <select value={row.category} onChange={(event) => update(index, { category: event.target.value as ListStatus["category"] })} aria-label="Status type">
                {(Object.keys(CATEGORY_LABELS) as ListStatus["category"][]).map((category) => <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>)}
              </select>
              <button className="lw-ghost" onClick={() => moveRow(index, -1)} aria-label="Move up">↑</button>
              <button className="lw-ghost" onClick={() => moveRow(index, 1)} aria-label="Move down">↓</button>
              <button className="lw-ghost" onClick={() => setRows(rows.filter((_, position) => position !== index))} disabled={rows.length === 1} aria-label="Delete status">✕</button>
            </div>
          ))}
        </div>
        <button className="lw-add" style={{ paddingLeft: 4 }} onClick={() => setRows([...rows, { id: null, name: "new status", color: "#7b68ee", category: "ACTIVE" }])}>+ Add status</button>
        {error ? <p className="lw-error">{error}</p> : null}
        <div className="lw-modal-actions">
          <button className="lw-ghost" onClick={onClose}>Cancel</button>
          <button className="lw-primary" onClick={save} disabled={saving || rows.some((row) => !row.name.trim())}>{saving ? "Saving…" : "Save statuses"}</button>
        </div>
      </div>
    </div>
  );
}

const FIELD_TYPE_LABELS: Record<CustomField["type"], string> = {
  text: "Text",
  long_text: "Long text",
  number: "Number",
  currency: "Money",
  date: "Date",
  checkbox: "Checkbox",
  dropdown: "Dropdown",
  labels: "Labels",
  person: "People",
  url: "Link",
  email: "Email",
  phone: "Phone",
  rating: "Rating",
  progress: "Progress"
};

function FieldInput({ field, value, people, disabled, onSave }: { field: CustomField; value: unknown; people: Person[]; disabled: boolean; onSave: (value: unknown) => void }) {
  const text = value === null || value === undefined ? "" : typeof value === "object" ? "" : String(value);
  const many = Array.isArray(value) ? value.map((entry) => String(entry)) : [];
  // Values imported from ClickUp are stored by option name; values saved here are stored by option id. Accept both.
  const optionId = (raw: string) => field.options.find((option) => option.id === raw || option.name.toLowerCase() === raw.toLowerCase())?.id ?? raw;
  switch (field.type) {
    case "checkbox":
      return <input type="checkbox" checked={value === true || value === "true"} disabled={disabled} onChange={(event) => onSave(event.target.checked)} />;
    case "date":
      return <input type="date" value={text.slice(0, 10)} disabled={disabled} onChange={(event) => onSave(event.target.value || null)} />;
    case "dropdown":
      return (
        <select value={text ? optionId(text) : ""} disabled={disabled} onChange={(event) => onSave(event.target.value || null)}>
          <option value="">Empty</option>
          {field.options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
      );
    case "labels":
      return (
        <select multiple className="lw-multi" value={many.map(optionId)} disabled={disabled} onChange={(event) => onSave(Array.from(event.target.selectedOptions).map((option) => option.value))}>
          {field.options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
      );
    case "person":
      return (
        <select multiple className="lw-multi" value={many} disabled={disabled} onChange={(event) => onSave(Array.from(event.target.selectedOptions).map((option) => option.value))}>
          {people.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
        </select>
      );
    case "long_text":
      return <textarea rows={3} className="lw-field-text" placeholder="Empty" defaultValue={text} disabled={disabled} onBlur={(event) => { if (event.target.value !== text) onSave(event.target.value || null); }} />;
    case "number":
    case "currency":
    case "rating":
    case "progress":
      return (
        <input type="number" step={field.type === "currency" ? "0.01" : "1"} min={field.type === "rating" || field.type === "progress" ? 0 : undefined} max={field.type === "rating" ? 5 : field.type === "progress" ? 100 : undefined}
          placeholder="Empty" defaultValue={text} disabled={disabled} onBlur={(event) => { if (event.target.value !== text) onSave(event.target.value === "" ? null : Number(event.target.value)); }} />
      );
    default:
      return (
        <input placeholder="Empty" type={field.type === "url" ? "url" : field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"} className="lw-field-text"
          defaultValue={text} disabled={disabled} onBlur={(event) => { if (event.target.value !== text) onSave(event.target.value || null); }} />
      );
  }
}

function FieldEditor({ listId, fields, onClose }: { listId: string; fields: CustomField[]; onClose: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<CustomField["type"]>("text");
  const [options, setOptions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const needsOptions = type === "dropdown" || type === "labels";

  async function call(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/work/lists/" + listId + "/fields", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(data.message || "Could not save.");
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
      setBusy(false);
    }
  }

  const parseOptions = (raw: string) => raw.split(",").map((entry) => entry.trim()).filter(Boolean).map((entry, index) => ({ id: "opt-" + Date.now().toString(36) + "-" + index, name: entry }));

  return (
    <div className="lw-overlay lw-overlay--center" onClick={onClose}>
      <div className="lw-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Edit fields">
        <div className="lw-panel-top"><strong>Custom fields for this list</strong><button className="lw-close" onClick={onClose} aria-label="Close">✕</button></div>
        <p className="lw-faint">Fields show up in every task's panel. Deleting a field deletes its values.</p>
        <div className="lw-status-rows">
          {fields.length === 0 ? <p className="lw-faint">No fields yet.</p> : null}
          {fields.map((field) => (
            <div key={field.id} className="lw-field-edit">
              <input defaultValue={field.name} maxLength={60} aria-label="Field name" disabled={busy}
                onBlur={(event) => { const next = event.target.value.trim(); if (next && next !== field.name) call({ action: "update", fieldId: field.id, name: next }); }} />
              <span className="lw-faint">{FIELD_TYPE_LABELS[field.type]}{field.options.length ? " · " + field.options.map((option) => option.name).join(", ") : ""}</span>
              <ConfirmButton className="lw-ghost" disabled={busy} ariaLabel="Delete field" question="Delete it and its values?" onConfirm={() => call({ action: "delete", fieldId: field.id })}>✕</ConfirmButton>
            </div>
          ))}
        </div>
        <form className="lw-field-add" onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          call({ action: "create", name: name.trim(), type, options: needsOptions ? parseOptions(options) : undefined });
        }}>
          <strong>Add a field</strong>
          <div className="lw-field-add-row">
            <input value={name} maxLength={60} placeholder="Field name" onChange={(event) => setName(event.target.value)} aria-label="New field name" />
            <select value={type} onChange={(event) => setType(event.target.value as CustomField["type"])} aria-label="New field type">
              {(Object.keys(FIELD_TYPE_LABELS) as CustomField["type"][]).map((key) => <option key={key} value={key}>{FIELD_TYPE_LABELS[key]}</option>)}
            </select>
          </div>
          {needsOptions ? <input value={options} placeholder="Options, separated by commas" onChange={(event) => setOptions(event.target.value)} aria-label="Options" /> : null}
          {error ? <p className="lw-error">{error}</p> : null}
          <div className="lw-modal-actions">
            <button type="button" className="lw-ghost" onClick={onClose}>Close</button>
            <button type="submit" className="lw-primary" disabled={busy || !name.trim()}>{busy ? "Saving…" : "Add field"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

type RunRow = { automationId: string; outcome: string; detail: string | null; createdAt: string };

function describeTrigger(trigger: AutomationTrigger): string {
  switch (trigger.type) {
    case "item_created":
      return "a task is created";
    case "status_changed":
      return trigger.toStatusName ? "status changes to " + trigger.toStatusName : "status changes";
    case "priority_changed":
      return trigger.toPriority ? "priority changes to " + trigger.toPriority.toLowerCase() : "priority changes";
    case "tag_added":
      return trigger.tag ? "tag '" + trigger.tag + "' is added" : "a tag is added";
    case "assignee_added":
      return "someone is assigned";
    default:
      return "something happens";
  }
}

function describeCondition(condition: AutomationCondition): string {
  switch (condition.type) {
    case "has_tag":
      return "it has tag '" + condition.tag + "'";
    case "priority_is":
      return "priority is " + condition.priority.toLowerCase();
    case "status_is":
      return "status is " + condition.statusName;
    case "no_assignee":
      return "nobody is assigned";
    default:
      return "a condition matches";
  }
}

function describeAction(action: AutomationAction, people: Person[]): string {
  switch (action.type) {
    case "set_status":
      return "set status to " + action.statusName;
    case "set_priority":
      return "set priority to " + action.priority.toLowerCase();
    case "add_tag":
      return "add tag '" + action.tag + "'";
    case "remove_tag":
      return "remove tag '" + action.tag + "'";
    case "assign":
      return "assign " + (people.find((person) => person.id === action.userId)?.fullName ?? "a member");
    case "add_comment":
      return "post the comment '" + (action.body.length > 60 ? action.body.slice(0, 60) + "…" : action.body) + "'";
    case "set_due_in_days":
      return action.days === 0 ? "set the due date to today" : "set the due date " + action.days + " days out";
    default:
      return "do something";
  }
}

const TRIGGER_LABELS: Record<AutomationTrigger["type"], string> = {
  status_changed: "Status changes",
  item_created: "Task is created",
  priority_changed: "Priority changes",
  tag_added: "Tag is added",
  assignee_added: "Someone is assigned"
};
const CONDITION_LABELS: Record<AutomationCondition["type"], string> = {
  has_tag: "Task has tag",
  priority_is: "Priority is",
  status_is: "Status is",
  no_assignee: "Nobody is assigned"
};
const ACTION_LABELS: Record<AutomationAction["type"], string> = {
  add_comment: "Post a comment",
  set_status: "Change status",
  set_priority: "Change priority",
  add_tag: "Add a tag",
  remove_tag: "Remove a tag",
  assign: "Assign someone",
  set_due_in_days: "Set due date"
};

function AutomationEditor({ listId, statuses, people, onClose }: { listId: string; statuses: ListStatus[]; people: Person[]; onClose: () => void }) {
  const url = "/api/work/lists/" + listId + "/automations";
  const [automations, setAutomations] = useState<Automation[] | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<{ type: AutomationTrigger["type"]; value: string }>({ type: "status_changed", value: "" });
  const [condition, setCondition] = useState<{ type: "" | AutomationCondition["type"]; value: string }>({ type: "", value: "" });
  const [action, setAction] = useState<{ type: AutomationAction["type"]; value: string }>({ type: "add_comment", value: "" });

  type Payload = { automations?: Automation[]; runs?: RunRow[]; message?: string };
  const apply = (data: Payload) => {
    if (data.automations) setAutomations(data.automations);
    if (data.runs) setRuns(data.runs);
  };

  useEffect(() => {
    fetch(url).then((response) => response.json() as Promise<Payload>).then(apply).catch(() => setError("Could not load automations."));
  }, [url]);

  async function call(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await response.json().catch(() => ({}))) as Payload;
      if (!response.ok) throw new Error(data.message || "Could not save.");
      apply(data);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function buildTrigger(): AutomationTrigger {
    const value = trigger.value.trim();
    switch (trigger.type) {
      case "status_changed":
        return value ? { type: "status_changed", toStatusName: value } : { type: "status_changed" };
      case "priority_changed":
        return value ? { type: "priority_changed", toPriority: value as ItemPriority } : { type: "priority_changed" };
      case "tag_added":
        return value ? { type: "tag_added", tag: value.toLowerCase() } : { type: "tag_added" };
      case "assignee_added":
        return { type: "assignee_added" };
      default:
        return { type: "item_created" };
    }
  }

  function buildConditions(): AutomationCondition[] | null {
    const value = condition.value.trim();
    switch (condition.type) {
      case "has_tag":
        return value ? [{ type: "has_tag", tag: value.toLowerCase() }] : null;
      case "priority_is":
        return value ? [{ type: "priority_is", priority: value as ItemPriority }] : null;
      case "status_is":
        return value ? [{ type: "status_is", statusName: value }] : null;
      case "no_assignee":
        return [{ type: "no_assignee" }];
      default:
        return [];
    }
  }

  function buildAction(): AutomationAction | null {
    const value = action.value.trim();
    switch (action.type) {
      case "set_status":
        return value ? { type: "set_status", statusName: value } : null;
      case "set_priority":
        return value ? { type: "set_priority", priority: value as ItemPriority } : null;
      case "add_tag":
        return value ? { type: "add_tag", tag: value.toLowerCase() } : null;
      case "remove_tag":
        return value ? { type: "remove_tag", tag: value.toLowerCase() } : null;
      case "assign":
        return value ? { type: "assign", userId: value } : null;
      case "add_comment":
        return value ? { type: "add_comment", body: value } : null;
      case "set_due_in_days":
        return value !== "" && Number.isFinite(Number(value)) ? { type: "set_due_in_days", days: Math.max(0, Math.min(365, Math.round(Number(value)))) } : null;
      default:
        return null;
    }
  }

  const builtTrigger = buildTrigger();
  const builtConditions = buildConditions();
  const builtAction = buildAction();
  const ready = builtConditions !== null && builtAction !== null;
  const sentence = "When " + describeTrigger(builtTrigger)
    + (builtConditions && builtConditions.length ? ", if " + describeCondition(builtConditions[0]) : "")
    + ", then " + (builtAction ? describeAction(builtAction, people) : "…");

  async function create() {
    if (!builtAction || !builtConditions) return;
    const ok = await call({ action: "create", name: name.trim() || sentence.slice(0, 100), trigger: builtTrigger, conditions: builtConditions, actions: [builtAction] });
    if (ok) {
      setName("");
      setAction({ ...action, value: "" });
    }
  }

  const statusOptions = (placeholder: string, value: string, onChange: (next: string) => void) => (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{placeholder}</option>
      {statuses.map((status) => <option key={status.id} value={status.name}>{status.name}</option>)}
    </select>
  );
  const priorityOptions = (placeholder: string, value: string, onChange: (next: string) => void) => (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{placeholder}</option>
      {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority[0] + priority.slice(1).toLowerCase()}</option>)}
    </select>
  );
  const nameOf = (automationId: string) => automations?.find((automation) => automation.id === automationId)?.name ?? "Deleted rule";

  return (
    <div className="lw-overlay lw-overlay--center" onClick={onClose}>
      <div className="lw-modal au-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Automations">
        <div className="lw-panel-top"><strong>⚡ Automations for this list</strong><button className="lw-close" onClick={onClose} aria-label="Close">✕</button></div>
        <p className="lw-faint">Rules run by themselves when tasks in this list change. A rule's actions never set off other rules.</p>
        {error ? <p className="lw-error" role="alert">{error}</p> : null}

        <section className="au-rules">
          {automations === null ? <p className="lw-faint">Loading…</p> : null}
          {automations && automations.length === 0 ? <p className="lw-faint">No rules yet. Build your first one below.</p> : null}
          {automations?.map((automation) => (
            <div key={automation.id} className={"au-rule" + (automation.enabled ? "" : " is-off")}>
              <button type="button" role="switch" aria-checked={automation.enabled} aria-label={(automation.enabled ? "Turn off " : "Turn on ") + automation.name} className="au-switch" disabled={busy}
                onClick={() => call({ action: "toggle", automationId: automation.id, enabled: !automation.enabled })} />
              <div className="au-rule-text">
                <strong>{automation.name}</strong>
                <span>
                  When {describeTrigger(automation.trigger)}
                  {automation.conditions.length ? ", if " + automation.conditions.map(describeCondition).join(" and ") : ""}
                  , then {automation.actions.map((entry) => describeAction(entry, people)).join(", then ")}
                </span>
                <small>{automation.lastRunAt ? "Last ran " + new Date(automation.lastRunAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Has not run yet"}</small>
              </div>
              <ConfirmButton className="lw-ghost" disabled={busy} ariaLabel={"Delete " + automation.name} question="Delete?"
                onConfirm={() => call({ action: "delete", automationId: automation.id })}>✕</ConfirmButton>
            </div>
          ))}
        </section>

        <section className="au-builder">
          <strong>New rule</strong>
          <div className="au-step">
            <span className="au-step-label">When</span>
            <select value={trigger.type} onChange={(event) => setTrigger({ type: event.target.value as AutomationTrigger["type"], value: "" })}>
              {(Object.keys(TRIGGER_LABELS) as AutomationTrigger["type"][]).map((key) => <option key={key} value={key}>{TRIGGER_LABELS[key]}</option>)}
            </select>
            {trigger.type === "status_changed" ? statusOptions("to any status", trigger.value, (value) => setTrigger({ ...trigger, value })) : null}
            {trigger.type === "priority_changed" ? priorityOptions("to any priority", trigger.value, (value) => setTrigger({ ...trigger, value })) : null}
            {trigger.type === "tag_added" ? <input value={trigger.value} maxLength={40} placeholder="any tag" onChange={(event) => setTrigger({ ...trigger, value: event.target.value })} /> : null}
          </div>
          <div className="au-step">
            <span className="au-step-label">If</span>
            <select value={condition.type} onChange={(event) => setCondition({ type: event.target.value as "" | AutomationCondition["type"], value: "" })}>
              <option value="">Always (no condition)</option>
              {(Object.keys(CONDITION_LABELS) as AutomationCondition["type"][]).map((key) => <option key={key} value={key}>{CONDITION_LABELS[key]}</option>)}
            </select>
            {condition.type === "status_is" ? statusOptions("choose a status", condition.value, (value) => setCondition({ ...condition, value })) : null}
            {condition.type === "priority_is" ? priorityOptions("choose a priority", condition.value, (value) => setCondition({ ...condition, value })) : null}
            {condition.type === "has_tag" ? <input value={condition.value} maxLength={40} placeholder="tag name" onChange={(event) => setCondition({ ...condition, value: event.target.value })} /> : null}
          </div>
          <div className="au-step">
            <span className="au-step-label">Then</span>
            <select value={action.type} onChange={(event) => setAction({ type: event.target.value as AutomationAction["type"], value: "" })}>
              {(Object.keys(ACTION_LABELS) as AutomationAction["type"][]).map((key) => <option key={key} value={key}>{ACTION_LABELS[key]}</option>)}
            </select>
            {action.type === "set_status" ? statusOptions("choose a status", action.value, (value) => setAction({ ...action, value })) : null}
            {action.type === "set_priority" ? priorityOptions("choose a priority", action.value, (value) => setAction({ ...action, value })) : null}
            {action.type === "add_tag" || action.type === "remove_tag" ? <input value={action.value} maxLength={40} placeholder="tag name" onChange={(event) => setAction({ ...action, value: event.target.value })} /> : null}
            {action.type === "assign" ? (
              <select value={action.value} onChange={(event) => setAction({ ...action, value: event.target.value })}>
                <option value="">choose a member</option>
                {people.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
              </select>
            ) : null}
            {action.type === "set_due_in_days" ? <input type="number" min={0} max={365} value={action.value} placeholder="days from now" onChange={(event) => setAction({ ...action, value: event.target.value })} /> : null}
          </div>
          {action.type === "add_comment" ? <textarea rows={3} maxLength={2000} value={action.value} placeholder="Comment to post on the task" onChange={(event) => setAction({ ...action, value: event.target.value })} /> : null}
          <p className="au-preview">{sentence}</p>
          <div className="au-create">
            <input value={name} maxLength={100} placeholder="Rule name (optional)" onChange={(event) => setName(event.target.value)} aria-label="Rule name" />
            <button type="button" className="lw-primary" disabled={busy || !ready} onClick={create}>{busy ? "Saving…" : "Create rule"}</button>
          </div>
        </section>

        {runs.length ? (
          <section className="au-runs">
            <strong>Recent runs</strong>
            {runs.map((run, index) => (
              <div key={run.automationId + run.createdAt + index} className="au-run">
                <span className={"au-badge au-badge--" + run.outcome.toLowerCase()}>{run.outcome === "SUCCESS" ? "✓ Ran" : run.outcome === "FAILED" ? "! Failed" : "– Skipped"}</span>
                <span className="au-run-text"><strong>{nameOf(run.automationId)}</strong>{run.detail ? " — " + run.detail : ""}</span>
                <span className="lw-faint">{new Date(run.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}

function QuickAdd({ onAdd, onCancel, autoOpen = false, label = "+ Add Task" }: { onAdd: (title: string) => Promise<unknown> | void; onCancel?: () => void; autoOpen?: boolean; label?: string }) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(autoOpen);
  const close = () => {
    setOpen(false);
    onCancel?.();
  };
  if (!open) return <button className="lw-add" onClick={() => setOpen(true)}>{label}</button>;
  return (
    <form className="lw-addform" onSubmit={async (event) => {
      event.preventDefault();
      await onAdd(value);
      setValue("");
    }}>
      <input autoFocus value={value} placeholder="Task Name" onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") close(); }} />
      <button type="button" className="lw-ghost" onClick={close}>Cancel</button>
      <button type="submit" className="lw-primary">Save</button>
    </form>
  );
}

type AssistAction = "summarize" | "tags" | "subtasks";

// Squadron AI helper inside a task. Every result is a suggestion; nothing is saved until the member clicks Add or Post.
function AssistBox({ itemId, canEdit, onAddTag, onAddSubtasks, onComment }: {
  itemId: string;
  canEdit: boolean;
  onAddTag: (tag: string) => Promise<void>;
  onAddSubtasks: (titles: string[]) => Promise<void>;
  onComment: (body: string) => Promise<void>;
}) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<"" | AssistAction>("");
  const [note, setNote] = useState("");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [steps, setSteps] = useState<Array<{ text: string; picked: boolean }>>([]);

  useEffect(() => {
    let active = true;
    fetch("/api/work/items/" + itemId + "/assist")
      .then((response) => response.json() as Promise<{ available?: boolean }>)
      .then((data) => {
        if (active) setAvailable(Boolean(data.available));
      })
      .catch(() => {
        if (active) setAvailable(false);
      });
    return () => {
      active = false;
    };
  }, [itemId]);

  async function ask(action: AssistAction) {
    setBusy(action);
    setNote("");
    try {
      const response = await fetch("/api/work/items/" + itemId + "/assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = (await response.json().catch(() => ({}))) as { message?: string; summary?: string; tags?: string[]; subtasks?: string[] };
      if (!response.ok) throw new Error(data.message || "Squadron AI couldn't answer right now. Try again in a minute.");
      if (action === "summarize") setSummary(data.summary || "No summary came back. Try again.");
      if (action === "tags") {
        setTags(data.tags ?? []);
        if (!(data.tags ?? []).length) setNote("No new tags to suggest for this task.");
      }
      if (action === "subtasks") {
        setSteps((data.subtasks ?? []).map((text) => ({ text, picked: true })));
        if (!(data.subtasks ?? []).length) setNote("No next steps came back. Try again.");
      }
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "Squadron AI couldn't answer right now.");
    } finally {
      setBusy("");
    }
  }

  if (available === null) return null;

  return (
    <section className="tp-section tp-ai" aria-label="Squadron AI">
      <h3 className="tp-h">✨ Squadron AI <span className="tp-count">runs on the squadron's own server</span></h3>
      {!available ? <p className="tp-empty">Squadron AI isn't set up yet.</p> : (
        <>
          <div className="tp-ai-buttons">
            <button type="button" className="tp-ai-btn" disabled={Boolean(busy)} onClick={() => ask("summarize")}>{busy === "summarize" ? "Working…" : "Summarize"}</button>
            {canEdit ? <button type="button" className="tp-ai-btn" disabled={Boolean(busy)} onClick={() => ask("tags")}>{busy === "tags" ? "Working…" : "Suggest tags"}</button> : null}
            {canEdit ? <button type="button" className="tp-ai-btn" disabled={Boolean(busy)} onClick={() => ask("subtasks")}>{busy === "subtasks" ? "Working…" : "Suggest next steps"}</button> : null}
          </div>
          {busy ? <p className="tp-ai-wait" role="status">Squadron AI is working. This can take up to a minute.</p> : null}
          {note ? <p className="tp-ai-note" role="status">{note}</p> : null}

          {summary ? (
            <div className="tp-ai-card">
              <p>{summary}</p>
              <div className="tp-ai-actions">
                {canEdit ? <button type="button" className="lw-primary" onClick={async () => { await onComment(summary); setSummary(""); }}>Post as comment</button> : null}
                <button type="button" className="lw-ghost" onClick={() => setSummary("")}>Dismiss</button>
              </div>
            </div>
          ) : null}

          {tags.length ? (
            <div className="tp-ai-card">
              <p>Suggested tags. Click one to add it:</p>
              <div className="tp-ai-tags">
                {tags.map((tag) => (
                  <button key={tag} type="button" className="tp-ai-tag" onClick={async () => { await onAddTag(tag); setTags((current) => current.filter((entry) => entry !== tag)); }}>+ {tag}</button>
                ))}
              </div>
              <div className="tp-ai-actions"><button type="button" className="lw-ghost" onClick={() => setTags([])}>Dismiss</button></div>
            </div>
          ) : null}

          {steps.length ? (
            <div className="tp-ai-card">
              <p>Suggested next steps. Uncheck any you don't want:</p>
              {steps.map((step, index) => (
                <label key={index} className="tp-check">
                  <input type="checkbox" checked={step.picked} onChange={(event) => setSteps(steps.map((entry, position) => (position === index ? { ...entry, picked: event.target.checked } : entry)))} />
                  <span>{step.text}</span>
                </label>
              ))}
              <div className="tp-ai-actions">
                <button type="button" className="lw-primary" disabled={!steps.some((step) => step.picked)} onClick={async () => { await onAddSubtasks(steps.filter((step) => step.picked).map((step) => step.text)); setSteps([]); }}>Add as subtasks</button>
                <button type="button" className="lw-ghost" onClick={() => setSteps([])}>Dismiss</button>
              </div>
            </div>
          ) : null}

          <p className="tp-ai-fine">Suggestions only. Nothing changes until you click Add or Post.</p>
        </>
      )}
    </section>
  );
}

function ItemPanel({ itemId, statuses, fields, people, canEdit, onClose, onOpen, onPatch, onAddChild }: {
  itemId: string;
  statuses: ListStatus[];
  fields: CustomField[];
  people: Person[];
  canEdit: boolean;
  onClose: () => void;
  onOpen: (id: string) => void;
  onPatch: (id: string, body: Record<string, unknown>) => Promise<ItemDetail | null>;
  onAddChild: (title: string) => Promise<void>;
}) {
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [pickingPerson, setPickingPerson] = useState(false);
  // Where else this task could live. Fetched once the panel is open, because most of the time nobody
  // needs it - but when a task is filed in the wrong place there was no way to move it at all.
  const [allLists, setAllLists] = useState<Array<{ id: string; name: string; space: string }>>([]);

  useEffect(() => {
    let live = true;
    fetch("/api/work/lists")
      .then((response) => response.json() as Promise<{ lists?: Array<{ id: string; name: string; space: string }> }>)
      .then((data) => { if (live) setAllLists(data.lists ?? []); })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  function adopt(next: ItemDetail) {
    setItem(next);
    setTitle(next.title);
    setDescription(next.description ?? "");
  }

  useEffect(() => {
    let active = true;
    send("/api/work/items/" + itemId, "GET").then((data) => {
      if (active && data.item) adopt(data.item);
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [itemId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !(event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement)) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(body: Record<string, unknown>) {
    setSaving(true);
    const next = await onPatch(itemId, body);
    if (next) adopt(next);
    setSaving(false);
  }

  // Sizing a textarea to its text only works once the browser has laid it out. Called straight from a ref
  // it runs too early - scrollHeight comes back as a single empty line - and the task name ends up eight
  // pixels tall with twenty-six pixel type inside it, which is to say invisible. So it measures again on
  // the next frame, and the CSS carries a minimum height in case even that is early.
  const grow = (element: HTMLTextAreaElement | null) => {
    if (!element) return;
    const size = () => {
      element.style.height = "auto";
      element.style.height = Math.max(element.scrollHeight, 34) + "px";
    };
    size();
    requestAnimationFrame(size);
  };

  if (!item) {
    return (
      <div className="lw-overlay" onClick={onClose}>
        <aside className="tp" onClick={(event) => event.stopPropagation()} aria-label="Task details">
          <style>{tpCss}</style>
          <header className="tp-top"><span className="tp-crumbs">Loading task…</span><button className="tp-icon" onClick={onClose} aria-label="Close">✕</button></header>
        </aside>
      </div>
    );
  }

  const status = statuses.find((entry) => entry.id === item.statusId);
  const doneStatus = statuses.find((entry) => entry.category === "DONE") ?? statuses.find((entry) => entry.category === "CLOSED");
  const closedCategory = (statusId: string | null) => {
    const match = statuses.find((entry) => entry.id === statusId);
    return Boolean(match && (match.category === "DONE" || match.category === "CLOSED"));
  };
  const isDone = closedCategory(item.statusId);
  const tags = item.tags.map((tag) => tag.label);
  const addTag = () => {
    const tag = tagDraft.trim().replace(/,+$/, "").toLowerCase();
    setTagDraft("");
    if (tag && !tags.includes(tag)) save({ tags: [...tags, tag] });
  };
  const today = new Date().toISOString().slice(0, 10);
  const late = Boolean(item.dueOn && item.dueOn < today && !isDone);
  const childDone = item.children.filter((child) => closedCategory(child.statusId)).length;
  const priorityLabel = item.priority ? item.priority[0] + item.priority.slice(1).toLowerCase() : "Empty";

  async function postComment() {
    const body = comment.trim();
    if (!body) return;
    setComment("");
    await save({ comment: body });
  }

  return (
    <div className="lw-overlay" onClick={onClose}>
      <aside className="tp" onClick={(event) => event.stopPropagation()} aria-label="Task details">
        <style>{tpCss}</style>
        <header className="tp-top">
          <nav className="tp-crumbs" aria-label="Location">
            {canEdit && allLists.length > 1 ? (
              <span className="tp-crumb tp-crumb--move">
                {item.listName} <span aria-hidden="true">▾</span>
                <select
                  className="tp-overlay-select"
                  value={item.listId}
                  aria-label="Move this task to another list"
                  onChange={(event) => { if (event.target.value !== item.listId) save({ listId: event.target.value }); }}
                >
                  {allLists.map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.space} / {entry.name}</option>
                  ))}
                </select>
              </span>
            ) : (
              <span className="tp-crumb">{item.listName}</span>
            )}
            {item.ancestors.map((ancestor) => (
              <span key={ancestor.id} className="tp-crumb-wrap"><span className="tp-sep">/</span><button className="tp-crumb tp-crumb--link" onClick={() => onOpen(ancestor.id)}>{ancestor.title}</button></span>
            ))}
          </nav>
          <span className="tp-saving" aria-live="polite">{saving ? "Saving…" : "All changes saved"}</span>
          <button className="tp-icon" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="tp-body">
          <div className="tp-main">
            <textarea
              ref={grow}
              className="tp-title"
              rows={1}
              value={title}
              disabled={!canEdit}
              aria-label="Task name"
              onChange={(event) => { setTitle(event.target.value.replace(/\n/g, " ")); grow(event.target); }}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }}
              onBlur={() => { if (title.trim() && title !== item.title) save({ title: title.trim() }); }}
            />

            <div className="tp-props">
              <div className="tp-prop">
                <span className="tp-label"><i>◎</i>Status</span>
                <span className="tp-value">
                  <span className="tp-status" style={{ background: status?.color ?? "#87909e" }}>
                    {(status?.name ?? "no status").toUpperCase()} <span aria-hidden="true">▾</span>
                    <select className="tp-overlay-select" value={item.statusId ?? ""} disabled={!canEdit} onChange={(event) => save({ statusId: event.target.value || null })} aria-label="Status">
                      {statuses.map((entry) => <option key={entry.id} value={entry.id}>{entry.name.toUpperCase()}</option>)}
                    </select>
                  </span>
                  {canEdit && doneStatus && !isDone ? (
                    <button className="tp-done" onClick={() => save({ statusId: doneStatus.id })} title={"Mark " + doneStatus.name} aria-label="Mark complete">✓</button>
                  ) : null}
                </span>
              </div>

              <div className="tp-prop">
                <span className="tp-label"><i>◍</i>Assignees</span>
                <span className="tp-value tp-wrap">
                  {item.assignees.map((person) => (
                    <span key={person.id} className="tp-person">
                      <span className="lw-avatar">{initials(person.fullName)}</span>
                      {person.fullName}
                      {canEdit ? <button className="tp-x" onClick={() => save({ assigneeIds: item.assignees.filter((entry) => entry.id !== person.id).map((entry) => entry.id) })} aria-label={"Remove " + person.fullName}>×</button> : null}
                    </span>
                  ))}
                  {canEdit ? (
                    <span className="tp-add-wrap">
                      <button type="button" className="tp-add" onClick={() => setPickingPerson(true)}>+ Add</button>
                      {pickingPerson ? (
                        <PeoplePicker
                          excludeUserIds={item.assignees.map((entry) => entry.id)}
                          onClose={() => setPickingPerson(false)}
                          onPick={(person) => save({ assigneeIds: [...item.assignees.map((entry) => entry.id), person.userId] })}
                        />
                      ) : null}
                    </span>
                  ) : null}
                  {!item.assignees.length && !canEdit ? <span className="tp-empty">Empty</span> : null}
                </span>
              </div>

              <div className="tp-prop">
                <span className="tp-label"><i>▦</i>Dates</span>
                <span className="tp-value tp-wrap">
                  <label className="tp-date"><span>Start</span><input type="date" value={item.startOn ?? ""} disabled={!canEdit} onChange={(event) => save({ startOn: event.target.value || null })} /></label>
                  <span className="tp-sep">→</span>
                  <label className={"tp-date" + (late ? " tp-date--late" : "")}><span>{late ? "Overdue" : "Due"}</span><input type="date" value={item.dueOn ?? ""} disabled={!canEdit} onChange={(event) => save({ dueOn: event.target.value || null })} /></label>
                </span>
              </div>

              <div className="tp-prop">
                <span className="tp-label"><i>⚑</i>Priority</span>
                <span className="tp-value">
                  <span className="tp-chip-select" style={{ color: item.priority ? PRIORITY_COLOR[item.priority] : undefined }}>
                    ⚑ {priorityLabel}
                    <select className="tp-overlay-select" value={item.priority ?? ""} disabled={!canEdit} onChange={(event) => save({ priority: event.target.value || null })} aria-label="Priority">
                      <option value="">Empty</option>
                      {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority[0] + priority.slice(1).toLowerCase()}</option>)}
                    </select>
                  </span>
                </span>
              </div>

              <div className="tp-prop">
                <span className="tp-label"><i>#</i>Tags</span>
                <span className="tp-value tp-wrap">
                  {item.tags.map((tag) => (
                    <span key={tag.id} className={"tp-tag work-tag work-tag--" + tag.color}>
                      {tag.label}
                      {canEdit ? <button className="tp-x" onClick={() => save({ tags: tags.filter((entry) => entry !== tag.label) })} aria-label={"Remove tag " + tag.label}>×</button> : null}
                    </span>
                  ))}
                  {canEdit ? (
                    <input
                      className="tp-tag-input"
                      value={tagDraft}
                      placeholder={item.tags.length ? "+ tag" : "Add a tag"}
                      aria-label="Add tag"
                      onChange={(event) => setTagDraft(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addTag(); } }}
                      onBlur={addTag}
                    />
                  ) : !item.tags.length ? <span className="tp-empty">Empty</span> : null}
                </span>
              </div>
            </div>

            <AssistBox
              itemId={itemId}
              canEdit={canEdit}
              onAddTag={(tag) => save({ tags: Array.from(new Set([...tags, tag])) })}
              onAddSubtasks={async (titles) => {
                for (const value of titles) await onAddChild(value);
                const data = await send("/api/work/items/" + itemId, "GET");
                adopt(data.item);
              }}
              onComment={(body) => save({ comment: body })}
            />

            {fields.length ? (
              <section className="tp-section">
                <h3 className="tp-h">Custom fields</h3>
                <div className="tp-props">
                  {fields.map((field) => (
                    <div key={field.id + item.updatedAt} className="tp-prop">
                      <span className="tp-label" title={FIELD_TYPE_LABELS[field.type]}><i>⊞</i>{field.name}</span>
                      <span className="tp-value tp-field">
                        <FieldInput field={field} value={item.fieldValues[field.id]} people={people} disabled={!canEdit} onSave={(value) => save({ fieldValues: { [field.id]: value } })} />
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="tp-section">
              <h3 className="tp-h">Description</h3>
              <textarea
                ref={grow}
                className="tp-desc"
                placeholder={canEdit ? "Add a description…" : "No description."}
                value={description}
                disabled={!canEdit}
                aria-label="Description"
                onChange={(event) => { setDescription(event.target.value); grow(event.target); }}
                onBlur={() => { if (description !== (item.description ?? "")) save({ description }); }}
              />
            </section>

            <section className="tp-section">
              <h3 className="tp-h">
                Subtasks <span className="tp-count">{childDone}/{item.children.length}</span>
                {item.children.length ? <span className="tp-progress"><span style={{ width: (childDone / item.children.length) * 100 + "%" }} /></span> : null}
              </h3>
              <div className="tp-list">
                {item.children.map((child) => (
                  <button key={child.id} className="tp-sub" onClick={() => onOpen(child.id)}>
                    <StatusIcon status={statuses.find((entry) => entry.id === child.statusId)} />
                    <span className="tp-sub-title">{child.title}</span>
                    <span className="tp-sub-due">{formatDue(child.dueOn).text}</span>
                  </button>
                ))}
                {canEdit ? <QuickAdd label="+ Add subtask" onAdd={async (value) => {
                  await onAddChild(value);
                  const data = await send("/api/work/items/" + itemId, "GET");
                  adopt(data.item);
                }} /> : null}
                {!canEdit && !item.children.length ? <p className="tp-empty tp-pad">No subtasks.</p> : null}
              </div>
            </section>

            <section className="tp-section">
              <h3 className="tp-h">Checklists</h3>
              {item.checklists.map((checklist) => {
                const done = checklist.entries.filter((entry) => entry.done).length;
                return (
                  <div key={checklist.id} className="tp-list">
                    <div className="tp-checklist-head">
                      <span className="tp-sub-title">{checklist.name}</span>
                      <span className="tp-progress"><span style={{ width: (checklist.entries.length ? (done / checklist.entries.length) * 100 : 0) + "%" }} /></span>
                      <span className="tp-count">{done}/{checklist.entries.length}</span>
                    </div>
                    {checklist.entries.map((entry) => (
                      <label key={entry.id} className="tp-check">
                        <input type="checkbox" checked={entry.done} disabled={!canEdit} onChange={(event) => save({ entryDone: { entryId: entry.id, done: event.target.checked } })} />
                        <span className={entry.done ? "lw-done" : ""}>{entry.label}</span>
                      </label>
                    ))}
                    {canEdit ? <QuickAdd label="+ Add item" onAdd={(label) => save({ checklistEntry: { checklistId: checklist.id, label } })} /> : null}
                  </div>
                );
              })}
              {canEdit ? <div className="tp-list tp-list--ghost"><QuickAdd label="+ New checklist" onAdd={(name) => save({ checklist: { name } })} /></div> : null}
            </section>

            {item.attachments.length ? (
              <section className="tp-section">
                <h3 className="tp-h">Attachments</h3>
                <div className="tp-list">
                  {item.attachments.map((file) => (
                    <div key={file.id} className="tp-sub">{file.url ? <a href={file.url} target="_blank" rel="noreferrer">{file.name}</a> : file.name}</div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <aside className="tp-side" aria-label="Activity">
            <h3 className="tp-h tp-side-head">Activity <span className="tp-count">{item.comments.length}</span></h3>
            <div className="tp-feed">
              <div className="tp-event">Task created {new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</div>
              {item.comments.map((entry) => (
                <div key={entry.id} className="tp-comment">
                  <span className="lw-avatar">{initials(entry.authorName)}</span>
                  <div className="tp-comment-card">
                    <div className="tp-comment-head"><strong>{entry.authorName}</strong><span>{new Date(entry.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span></div>
                    <div className="tp-comment-body">{entry.body}</div>
                  </div>
                </div>
              ))}
              <div className="tp-event">Last updated {new Date(item.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</div>
            </div>
            {canEdit ? (
              <form className="tp-compose" onSubmit={(event) => { event.preventDefault(); postComment(); }}>
                <textarea rows={3} value={comment} placeholder="Write a comment…" aria-label="Comment" onChange={(event) => setComment(event.target.value)}
                  onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); postComment(); } }} />
                <div className="tp-compose-row"><span>Ctrl + Enter to send</span><button type="submit" className="lw-primary" disabled={!comment.trim()}>Comment</button></div>
              </form>
            ) : null}
          </aside>
        </div>
      </aside>
    </div>
  );
}

const tpCss = [
  ".tp{--tp-bg:var(--cu-bg,#fff);--tp-side:var(--cu-side,#f7f8f9);--tp-border:var(--cu-border,#e4e6eb);--tp-muted:var(--cu-muted,#656f7d);--tp-hover:var(--cu-hover,rgba(15,23,42,.05));width:min(1120px,100%);height:100%;display:flex;flex-direction:column;background:var(--tp-bg);color:var(--cu-text,#292d34);box-shadow:-12px 0 32px rgba(0,0,0,.35);color-scheme:light}",
  "html[data-theme=dark] .tp{color-scheme:dark;--tp-bg:#1b1c1f;--tp-side:#17181b;--tp-border:#2c2e33;--tp-muted:#9ba1a9;--tp-hover:rgba(255,255,255,.06);color:#e3e4e6}",
  ".tp-top{display:flex;align-items:center;gap:12px;height:48px;padding:0 12px 0 28px;border-bottom:1px solid var(--tp-border);flex:none}",
  ".tp-crumbs{flex:1;min-width:0;display:flex;align-items:center;gap:4px;font-size:12px;color:var(--tp-muted);overflow:hidden;white-space:nowrap}",
  ".tp-crumb-wrap{display:inline-flex;align-items:center;min-width:0}",
  ".tp-crumb--move{position:relative;cursor:pointer;border-radius:5px;padding:1px 5px;margin:0 -5px}.tp-crumb--move:hover{background:rgba(123,104,238,.14);color:#7b68ee}",
  ".tp-crumb{overflow:hidden;text-overflow:ellipsis;max-width:260px}.tp-crumb--link{border:0;background:none;color:inherit;font:inherit;cursor:pointer;padding:0}.tp-crumb--link:hover{color:#7b68ee}",
  ".tp-sep{color:var(--tp-muted);opacity:.6;margin:0 4px}",
  ".tp-saving{font-size:11px;color:var(--tp-muted);white-space:nowrap}",
  ".tp-icon{display:grid;place-items:center;width:32px;height:32px;border:0;border-radius:6px;background:none;color:var(--tp-muted);cursor:pointer;font-size:15px}.tp-icon:hover{background:var(--tp-hover);color:inherit}",
  ".tp-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 340px}",
  ".tp-main{overflow-y:auto;padding:24px 36px 64px;display:flex;flex-direction:column;gap:26px}",
  ".tp-side{border-left:1px solid var(--tp-border);background:var(--tp-side);display:flex;flex-direction:column;min-height:0}",
  ".tp-title{display:block;width:calc(100% + 12px);min-height:42px;border:0;outline:0;resize:none;overflow:hidden;background:transparent;color:inherit;font:inherit;font-size:26px;font-weight:700;line-height:1.3;padding:4px 6px;margin:0 -6px;border-radius:6px;box-shadow:none}",
  ".tp-title:hover:not(:disabled),.tp-title:focus{background:var(--tp-hover)}",
  ".tp-props{display:flex;flex-direction:column}",
  ".tp-prop{display:grid;grid-template-columns:160px minmax(0,1fr);align-items:center;min-height:38px;gap:12px;border-radius:6px}",
  ".tp-label{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--tp-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".tp-label i{font-style:normal;width:16px;text-align:center;opacity:.75;flex:none}",
  ".tp-value{display:flex;align-items:center;gap:6px;min-width:0;font-size:13px}.tp-wrap{flex-wrap:wrap;padding:4px 0}",
  ".tp-status{position:relative;display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:6px;color:#fff;font-size:11px;font-weight:700;letter-spacing:.03em;cursor:pointer}",
  ".tp-overlay-select{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;font-size:13px}",
  ".tp-done{display:grid;place-items:center;width:28px;height:28px;border:1px solid var(--tp-border);border-radius:6px;background:none;color:var(--tp-muted);cursor:pointer;font-size:13px}.tp-done:hover{border-color:#0ca30c;color:#0ca30c}",
  ".tp-person{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 4px 0 3px;border-radius:14px;background:var(--tp-hover);font-size:12px}",
  ".tp-person .lw-avatar{border:0}",
  ".tp-x{border:0;background:none;color:var(--tp-muted);cursor:pointer;font-size:15px;line-height:1;padding:0 4px;border-radius:4px}.tp-x:hover{color:#e5484d}",
  ".tp-add-wrap{position:relative;display:inline-flex}",
  ".tp-add{position:relative;background:none;font:inherit;display:inline-flex;align-items:center;height:28px;padding:0 12px;border:1px dashed var(--tp-border);border-radius:14px;color:var(--tp-muted);font-size:12px;cursor:pointer}.tp-add:hover{color:#7b68ee;border-color:#7b68ee}",
  ".tp-empty{color:var(--tp-muted);font-size:13px}.tp-pad{margin:0;padding:10px 12px}",
  ".tp-date{display:inline-flex;align-items:center;gap:4px;height:30px;padding:0 4px 0 10px;border-radius:6px;background:var(--tp-hover);font-size:11px;color:var(--tp-muted);text-transform:uppercase;letter-spacing:.03em}",
  ".tp-date input{border:0;outline:0;background:transparent;color:var(--cu-text,#292d34);font:inherit;font-size:13px;letter-spacing:0;text-transform:none;padding:0 4px;box-shadow:none;height:26px}",
  "html[data-theme=dark] .tp-date input{color:#e3e4e6}",
  ".tp-date--late{color:#e5484d;background:rgba(229,72,77,.12)}.tp-date--late input{color:#e5484d !important}",
  ".tp-chip-select{position:relative;display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 12px;border-radius:6px;background:var(--tp-hover);font-size:12px;font-weight:600;cursor:pointer}",
  ".tp-tag{display:inline-flex;align-items:center;gap:2px;height:24px;padding:0 2px 0 8px;border-radius:4px;font-size:12px}",
  ".tp-tag-input{border:0;outline:0;background:transparent;color:inherit;font:inherit;font-size:12px;width:110px;height:26px;padding:0 6px;border-radius:4px;box-shadow:none}.tp-tag-input:hover,.tp-tag-input:focus{background:var(--tp-hover)}",
  ".tp-section{display:flex;flex-direction:column;gap:10px}",
  ".tp-h{margin:0;font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--tp-muted);display:flex;align-items:center;gap:10px}",
  ".tp-count{font-weight:500;letter-spacing:0;text-transform:none;font-size:12px;color:var(--tp-muted)}",
  ".tp-field{padding:2px 0}",
  ".tp-field input,.tp-field select,.tp-field textarea{border:1px solid transparent;outline:0;background:transparent;color:inherit;font:inherit;font-size:13px;border-radius:6px;padding:4px 8px;min-height:30px;box-shadow:none;max-width:100%}",
  ".tp-field input:not([type=checkbox]),.tp-field textarea{width:100%}",
  ".tp-field select{min-width:180px}",
  ".tp-field input:hover,.tp-field select:hover,.tp-field textarea:hover{background:var(--tp-hover)}",
  ".tp-field input:focus,.tp-field select:focus,.tp-field textarea:focus{border-color:#7b68ee;background:var(--tp-bg)}",
  ".tp-field input::placeholder{color:var(--tp-muted)}",
  ".tp-field .lw-multi{min-height:30px}",
  ".tp-desc{display:block;width:calc(100% + 20px);min-height:90px;border:1px solid transparent;border-radius:8px;outline:0;resize:none;overflow:hidden;background:transparent;color:inherit;font:inherit;font-size:14px;line-height:1.7;padding:8px 10px;margin:0 -10px;box-shadow:none}",
  ".tp-desc:hover:not(:disabled){background:var(--tp-hover)}.tp-desc:focus{border-color:#7b68ee;background:var(--tp-bg)}",
  ".tp-progress{flex:0 1 120px;height:4px;border-radius:2px;background:var(--tp-hover);overflow:hidden}.tp-progress span{display:block;height:100%;border-radius:2px;background:#0ca30c}",
  ".tp-list{border:1px solid var(--tp-border);border-radius:8px;overflow:hidden}",
  ".tp-list--ghost{border-style:dashed}",
  ".tp-sub{display:flex;align-items:center;gap:10px;width:100%;border:0;border-bottom:1px solid var(--tp-border);background:none;color:inherit;font:inherit;font-size:13px;padding:10px 12px;cursor:pointer;text-align:left}",
  ".tp-sub:hover{background:var(--tp-hover)}.tp-sub-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tp-sub-due{font-size:12px;color:var(--tp-muted)}",
  ".tp-list .lw-add{padding:9px 12px}.tp-list .lw-addform{padding:6px 12px;border-bottom:0}",
  ".tp-check{display:flex;align-items:flex-start;gap:10px;padding:9px 12px;border-bottom:1px solid var(--tp-border);font-size:13px;line-height:1.45;cursor:pointer}",
  ".tp-check:hover{background:var(--tp-hover)}",
  ".tp-check input{appearance:none;flex:none;width:16px;height:16px;margin:2px 0 0;border:1.5px solid var(--tp-muted);border-radius:4px;display:grid;place-items:center;cursor:pointer;background:transparent}",
  ".tp-check input:checked{background:#0ca30c;border-color:#0ca30c}",
  ".tp-check input:checked:after{content:'';width:4px;height:8px;border:solid #fff;border-width:0 2px 2px 0;transform:translateY(-1px) rotate(45deg)}",
  ".tp-checklist-head{display:flex;align-items:center;gap:12px;padding:10px 12px;border-bottom:1px solid var(--tp-border);font-size:13px;font-weight:600}",
  ".tp-side-head{padding:18px 20px 10px}",
  ".tp-feed{flex:1;overflow-y:auto;padding:4px 20px 16px;display:flex;flex-direction:column;gap:14px}",
  ".tp-event{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--tp-muted)}.tp-event:before{content:'';width:6px;height:6px;border-radius:50%;background:var(--tp-muted);opacity:.5;flex:none}",
  ".tp-comment{display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;align-items:start}",
  ".tp-comment-card{background:var(--tp-bg);border:1px solid var(--tp-border);border-radius:8px;padding:8px 10px}",
  ".tp-comment-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:12px}.tp-comment-head span{color:var(--tp-muted);font-size:11px;white-space:nowrap}",
  ".tp-comment-body{white-space:pre-wrap;font-size:13px;line-height:1.5;margin-top:4px;overflow-wrap:anywhere}",
  ".tp-compose{border-top:1px solid var(--tp-border);padding:12px 16px 16px;display:flex;flex-direction:column;gap:8px}",
  ".tp-compose textarea{width:100%;resize:none;border:1px solid var(--tp-border);border-radius:8px;background:var(--tp-bg);color:inherit;font:inherit;font-size:13px;line-height:1.5;padding:8px 10px;outline:0;box-shadow:none}.tp-compose textarea:focus{border-color:#7b68ee}",
  ".tp-compose-row{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:11px;color:var(--tp-muted)}",
  ".tp-ai{padding:14px 16px;border-radius:10px;background:linear-gradient(135deg,rgba(123,104,238,.10),rgba(42,120,214,.06));border:1px solid rgba(123,104,238,.25)}",
  ".tp-ai-buttons{display:flex;flex-wrap:wrap;gap:8px}",
  ".tp-ai-btn{min-height:36px;padding:0 16px;border-radius:8px;border:1px solid rgba(123,104,238,.45);background:var(--tp-bg);color:inherit;font:inherit;font-size:14px;font-weight:600;cursor:pointer}",
  ".tp-ai-btn:hover:not(:disabled){border-color:#7b68ee;color:#7b68ee}.tp-ai-btn:disabled{opacity:.55;cursor:default}",
  ".tp-ai-wait{margin:0;font-size:13px;color:var(--tp-muted)}",
  ".tp-ai-note{margin:0;font-size:13px;color:#b87700}html[data-theme=dark] .tp-ai-note{color:#f0b429}",
  ".tp-ai-card{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:8px;background:var(--tp-bg);border:1px solid var(--tp-border)}",
  ".tp-ai-card p{margin:0;font-size:14px;line-height:1.55}",
  ".tp-ai-card .tp-check{border-bottom:0;padding:6px 0}",
  ".tp-ai-tags{display:flex;flex-wrap:wrap;gap:6px}",
  ".tp-ai-tag{border:1px dashed rgba(123,104,238,.6);background:none;color:#7b68ee;font:inherit;font-size:13px;padding:4px 10px;border-radius:14px;cursor:pointer}.tp-ai-tag:hover{background:rgba(123,104,238,.12)}",
  ".tp-ai-actions{display:flex;gap:8px;flex-wrap:wrap}",
  ".tp-ai-fine{margin:0;font-size:12px;color:var(--tp-muted)}",
  // The global theme styles every input, select and textarea (html[data-theme] input {...}); the panel's borderless controls need higher specificity to stay borderless.
  "html .tp .tp-title,html .tp .tp-desc,html .tp .tp-tag-input,html .tp .tp-date input,html .tp .tp-field input,html .tp .tp-field select,html .tp .tp-field textarea{background:transparent;border-color:transparent;color:inherit;outline:none}",
  "html .tp .tp-title:hover:not(:disabled),html .tp .tp-title:focus,html .tp .tp-desc:hover:not(:disabled),html .tp .tp-tag-input:hover,html .tp .tp-tag-input:focus,html .tp .tp-field input:hover,html .tp .tp-field select:hover,html .tp .tp-field textarea:hover{background:var(--tp-hover)}",
  "html .tp .tp-desc:focus,html .tp .tp-field input:focus,html .tp .tp-field select:focus,html .tp .tp-field textarea:focus{background:var(--tp-bg);border-color:#7b68ee;outline:none}",
  "html .tp .tp-title:focus-visible,html .tp .tp-tag-input:focus-visible{box-shadow:inset 0 0 0 1px #7b68ee}",
  "html .tp .tp-date input{border:0;outline:none;background:transparent}",
  "html .tp .tp-compose textarea{background:var(--tp-bg);border-color:var(--tp-border);outline:none}",
  "html .tp .tp-compose textarea:focus{border-color:#7b68ee}",
  "html .tp select option{background:var(--tp-bg);color:inherit}",
  "html .tp .tp-check input{background:transparent;border-color:var(--tp-muted);outline:none}",
  "html .tp .tp-check input:checked{background:#0ca30c;border-color:#0ca30c}",
  "html .tp .tp-overlay-select{background:transparent;border:0;outline:none}",
  "@media (max-width:980px){.tp-body{grid-template-columns:minmax(0,1fr);overflow-y:auto}.tp-main{overflow:visible}.tp-side{border-left:0;border-top:1px solid var(--tp-border);min-height:auto}.tp-feed{overflow:visible}}",
  "@media (max-width:760px){",
  ".tp-top{padding-left:16px}",
  ".tp-main{padding:16px 16px 40px;gap:20px}",
  ".tp-title{font-size:20px;line-height:1.35;min-height:34px}",
  ".tp-saving{display:none}",
  ".tp-prop{grid-template-columns:minmax(0,1fr);gap:4px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--tp-border)}",
  ".tp-props{gap:0}",
  ".tp-label{font-size:12px;text-transform:uppercase;letter-spacing:.04em}",
  ".tp-value{flex-wrap:wrap;width:100%}",
  ".tp-h{flex-wrap:wrap;row-gap:4px}",
  ".tp-ai-buttons{flex-direction:column}.tp-ai-btn{width:100%;min-height:44px}",
  ".tp-date{flex:1 1 auto}",
  ".tp-field select{min-width:0;width:100%}",
  ".tp-side{max-height:none}",
  ".tp-compose textarea{font-size:16px}",
  "}"
].join("");
const lwCss = [
  ".lw{--lw-border:var(--cu-border,#e4e6eb);--lw-muted:var(--cu-muted,#656f7d);--lw-hover:var(--cu-hover,rgba(15,23,42,.05));--lw-bg:var(--cu-bg,#fff);display:flex;flex-direction:column;gap:0;margin:-20px -24px 0}",
  ".lw-head{display:flex;align-items:center;gap:8px;padding:12px 24px 6px}",
  ".lw-head h1{margin:0;font-size:15px;font-weight:600}",
  ".lw-space-badge{width:20px;height:20px;border-radius:5px;display:grid;place-items:center;background:#7b68ee;color:#fff;font-size:10px;font-weight:800}",
  ".lw-head-count{font-size:12px;color:var(--lw-muted)}",
  ".lw-views{display:flex;gap:2px;padding:0 20px;border-bottom:1px solid var(--lw-border)}",
  ".lw-views button{border:0;border-bottom:2px solid transparent;background:none;color:var(--lw-muted);font:inherit;font-size:13px;padding:8px 10px;cursor:pointer}",
  ".lw-views button.is-active{color:inherit;border-bottom-color:#7b68ee;font-weight:600}",
  ".lw-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:8px 24px;border-bottom:1px solid var(--lw-border)}",
  ".lw-chips,.lw-tools{display:flex;align-items:center;gap:6px}",
  ".lw-chip{border:1px solid var(--lw-border);background:none;color:inherit;font:inherit;font-size:12px;padding:3px 10px;border-radius:14px;cursor:pointer}",
  ".lw-chip--on{background:rgba(123,104,238,.14);border-color:rgba(123,104,238,.45);color:#7b68ee}",
  ".lw-icon-btn{display:grid;place-items:center;width:28px;height:28px;border:1px solid var(--lw-border);border-radius:6px;background:none;color:inherit;cursor:pointer}",
  ".lw-search{height:28px;width:200px;font-size:13px}",
  ".lw-primary{border:0;background:#7b68ee;color:#fff;font:inherit;font-size:12px;font-weight:600;padding:5px 12px;border-radius:6px;cursor:pointer}",
  ".lw-primary:hover{background:#6a58e0}",
  ".lw-ghost{border:1px solid var(--lw-border);background:none;color:inherit;font:inherit;font-size:12px;padding:5px 10px;border-radius:6px;cursor:pointer}",
  ".lw-error{color:#e5484d;margin:8px 24px}",
  ".lw-groups{display:flex;flex-direction:column;gap:20px;padding:14px 24px 40px}",
  ".lw-group-head{display:flex;align-items:center;gap:8px;margin-bottom:4px}",
  ".lw-group-head:hover .lw-group-add{opacity:1}",
  ".lw-pill{display:inline-flex;align-items:center;gap:6px;color:#fff;text-transform:uppercase;font-size:11px;font-weight:700;padding:3px 9px 3px 6px;border-radius:5px;letter-spacing:.02em}",
  ".lw-pill .lw-sicon{border-color:#fff !important;background:transparent !important}",
  ".lw-n{font-size:12px;color:var(--lw-muted);font-weight:500}",
  ".lw-group-add{border:0;background:none;color:var(--lw-muted);font:inherit;font-size:12px;cursor:pointer;padding:4px 8px;border-radius:6px}",
  ".lw-group-add:hover{color:#7b68ee;background:var(--lw-hover)}",
  ".lw-complete{display:grid;place-items:center;width:26px;height:26px;margin:-4px -2px;border:0;border-radius:50%;background:none;padding:0;cursor:pointer;flex:none}",
  ".lw-complete:hover:not(:disabled){background:rgba(12,163,12,.16)}",
  ".lw-complete:hover:not(:disabled) .lw-sicon{border-color:#0ca30c !important}",
  ".lw-complete:disabled{cursor:default}",
  ".lw-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:130;display:flex;align-items:center;gap:12px;max-width:min(600px,calc(100vw - 32px));padding:10px 10px 10px 16px;border-radius:10px;background:#292d34;color:#fff;font-size:14px;box-shadow:0 12px 30px rgba(0,0,0,.35)}",
  "html[data-theme=dark] .lw-toast{background:#f0f1f3;color:#1b1c1f}",
  ".lw-toast-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".lw-toast-undo{border:0;background:#7b68ee;color:#fff;font:inherit;font-size:13px;font-weight:700;padding:6px 14px;border-radius:6px;cursor:pointer;flex:none}",
  ".lw-toast-close{border:0;background:none;color:inherit;opacity:.7;font-size:14px;cursor:pointer;padding:4px 6px;flex:none}",
  ".lw-colhead,.lw-row{display:grid;grid-template-columns:minmax(0,1fr) 120px 110px 100px;align-items:center}",
  ".lw-colhead{font-size:11px;color:var(--lw-muted);padding:4px 0 6px 44px;border-bottom:1px solid var(--lw-border)}",
  ".lw-row[draggable=true]{cursor:grab}.lw-row[draggable=true]:active{cursor:grabbing}",
  ".lw-row{min-height:38px;border-bottom:1px solid var(--lw-border);cursor:pointer}",
  ".lw-row:hover{background:var(--lw-hover)}",
  ".lw-name{display:flex;align-items:center;gap:7px;min-width:0;padding-right:10px}",
  ".lw-caret{display:grid;place-items:center;width:18px;height:18px;border:0;background:none;color:var(--lw-muted);cursor:pointer;padding:0;border-radius:4px;flex:none}",
  ".lw-caret:hover{background:var(--lw-hover)}",
  ".lw-sicon{display:inline-grid;place-items:center;width:14px;height:14px;border-radius:50%;border:2px solid;flex:none;box-sizing:border-box}",
  ".lw-sicon--todo{border-style:dashed}",
  ".lw-sicon--done{border-width:0}",
  ".lw-title{font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}",
  ".lw-title--closed{color:var(--lw-muted)}",
  ".lw-row:hover .lw-title{color:#7b68ee}",
  ".lw-mini{flex:none;font-size:11px;color:var(--lw-muted);padding:0 4px;border:1px solid var(--lw-border);border-radius:4px}",
  ".lw-tag{flex:none;font-size:11px;padding:1px 7px;border-radius:4px;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".lw-cell{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".lw-faint{color:var(--lw-muted);opacity:.7}",
  ".lw-late{color:#e5484d}.lw-today{color:#f5a623}",
  ".lw-priority-text{color:inherit}",
  ".lw-avatars{display:flex}.lw-avatars .lw-avatar+.lw-avatar{margin-left:-6px}",
  ".lw-avatar{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#5f55ee;color:#fff;font-size:9px;font-weight:700;border:2px solid var(--lw-bg);flex:none}",
  ".lw-empty-person{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;border:1px dashed var(--lw-border);color:var(--lw-muted)}",
  ".lw-add{border:0;background:none;color:var(--lw-muted);cursor:pointer;padding:8px 0 8px 44px;text-align:left;font:inherit;font-size:13px;width:100%}",
  ".lw-add:hover{color:#7b68ee;background:var(--lw-hover)}",
  ".lw-addform{display:flex;gap:6px;align-items:center;padding:6px 0 6px 44px;border-bottom:1px solid var(--lw-border)}.lw-addform input{flex:1;height:30px}",
  ".lw-board{display:flex;gap:10px;overflow-x:auto;padding:14px 24px 40px;align-items:flex-start}",
  ".lw-column{flex:0 0 272px;background:var(--lw-hover);border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px}",
  ".lw-column-head{display:flex;align-items:center;gap:8px;padding:4px 2px 6px}",
  ".lw-card{background:var(--lw-bg);border:1px solid var(--lw-border);border-radius:8px;padding:10px;cursor:pointer;display:flex;flex-direction:column;gap:8px;font-size:13px;box-shadow:0 1px 2px rgba(0,0,0,.06)}",
  ".lw-card:hover{border-color:#7b68ee}",
  ".lw-card strong{font-weight:500}",
  ".lw-card-tags{display:flex;gap:4px;flex-wrap:wrap}",
  ".lw-card-foot{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--lw-muted)}",
  ".lw-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:95;display:flex;justify-content:flex-end}",
  ".lw-panel{width:min(820px,100%);height:100%;overflow-y:auto;background:var(--lw-bg);color:inherit;box-shadow:-8px 0 24px rgba(0,0,0,.3);padding:14px 28px 40px}",
  "html[data-theme=dark] .lw-panel{background:#1b1c1f;color:#e3e4e6}",
  ".lw-panel-top{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:12px;color:var(--lw-muted);padding-bottom:10px;border-bottom:1px solid var(--lw-border)}",
  ".lw-crumbs button{border:0;background:none;color:#7b68ee;cursor:pointer;font:inherit;padding:0}",
  ".lw-close{border:0;background:none;color:inherit;font-size:16px;cursor:pointer;width:28px;height:28px;border-radius:6px}",
  ".lw-close:hover{background:var(--lw-hover)}",
  ".lw-panel-body{display:flex;flex-direction:column;gap:18px;margin-top:14px}",
  ".lw-panel-title{font-size:24px;font-weight:700;border:0;background:transparent;color:inherit;padding:2px 0;width:100%;box-shadow:none}",
  ".lw-props{display:grid;grid-template-columns:110px minmax(0,1fr);gap:8px 12px;align-items:center;font-size:13px}",
  ".lw-prop-label{color:var(--lw-muted)}",
  ".lw-props select,.lw-props input{font-size:13px;max-width:100%}",
  ".lw-status-select{color:#fff;border:0;border-radius:5px;font-weight:700;font-size:11px !important;padding:4px 8px}",
  ".lw-multi{min-height:64px;width:100%}",
  ".lw-dates{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
  ".lw-desc{font:inherit;font-size:14px;line-height:1.6;white-space:pre-wrap;border:1px solid var(--lw-border);border-radius:8px;padding:12px;background:transparent;color:inherit}",
  ".lw-section h3{font-size:14px;margin:0 0 8px;font-weight:600}",
  ".lw-subitem{display:flex;gap:8px;align-items:center;width:100%;border:0;border-bottom:1px solid var(--lw-border);background:none;color:inherit;font:inherit;font-size:13px;padding:8px 4px;cursor:pointer;text-align:left}",
  ".lw-subitem:hover{background:var(--lw-hover)}",
  ".lw-section .lw-add,.lw-section .lw-addform{padding-left:4px}",
  ".lw-checklist{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}",
  ".lw-entry{display:flex;gap:8px;align-items:flex-start;font-size:13px}.lw-done{text-decoration:line-through;color:var(--lw-muted)}",
  ".lw-comment{padding:10px 0;border-bottom:1px solid var(--lw-border);font-size:13px}",
  ".lw-comment-head{display:flex;align-items:center;gap:8px}.lw-comment-head span:last-child{font-size:12px}",
  ".lw-comment-body{white-space:pre-wrap;margin:6px 0 0 30px}",
  ".lw-table-wrap{overflow-x:auto;padding:0 24px 40px}",
  ".lw-table{width:100%;border-collapse:collapse;font-size:13px;min-width:900px}",
  ".lw-table th{position:sticky;top:0;background:var(--lw-bg);text-align:left;font-size:11px;font-weight:500;color:var(--lw-muted);border-bottom:1px solid var(--lw-border);padding:8px 6px}",
  ".lw-table td{border-bottom:1px solid var(--lw-border);padding:5px 6px;vertical-align:middle}",
  ".lw-table tr:hover td{background:var(--lw-hover)}",
  ".lw-th{border:0;background:none;color:inherit;font:inherit;cursor:pointer;padding:0}",
  ".lw-td-name{max-width:340px}.lw-td-tags{max-width:220px;white-space:nowrap;overflow:hidden}",
  ".lw-td-tags .lw-tag{margin-right:4px}",
  ".lw-link{border:0;background:none;color:inherit;font:inherit;font-weight:500;text-align:left;cursor:pointer;padding:0;display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".lw-link:hover{color:#7b68ee}.lw-parent{display:block;font-size:11px}",
  ".lw-cell-input{font-size:12px;background:transparent;color:inherit;border:1px solid transparent;border-radius:4px;padding:2px 4px}",
  ".lw-cell-input:hover,.lw-cell-input:focus{border-color:var(--lw-border)}",
  ".lw-cal{padding:12px 24px 40px}",
  ".lw-cal-head{display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap}.lw-cal-head h2{margin:0 10px;font-size:16px}",
  ".lw-cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border-top:1px solid var(--lw-border);border-left:1px solid var(--lw-border)}",
  ".lw-cal-weekday{font-size:11px;color:var(--lw-muted);padding:6px;border-right:1px solid var(--lw-border);border-bottom:1px solid var(--lw-border)}",
  ".lw-cal-day{min-height:104px;padding:4px;border-right:1px solid var(--lw-border);border-bottom:1px solid var(--lw-border);display:flex;flex-direction:column;gap:3px;min-width:0}",
  ".lw-cal-day.is-outside{opacity:.45}",
  ".lw-cal-date{font-size:12px;color:var(--lw-muted);align-self:flex-end;width:22px;height:22px;display:grid;place-items:center;border-radius:50%}",
  ".lw-cal-day.is-today .lw-cal-date{background:#7b68ee;color:#fff}",
  ".lw-cal-item{border:0;border-left:3px solid;background:var(--lw-hover);color:inherit;font:inherit;font-size:11px;text-align:left;padding:2px 5px;border-radius:3px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".lw-cal-item:hover{color:#7b68ee}.lw-cal-more{font-size:11px}",
  ".lw-overlay--center{justify-content:center;align-items:flex-start;padding:60px 16px}",
  ".lw-modal{width:min(620px,100%);max-height:calc(100vh - 120px);overflow-y:auto;background:var(--lw-bg);border:1px solid var(--lw-border);border-radius:10px;padding:16px 20px;box-shadow:0 20px 50px rgba(0,0,0,.35)}",
  "html[data-theme=dark] .lw-modal{background:#1b1c1f;color:#e3e4e6}",
  ".lw-status-rows{display:flex;flex-direction:column;gap:6px;margin:10px 0}",
  ".lw-status-row{display:grid;grid-template-columns:38px minmax(0,1fr) 120px 30px 30px 30px;gap:6px;align-items:center}",
  ".lw-status-row input[type=color]{width:36px;height:30px;padding:0;border:1px solid var(--lw-border);border-radius:6px;background:none}",
  ".lw-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}",
  ".lw-field-text{width:100%}",
  ".lw-field-edit{display:grid;grid-template-columns:minmax(0,200px) minmax(0,1fr) 30px;gap:8px;align-items:center}",
  ".lw-field-edit .lw-faint{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".lw-field-add{display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--lw-border);padding-top:12px;margin-top:6px}",
  ".lw-field-add-row{display:grid;grid-template-columns:minmax(0,1fr) 140px;gap:8px}",
  ".lw-tools{flex-wrap:wrap;justify-content:flex-end}",
  ".au-modal{width:min(760px,100%)}",
  ".au-rules{display:flex;flex-direction:column;gap:8px;margin:12px 0}",
  ".au-rule{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px 12px;border:1px solid var(--lw-border);border-radius:10px}",
  ".au-rule.is-off .au-rule-text{opacity:.55}",
  ".au-rule-text{display:flex;flex-direction:column;gap:2px;min-width:0;font-size:13px}.au-rule-text span{color:var(--lw-muted)}.au-rule-text small{font-size:11px;color:var(--lw-muted)}",
  ".au-switch{position:relative;width:36px;height:20px;border-radius:10px;border:0;padding:0;background:var(--lw-border);cursor:pointer;flex:none;transition:background .15s}",
  ".au-switch:after{content:'';position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:#fff;transition:transform .15s;box-shadow:0 1px 2px rgba(0,0,0,.3)}",
  ".au-switch[aria-checked=true]{background:#7b68ee}.au-switch[aria-checked=true]:after{transform:translateX(16px)}",
  ".au-builder{display:flex;flex-direction:column;gap:10px;padding:14px;border:1px solid rgba(123,104,238,.35);border-radius:10px;background:rgba(123,104,238,.06)}",
  ".au-step{display:grid;grid-template-columns:52px minmax(0,1fr) minmax(0,1fr);gap:8px;align-items:center}",
  ".au-step select,.au-step input,.au-builder textarea,.au-create input{font-size:13px;min-width:0}",
  ".au-step-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#7b68ee}",
  ".au-preview{margin:0;font-size:13px;padding:8px 10px;border-radius:6px;background:var(--lw-hover)}",
  ".au-create{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}",
  ".au-runs{display:flex;flex-direction:column;gap:6px;margin-top:14px}",
  ".au-run{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;font-size:12px;padding:6px 0;border-bottom:1px solid var(--lw-border)}",
  ".au-run-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".au-badge{font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;white-space:nowrap}",
  ".au-badge--success{background:rgba(12,163,12,.15);color:#0a8a0a}.au-badge--failed{background:rgba(208,59,59,.15);color:#d03b3b}.au-badge--skipped{background:var(--lw-hover);color:var(--lw-muted)}",
  "html[data-theme=dark] .au-badge--success{color:#5fd35f}html[data-theme=dark] .au-badge--failed{color:#f19b9b}",
  "@media (max-width:600px){.au-step{grid-template-columns:44px minmax(0,1fr)}.au-step>*:nth-child(3){grid-column:2}}",
  ".work-tag--blue{background:rgba(42,120,214,.14);color:#1c5cab}",
  ".work-tag--green{background:rgba(12,163,12,.14);color:#0a6b0a}",
  ".work-tag--amber{background:rgba(229,154,0,.18);color:#8a5a00}",
  ".work-tag--red{background:rgba(208,59,59,.14);color:#a82828}",
  ".work-tag--purple{background:rgba(123,104,238,.16);color:#5443c9}",
  ".work-tag--teal{background:rgba(27,175,122,.15);color:#0e7552}",
  ".work-tag--pink{background:rgba(232,123,164,.18);color:#a8356a}",
  ".work-tag--slate{background:rgba(135,144,158,.18);color:#4b5563}",
  "html[data-theme=dark] .work-tag--blue{background:rgba(57,135,229,.2);color:#8fbdf5}",
  "html[data-theme=dark] .work-tag--green{background:rgba(12,163,12,.2);color:#7fdc7f}",
  "html[data-theme=dark] .work-tag--amber{background:rgba(229,154,0,.2);color:#f0b429}",
  "html[data-theme=dark] .work-tag--red{background:rgba(230,103,103,.2);color:#f19b9b}",
  "html[data-theme=dark] .work-tag--purple{background:rgba(144,133,233,.22);color:#b9aff8}",
  "html[data-theme=dark] .work-tag--teal{background:rgba(25,158,112,.22);color:#6fdcb4}",
  "html[data-theme=dark] .work-tag--pink{background:rgba(213,81,129,.22);color:#f2a7c4}",
  "html[data-theme=dark] .work-tag--slate{background:rgba(195,200,208,.14);color:#c3c8d0}",
  "@media (max-width:900px){.lw{margin:-16px -16px 0}.lw-table-wrap,.lw-cal{padding-left:16px;padding-right:16px}.lw-head,.lw-toolbar{padding-left:16px;padding-right:16px}.lw-groups,.lw-board{padding-left:16px;padding-right:16px}}",
  "@media (max-width:760px){",
  ".lw-views{overflow-x:auto;white-space:nowrap;scrollbar-width:none}.lw-views::-webkit-scrollbar{display:none}",
  ".lw-toolbar{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;padding:8px 16px;gap:8px}.lw-toolbar::-webkit-scrollbar{display:none}",
  ".lw-chips,.lw-tools{flex:0 0 auto}",
  ".lw-chip,.lw-ghost,.lw-icon-btn{flex:0 0 auto;min-height:34px}",
  ".lw-head{padding:10px 16px 4px}.lw-head h1{font-size:17px}",
  ".lw-row{min-height:52px}.lw-title{font-size:14px}",
  ".lw-complete{width:32px;height:32px}",
  ".lw-add{padding:12px 0 12px 44px}",
  ".lw-toast{bottom:88px;left:12px;right:12px;transform:none;max-width:none}",
  ".lw-groups{padding-bottom:96px}.lw-board{padding-bottom:96px}",
  "}",
  "@media (max-width:700px){.lw-colhead,.lw-row{grid-template-columns:minmax(0,1fr) 76px}.lw-colhead span:nth-child(2),.lw-colhead span:nth-child(4),.lw-row>.lw-cell:nth-child(2),.lw-row>.lw-cell:nth-child(4),.lw-tag,.lw-mini{display:none}.lw-props{grid-template-columns:1fr}}"
].join("");
