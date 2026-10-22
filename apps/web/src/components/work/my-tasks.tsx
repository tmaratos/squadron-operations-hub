"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Search, Users, X } from "lucide-react";
import { InlineAssignee, InlinePriority, inlinePickerCss } from "./inline-pickers";
import type { ItemPriority } from "@/lib/work/types";

// What you have to do, in the order you have to do it.
//
// The page this replaced read a table the squadron's work was never imported into, so it told everybody
// they had nothing to do while fifty things sat open. This reads the same work as everywhere else.
//
// Built for the whole squadron, from members who find a checkbox daunting to members who assign twenty
// things at once. The round check on each row finishes the task - that is what a check next to a task means
// to everybody. Choosing several rows to hand to somebody is a separate, deliberate mode behind "Select".

export interface TaskRow {
  id: string;
  listId: string;
  listName: string;
  title: string;
  statusName: string | null;
  dueOn: string | null;
  closed: boolean;
  assignees: string[];
  assigneeIds: string[];
  priority?: string | null;
}

type Tab = "mine" | "unassigned" | "everyone";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "mine", label: "Mine" },
  { key: "unassigned", label: "No owner" },
  { key: "everyone", label: "Everyone" }
];

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

function dayDiff(dueOn: string): number {
  return Math.round((new Date(dueOn + "T12:00:00Z").getTime() - new Date(today() + "T12:00:00Z").getTime()) / 86400000);
}

