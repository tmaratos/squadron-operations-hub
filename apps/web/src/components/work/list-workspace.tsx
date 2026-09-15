"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ItemDetail, ItemPriority, ListDetail, ListStatus, WorkItem } from "@/lib/work/types";

type Person = { id: string; fullName: string };
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

export function ListWorkspace({ list, initialItems, people, canEdit }: { list: ListDetail; initialItems: WorkItem[]; people: Person[]; canEdit: boolean }) {
  const [items, setItems] = useState<WorkItem[]>(initialItems);
  const [mode, setMode] = useState<Mode>("list");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [expandAll, setExpandAll] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingStatuses, setEditingStatuses] = useState(false);
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

  function renderRow(item: WorkItem, depth: number): ReactNode {
    const kids = (childrenOf.get(item.id) ?? []).filter(matches);
    const status = item.statusId ? statusById.get(item.statusId) : undefined;
    const due = formatDue(item.dueOn);
    const open = expandAll || expanded[item.id];
    return (
      <div key={item.id}>
        <div className="lw-row" onClick={() => setOpenId(item.id)}>
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
            <StatusIcon status={status} />
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
                    <article key={item.id} className="lw-card" draggable={canEdit} onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)} onClick={() => setOpenId(item.id)}>
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

function ItemPanel({ itemId, statuses, people, canEdit, onClose, onOpen, onPatch, onAddChild }: {
  itemId: string;
  statuses: ListStatus[];
  people: Person[];
  canEdit: boolean;
  onClose: () => void;
  onOpen: (id: string) => void;
  onPatch: (id: string, body: Record<string, unknown>) => Promise<ItemDetail | null>;
  onAddChild: (title: string) => Promise<void>;
}) {
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [draft, setDraft] = useState({ title: "", description: "", tags: "" });
  const [comment, setComment] = useState("");

  function adopt(next: ItemDetail) {
    setItem(next);
    setDraft({ title: next.title, description: next.description ?? "", tags: next.tags.map((tag) => tag.label).join(", ") });
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

  async function save(body: Record<string, unknown>) {
    const next = await onPatch(itemId, body);
    if (next) adopt(next);
  }

  const currentStatus = statuses.find((status) => status.id === item?.statusId);

  return (
    <div className="lw-overlay" onClick={onClose}>
      <aside className="lw-panel" onClick={(event) => event.stopPropagation()} aria-label="Task details">
        <div className="lw-panel-top">
          <span className="lw-crumbs">
            {item?.listName}
            {item?.ancestors.map((ancestor) => (
              <span key={ancestor.id}> / <button onClick={() => onOpen(ancestor.id)}>{ancestor.title}</button></span>
            ))}
          </span>
          <button className="lw-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {!item ? <p className="lw-faint">Loading…</p> : (
          <div className="lw-panel-body">
            <input className="lw-panel-title" value={draft.title} disabled={!canEdit}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              onBlur={() => { if (draft.title.trim() && draft.title !== item.title) save({ title: draft.title }); }} />

            <div className="lw-props">
              <span className="lw-prop-label">Status</span>
              <span>
                <select className="lw-status-select" style={{ background: currentStatus?.color ?? "#87909e" }} value={item.statusId ?? ""} disabled={!canEdit} onChange={(event) => save({ statusId: event.target.value || null })}>
                  {statuses.map((status) => <option key={status.id} value={status.id}>{status.name.toUpperCase()}</option>)}
                </select>
              </span>
              <span className="lw-prop-label">Assignees</span>
              <span>
                <select multiple className="lw-multi" value={item.assignees.map((person) => person.id)} disabled={!canEdit}
                  onChange={(event) => save({ assigneeIds: Array.from(event.target.selectedOptions).map((option) => option.value) })}>
                  {people.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
                </select>
              </span>
              <span className="lw-prop-label">Dates</span>
              <span className="lw-dates">
                <input type="date" aria-label="Start date" value={item.startOn ?? ""} disabled={!canEdit} onChange={(event) => save({ startOn: event.target.value || null })} />
                <span className="lw-faint">→</span>
                <input type="date" aria-label="Due date" value={item.dueOn ?? ""} disabled={!canEdit} onChange={(event) => save({ dueOn: event.target.value || null })} />
              </span>
              <span className="lw-prop-label">Priority</span>
              <span>
                <select value={item.priority ?? ""} disabled={!canEdit} onChange={(event) => save({ priority: event.target.value || null })}>
                  <option value="">Empty</option>
                  {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority[0] + priority.slice(1).toLowerCase()}</option>)}
                </select>
              </span>
              <span className="lw-prop-label">Tags</span>
              <span>
                <input value={draft.tags} placeholder="Comma separated" disabled={!canEdit} onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
                  onBlur={() => save({ tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean) })} />
              </span>
            </div>

            <textarea className="lw-desc" rows={12} placeholder="Add description" value={draft.description} disabled={!canEdit}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              onBlur={() => { if (draft.description !== (item.description ?? "")) save({ description: draft.description }); }} />

            <section className="lw-section">
              <h3>Subtasks <span className="lw-n">{item.children.length}</span></h3>
              {item.children.map((child) => {
                const status = statuses.find((entry) => entry.id === child.statusId);
                return (
                  <button key={child.id} className="lw-subitem" onClick={() => onOpen(child.id)}>
                    <StatusIcon status={status} /> <span>{child.title}</span>
                  </button>
                );
              })}
              {canEdit ? <QuickAdd label="+ Add subtask" onAdd={async (title) => {
                await onAddChild(title);
                const data = await send("/api/work/items/" + itemId, "GET");
                adopt(data.item);
              }} /> : null}
            </section>

            <section className="lw-section">
              <h3>Checklists</h3>
              {item.checklists.map((checklist) => (
                <div key={checklist.id} className="lw-checklist">
                  <strong>{checklist.name} <span className="lw-n">{checklist.entries.filter((entry) => entry.done).length}/{checklist.entries.length}</span></strong>
                  {checklist.entries.map((entry) => (
                    <label key={entry.id} className="lw-entry">
                      <input type="checkbox" checked={entry.done} disabled={!canEdit} onChange={(event) => save({ entryDone: { entryId: entry.id, done: event.target.checked } })} />
                      <span className={entry.done ? "lw-done" : ""}>{entry.label}</span>
                    </label>
                  ))}
                  {canEdit ? <QuickAdd label="+ Add item" onAdd={(label) => save({ checklistEntry: { checklistId: checklist.id, label } })} /> : null}
                </div>
              ))}
              {canEdit ? <QuickAdd label="+ Add checklist" onAdd={(name) => save({ checklist: { name } })} /> : null}
            </section>

            {item.attachments.length ? (
              <section className="lw-section">
                <h3>Attachments</h3>
                {item.attachments.map((file) => (
                  <div key={file.id}>{file.url ? <a href={file.url} target="_blank" rel="noreferrer">{file.name}</a> : file.name}</div>
                ))}
              </section>
            ) : null}

            <section className="lw-section">
              <h3>Activity <span className="lw-n">{item.comments.length}</span></h3>
              {item.comments.map((entry) => (
                <div key={entry.id} className="lw-comment">
                  <div className="lw-comment-head"><span className="lw-avatar">{initials(entry.authorName)}</span><strong>{entry.authorName}</strong> <span className="lw-faint">{new Date(entry.createdAt).toLocaleString()}</span></div>
                  <div className="lw-comment-body">{entry.body}</div>
                </div>
              ))}
              {canEdit ? (
                <form className="lw-addform" onSubmit={async (event) => {
                  event.preventDefault();
                  if (!comment.trim()) return;
                  await save({ comment });
                  setComment("");
                }}>
                  <input value={comment} placeholder="Write a comment..." onChange={(event) => setComment(event.target.value)} />
                  <button type="submit" className="lw-primary">Comment</button>
                </form>
              ) : null}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

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
  ".lw-group-add{opacity:0;border:0;background:none;color:var(--lw-muted);font:inherit;font-size:12px;cursor:pointer}",
  ".lw-colhead,.lw-row{display:grid;grid-template-columns:minmax(0,1fr) 120px 110px 100px;align-items:center}",
  ".lw-colhead{font-size:11px;color:var(--lw-muted);padding:4px 0 6px 44px;border-bottom:1px solid var(--lw-border)}",
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
  "@media (max-width:900px){.lw{margin:-16px -16px 0}.lw-table-wrap,.lw-cal{padding-left:16px;padding-right:16px}.lw-head,.lw-toolbar{padding-left:16px;padding-right:16px}.lw-groups,.lw-board{padding-left:16px;padding-right:16px}}",
  "@media (max-width:700px){.lw-colhead,.lw-row{grid-template-columns:minmax(0,1fr) 76px}.lw-colhead span:nth-child(2),.lw-colhead span:nth-child(4),.lw-row>.lw-cell:nth-child(2),.lw-row>.lw-cell:nth-child(4),.lw-tag,.lw-mini{display:none}.lw-props{grid-template-columns:1fr}}"
].join("");