function whenLabel(dueOn: string | null): string {
  if (!dueOn) return "No due date";
  const days = dayDiff(dueOn);
  if (days < -1) return Math.abs(days) + " days overdue";
  if (days === -1) return "1 day overdue";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days <= 7) return "Due in " + days + " days";
  return "Due " + new Date(dueOn + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export function MyTasks({ items: initialItems, userId, filterLabel, showEveryone, canEdit = true, statuses = {} }: {
  items: TaskRow[];
  userId: string;
  filterLabel?: string;
  showEveryone?: boolean;
  canEdit?: boolean;
  /** Per list, where a ticked task goes and where a reopened one comes back to. */
  statuses?: Record<string, { done: string | null; open: string | null }>;
}) {
  const [items, setItems] = useState(initialItems);
  // Arriving from a dashboard number means asking a question about the squadron, not about yourself.
  // Defaulting to Mine answered it with your own work - usually none of it - so the five overdue tasks
  // that were counted a moment ago showed as an empty page that looked like My tasks.
  const [tab, setTab] = useState<Tab>(filterLabel || showEveryone ? "everyone" : "mine");
  const [search, setSearch] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [people, setPeople] = useState<Array<{ userId: string; fullName: string }>>([]);
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // The last task ticked, offered back for a few seconds: a mis-tap on a phone must cost nothing.
  const [undo, setUndo] = useState<{ item: TaskRow; previous: string | null } | null>(null);
  const undoTimer = useRef(0);

  // Only fetched when there is something to assign, so the ordinary case costs nothing.
  useEffect(() => {
    if (!picked.length || people.length) return;
    fetch("/api/directory")
      .then((response) => response.json() as Promise<{ people?: Array<{ userId: string | null; fullName: string }> }>)
      .then((data) => setPeople((data.people ?? []).filter((entry): entry is { userId: string; fullName: string } => Boolean(entry.userId))))
      .catch(() => undefined);
  }, [picked.length, people.length]);

  useEffect(() => () => window.clearTimeout(undoTimer.current), []);

  function toggle(id: string) {
    setPicked((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  }

  function stopSelecting() {
    setSelecting(false);
    setPicked([]);
    setOwner("");
  }

  async function setStatus(itemId: string, statusId: string): Promise<boolean> {
    const response = await fetch("/api/work/items/" + encodeURIComponent(itemId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusId })
    });
    return response.ok;
  }

  async function finish(item: TaskRow) {
    const target = statuses[item.listId]?.done;
    if (!target) {
      setNote("This list has no finished section yet. Open the task to change its status.");
      return;
    }
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, closed: true } : entry)));
    const saved = await setStatus(item.id, target).catch(() => false);
    if (!saved) {
      setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, closed: false } : entry)));
      setNote("That could not be marked done. Check your connection and try again.");
      return;
    }
    window.clearTimeout(undoTimer.current);
    setUndo({ item, previous: statuses[item.listId]?.open ?? null });
    undoTimer.current = window.setTimeout(() => setUndo(null), 8000);
  }

  async function reopen() {
    if (!undo?.previous) { setUndo(null); return; }
    const { item, previous } = undo;
    setUndo(null);
    const saved = await setStatus(item.id, previous).catch(() => false);
    if (saved) setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, closed: false } : entry)));
    else setNote("That could not be reopened. Open the task to change its status.");
  }

  async function assign() {
    if (!picked.length || !owner) return;
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/work/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: picked, userId: owner })
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message || "Those could not be assigned.");
      const person = people.find((entry) => entry.userId === owner);
      setItems((current) => current.map((item) => (picked.includes(item.id)
        ? { ...item, assigneeIds: [owner], assignees: person ? [person.fullName] : item.assignees }
        : item)));
      stopSelecting();
      setNote(data.message ?? "Done.");
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "Those could not be assigned.");
    } finally {
      setBusy(false);
    }
  }

  const open = useMemo(() => items.filter((item) => !item.closed), [items]);
  const mineCount = useMemo(() => open.filter((item) => item.assigneeIds.includes(userId)).length, [open, userId]);
  const nobodyCount = useMemo(() => open.filter((item) => !item.assigneeIds.length).length, [open]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return open
      .filter((item) => (tab === "mine" ? item.assigneeIds.includes(userId) : tab === "unassigned" ? !item.assigneeIds.length : true))
      .filter((item) => !needle || item.title.toLowerCase().includes(needle) || item.listName.toLowerCase().includes(needle))
      .sort((left, right) => {
        if (!left.dueOn) return 1;
        if (!right.dueOn) return -1;
        return left.dueOn.localeCompare(right.dueOn);
      });
  }, [open, tab, search, userId]);

  const groups: Array<{ key: string; label: string; rows: TaskRow[] }> = [
    { key: "late", label: "Overdue", rows: shown.filter((item) => item.dueOn && dayDiff(item.dueOn) < 0) },
    { key: "week", label: "Due this week", rows: shown.filter((item) => item.dueOn && dayDiff(item.dueOn) >= 0 && dayDiff(item.dueOn) <= 7) },
    { key: "later", label: "Later", rows: shown.filter((item) => item.dueOn && dayDiff(item.dueOn) > 7) },
    { key: "none", label: "No due date", rows: shown.filter((item) => !item.dueOn) }
  ].filter((group) => group.rows.length);

  return (
    <section className="mt">
      <style>{mtCss}</style>

      {filterLabel ? (
        // Arriving from a dashboard number, on everybody's work rather than only your own - so say so,
        // and make going back to your own list one press.
        <p className="mt-filter">
          Showing everything <strong>{filterLabel}</strong>. <Link href="/tasks">Back to My Work</Link>
        </p>
      ) : null}

      <div className="mt-toolbar">
        <div className="mt-tabs" role="tablist" aria-label="Whose work">
          {TABS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={tab === entry.key}
              className={"mt-tab" + (tab === entry.key ? " is-on" : "")}
              onClick={() => setTab(entry.key)}
            >
              {entry.label}
              <span className="mt-n">{entry.key === "mine" ? mineCount : entry.key === "unassigned" ? nobodyCount : open.length}</span>
            </button>
          ))}
        </div>
        <label className="mt-search">
          <Search size={16} aria-hidden="true" />
          <input
            value={search}
            placeholder="Search tasks or lists"
            aria-label="Search tasks"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {canEdit ? (
          <button type="button" className={"mt-select" + (selecting ? " is-on" : "")} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
            {selecting ? <><X size={16} aria-hidden="true" /> Done selecting</> : <><Users size={16} aria-hidden="true" /> Select to assign</>}
          </button>
        ) : null}
      </div>

      {selecting && canEdit ? (
        <div className="mt-bar" role="region" aria-label="Assign selected tasks">
          <strong>{picked.length ? picked.length + " selected" : "Tick the tasks to hand to somebody"}</strong>
          {picked.length ? (
            <>
              <select value={owner} onChange={(event) => setOwner(event.target.value)} aria-label="Give these to">
                <option value="">Give these to…</option>
                {people.map((person) => <option key={person.userId} value={person.userId}>{person.fullName}</option>)}
              </select>
              <button type="button" className="mt-go" disabled={!owner || busy} onClick={assign}>{busy ? "Assigning…" : "Assign"}</button>
              <button type="button" className="mt-clear" onClick={() => setPicked([])}>Clear</button>
            </>
          ) : null}
        </div>
      ) : null}

      {note ? <p className="mt-note" role="status">{note} <button type="button" onClick={() => setNote(null)} aria-label="Dismiss">✕</button></p> : null}

      {groups.length ? (
        groups.map((group) => (
          <div key={group.key} className={"mt-group mt-group--" + group.key}>
            <h2>{group.label} <span className="mt-n">{group.rows.length}</span></h2>
            <ul>
              {group.rows.map((item) => {
                const late = Boolean(item.dueOn && dayDiff(item.dueOn) < 0);
                return (
                  <li key={item.id} className={picked.includes(item.id) ? "is-picked" : ""}>
                    {selecting ? (
                      <input
                        type="checkbox"
                        className="mt-pick"
                        checked={picked.includes(item.id)}
                        aria-label={"Select " + item.title}
                        onChange={() => toggle(item.id)}
                      />
                    ) : (
                      <button
                        type="button"
                        className="mt-done"
                        disabled={!canEdit}
                        onClick={() => finish(item)}
                        aria-label={"Mark done: " + item.title}
                        title={canEdit ? "Mark done" : "You can read this but not change it"}
                      >
                        <span className="mt-ring" aria-hidden="true"><Check size={12} /></span>
                      </button>
                    )}
                    <Link className="mt-open" href={"/lists/" + item.listId + "?item=" + item.id}>
                      <span className="mt-title">{item.title}</span>
                      <span className="mt-meta">
                        <span className={"mt-when" + (late ? " is-late" : "")}>{whenLabel(item.dueOn)}</span>
                        <span className="mt-list">{item.listName}</span>
                      </span>
                    </Link>
                    {/* Who it belongs to and how urgent it is, changed here rather than by opening it. */}
                    <span className="mt-controls">
                      <InlinePriority
                        itemId={item.id}
                        title={item.title}
                        priority={(item.priority as ItemPriority | null) ?? null}
                        canEdit={canEdit}
                        onSaved={(priority) => setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, priority } : entry)))}
                      />
                      <InlineAssignee
                        itemId={item.id}
                        title={item.title}
                        assignees={item.assigneeIds.map((id, index) => ({ id, fullName: item.assignees[index] ?? "Member" }))}
                        canEdit={canEdit}
                        onSaved={(assignees) => setItems((current) => current.map((entry) => (entry.id === item.id
                          ? { ...entry, assigneeIds: assignees.map((person) => person.id), assignees: assignees.map((person) => person.fullName) }
                          : entry)))}
                      />
                      <Link className="mt-go-open" href={"/lists/" + item.listId + "?item=" + item.id} aria-label={"Open " + item.title} tabIndex={-1}>
                        <ChevronRight size={18} aria-hidden="true" />
                      </Link>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      ) : (
        <div className="mt-empty">
          <span className="mt-empty-icon" aria-hidden="true"><Check size={26} /></span>
          <strong>
            {tab === "mine" ? "Nothing assigned to you" : tab === "unassigned" ? "Everything open has an owner" : "No open work matches that"}
          </strong>
          <span>
            {tab === "mine" && open.length > 0
              ? "There are " + open.length + " open items across the squadron. Look under Everyone, or No owner to see what still needs somebody."
              : search ? "Try a shorter search." : "You're all caught up."}
          </span>
        </div>
      )}

      {undo ? (
        <div className="mt-toast" role="status">
          <span><Check size={16} aria-hidden="true" /> Marked done: <strong>{undo.item.title}</strong></span>
          {undo.previous ? <button type="button" onClick={reopen}>Undo</button> : null}
        </div>
      ) : null}
    </section>
  );
}

const mtCss = inlinePickerCss + String.raw`
.mt{display:grid;gap:16px;min-width:0}
.mt-filter{margin:0;padding:12px 16px;border-radius:12px;font-size:14px;background:var(--cu-active);color:var(--text)}
.mt-filter a{color:var(--accent);font-weight:650;margin-left:4px}
.mt-toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px;border:1px solid var(--border);border-radius:16px;background:var(--surface);box-shadow:var(--shadow)}
.mt-tabs{display:flex;gap:4px;padding:4px;border-radius:12px;background:var(--surface-alt);border:1px solid var(--border-soft)}
.mt-tab{display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 14px;border:0;border-radius:9px;background:none;color:var(--muted-strong);font:inherit;font-size:14px;font-weight:650;cursor:pointer}
.mt-tab:hover{color:var(--text)}
.mt-tab.is-on{background:var(--surface);color:var(--text);box-shadow:0 1px 3px rgba(15,27,51,.12)}
.mt-n{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:999px;font-size:12px;font-weight:700;background:var(--surface-high);color:var(--muted-strong)}
.mt-tab.is-on .mt-n{background:#2563eb;color:#fff}
.mt-search{flex:1 1 240px;display:flex;align-items:center;gap:8px;min-height:44px;padding:0 12px;border:1px solid var(--border);border-radius:11px;background:var(--surface);color:var(--muted)}
.mt-search:focus-within{border-color:#2563eb;outline:3px solid rgba(37,99,235,.18)}
.mt .mt-search input{flex:1;min-width:0;min-height:0;border:0;padding:0;background:none;outline:none;font:inherit;font-size:14px;color:var(--text)}
.mt-select{display:inline-flex;align-items:center;gap:7px;min-height:44px;padding:0 14px;border:1px solid var(--border);border-radius:11px;background:var(--surface);color:var(--text);font:inherit;font-size:14px;font-weight:650;cursor:pointer}
.mt-select:hover{border-color:#b9cdf3}
.mt-select.is-on{background:var(--cu-active);border-color:#2563eb;color:var(--accent)}
.mt-bar{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 16px;border-radius:14px;background:#2563eb;color:#fff;box-shadow:0 8px 20px rgba(37,99,235,.25)}
.mt .mt-bar select{min-height:40px;border:0;border-radius:9px;padding:0 10px;font-size:14px;color:#0f1b33;background:#fff}
.mt-go{border:0;background:#fff;color:#1d4ed8;font:inherit;font-size:14px;font-weight:700;min-height:40px;padding:0 18px;border-radius:9px;cursor:pointer}
.mt-go:disabled{opacity:.6;cursor:default}
.mt-clear{border:1px solid rgba(255,255,255,.55);background:none;color:#fff;font:inherit;font-size:14px;font-weight:600;min-height:40px;padding:0 14px;border-radius:9px;cursor:pointer}
.mt-note{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0;padding:12px 16px;border-radius:12px;font-size:14px;background:#e6efff;color:#1e3a8a}
html[data-theme=dark] .mt-note{background:rgba(37,99,235,.2);color:#cfe0ff}
.mt-note button{border:0;background:none;color:inherit;font-size:14px;cursor:pointer}
.mt-group{display:grid;gap:8px}
.mt-group h2{display:flex;align-items:center;gap:8px;margin:6px 4px 0;font-size:13px;font-weight:750;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.mt-group--late h2{color:#c2273d}
html[data-theme=dark] .mt-group--late h2{color:#ff8a96}
.mt-group--late .mt-n{background:#fdecee;color:#b4232f}
html[data-theme=dark] .mt-group--late .mt-n{background:rgba(220,53,69,.2);color:#ff9aa4}
.mt-group ul{list-style:none;margin:0;padding:0;border:1px solid var(--border);border-radius:14px;background:var(--surface);box-shadow:var(--shadow)}
.mt-group li{display:flex;align-items:center;gap:4px;min-width:0;padding:4px 10px 4px 12px;position:relative}
.mt-group li + li{border-top:1px solid var(--border-soft)}
.mt-group li:first-child{border-radius:14px 14px 0 0}.mt-group li:last-child{border-radius:0 0 14px 14px}
.mt-group li:hover{background:var(--surface-alt)}
.mt-group li.is-picked{background:var(--cu-active)}
/* A small circle inside a larger, invisible button: easy to hit, quiet to look at. */
.mt-done{flex:none;display:grid;place-items:center;width:34px;height:34px;margin:0;padding:0;border:0;border-radius:50%;background:none;cursor:pointer}
.mt-ring{display:grid;place-items:center;width:20px;height:20px;border:2px solid #b8c4d6;border-radius:50%;background:var(--surface);color:transparent;transition:all .15s ease}
.mt-done:hover:not(:disabled) .mt-ring,.mt-done:focus-visible .mt-ring{border-color:#16a34a;color:#16a34a;background:#e6f7ec}
.mt-group--late .mt-ring{border-color:#e7a1aa}
.mt-done:disabled{cursor:not-allowed;opacity:.5}
.mt .mt-pick{flex:none;width:22px;height:22px;margin:0 8px 0 4px;accent-color:#2563eb}
.mt-open{flex:1;min-width:0;display:grid;gap:4px;padding:12px 8px;color:var(--text);text-decoration:none}
.mt-title{font-size:15px;font-weight:620;line-height:1.4;overflow-wrap:anywhere}
.mt-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;color:var(--muted)}
.mt-when{font-weight:650;color:var(--muted-strong)}
.mt-when.is-late{color:#c2273d}
html[data-theme=dark] .mt-when.is-late{color:#ff8a96}
.mt-list::before{content:"·";margin-right:8px;color:var(--muted)}
.mt-controls{flex:none;display:flex;align-items:center;gap:6px}
.mt-go-open{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;color:var(--muted)}
.mt-go-open:hover{background:var(--surface-high);color:var(--text)}
.mt-empty{display:grid;justify-items:center;gap:8px;padding:40px 20px;border:1px dashed var(--border);border-radius:16px;background:var(--surface);text-align:center}
.mt-empty-icon{display:grid;place-items:center;width:52px;height:52px;border-radius:50%;background:#e6f7ec;color:#16a34a}
html[data-theme=dark] .mt-empty-icon{background:rgba(22,163,74,.2);color:#6fdc98}
.mt-empty strong{font-size:17px;color:var(--text)}
.mt-empty span:last-child{font-size:14px;color:var(--muted);max-width:460px;line-height:1.5}
.mt-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:95;display:flex;align-items:center;gap:16px;max-width:calc(100vw - 32px);padding:12px 14px 12px 18px;border-radius:14px;background:#0f1b33;color:#fff;font-size:14px;box-shadow:0 14px 34px rgba(5,15,35,.35)}
.mt-toast span{display:flex;align-items:center;gap:8px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mt-toast strong{overflow:hidden;text-overflow:ellipsis}
.mt-toast button{flex:none;border:0;border-radius:9px;background:#2563eb;color:#fff;font:inherit;font-size:14px;font-weight:700;min-height:38px;padding:0 16px;cursor:pointer}
@media (max-width:900px){
  .mt-toolbar{padding:10px;gap:10px}
  .mt-tabs{flex:1 1 100%}
  .mt-tab{flex:1;justify-content:center;min-height:44px;padding:0 6px;gap:6px;white-space:nowrap;font-size:13.5px}
  .mt-select{flex:1 1 100%;justify-content:center}
  .mt-group li{flex-wrap:wrap;padding:6px 10px}
  .mt-done{width:38px;height:38px}
  .mt-ring{width:22px;height:22px}
  .mt-open{flex:1 1 calc(100% - 52px);padding:10px 4px}
  .mt-controls{flex:1 1 100%;justify-content:flex-end;padding:0 0 6px 46px}
  .mt-toast{bottom:calc(84px + env(safe-area-inset-bottom))}
}
`;
