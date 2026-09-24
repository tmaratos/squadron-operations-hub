"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { InlineAssignee, InlinePriority, inlinePickerCss } from "./inline-pickers";
import type { ItemPriority } from "@/lib/work/types";

// What you have to do, in the order you have to do it.
//
// The page this replaced read a table the squadron's work was never imported into, so it told everybody
// they had nothing to do while fifty things sat open. This reads the same work as everywhere else.

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
  { key: "unassigned", label: "Nobody's" },
  { key: "everyone", label: "Everyone's" }
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dayDiff(dueOn: string): number {
  return Math.round((new Date(dueOn + "T12:00:00").getTime() - new Date(today() + "T12:00:00").getTime()) / 86400000);
}

function whenLabel(dueOn: string | null): string {
  if (!dueOn) return "No date";
  const days = dayDiff(dueOn);
  if (days < -1) return Math.abs(days) + " days late";
  if (days === -1) return "1 day late";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days <= 7) return "In " + days + " days";
  return new Date(dueOn + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function MyTasks({ items: initialItems, userId }: { items: TaskRow[]; userId: string }) {
  const [items, setItems] = useState(initialItems);
  const [tab, setTab] = useState<Tab>("mine");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [people, setPeople] = useState<Array<{ userId: string; fullName: string }>>([]);
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Only fetched when there is something to assign, so the ordinary case costs nothing.
  useEffect(() => {
    if (!picked.length || people.length) return;
    fetch("/api/directory")
      .then((response) => response.json() as Promise<{ people?: Array<{ userId: string | null; fullName: string }> }>)
      .then((data) => setPeople((data.people ?? []).filter((entry): entry is { userId: string; fullName: string } => Boolean(entry.userId))))
      .catch(() => undefined);
  }, [picked.length, people.length]);

  function toggle(id: string) {
    setPicked((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
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
      setPicked([]);
      setOwner("");
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

  const groups: Array<{ label: string; rows: TaskRow[] }> = [
    { label: "Late", rows: shown.filter((item) => item.dueOn && dayDiff(item.dueOn) < 0) },
    { label: "This week", rows: shown.filter((item) => item.dueOn && dayDiff(item.dueOn) >= 0 && dayDiff(item.dueOn) <= 7) },
    { label: "Later", rows: shown.filter((item) => item.dueOn && dayDiff(item.dueOn) > 7) },
    { label: "No date", rows: shown.filter((item) => !item.dueOn) }
  ].filter((group) => group.rows.length);

  return (
    <section className="mt">
      <style>{mtCss}</style>

      <div className="mt-tabs" role="tablist">
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
        <input
          className="mt-search"
          value={search}
          placeholder="Search these…"
          aria-label="Search tasks"
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {picked.length ? (
        <div className="mt-bar">
          <strong>{picked.length} selected</strong>
          <select value={owner} onChange={(event) => setOwner(event.target.value)} aria-label="Give these to">
            <option value="">Give these to…</option>
            {people.map((person) => <option key={person.userId} value={person.userId}>{person.fullName}</option>)}
          </select>
          <button type="button" className="mt-go" disabled={!owner || busy} onClick={assign}>{busy ? "Assigning…" : "Assign"}</button>
          <button type="button" className="mt-clear" onClick={() => setPicked([])}>Clear</button>
        </div>
      ) : null}

      {note ? <p className="mt-note" role="status">{note}</p> : null}

      {groups.length ? (
        groups.map((group) => (
          <div key={group.label} className="mt-group">
            <h2>{group.label} <span className="mt-n">{group.rows.length}</span></h2>
            <ul>
              {group.rows.map((item) => (
                <li key={item.id} className={picked.includes(item.id) ? "is-picked" : ""}>
                  <input
                    type="checkbox"
                    className="mt-pick"
                    checked={picked.includes(item.id)}
                    aria-label={"Select " + item.title}
                    onChange={() => toggle(item.id)}
                  />
                  <Link href={"/lists/" + item.listId + "?item=" + item.id}>
                    <span className="mt-title">{item.title}</span>
                    <span className="mt-meta">
                      <span className={"mt-when" + (item.dueOn && dayDiff(item.dueOn) < 0 ? " is-late" : "")}>{whenLabel(item.dueOn)}</span>
                      <span className="mt-list">{item.listName}</span>
                    </span>
                  </Link>
                  {/* Who it belongs to and how urgent it is, changed here rather than by opening it. */}
                  <span className="mt-controls">
                    <InlinePriority
                      itemId={item.id}
                      title={item.title}
                      priority={(item.priority as ItemPriority | null) ?? null}
                      canEdit
                      onSaved={(priority) => setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, priority } : entry)))}
                    />
                    <InlineAssignee
                      itemId={item.id}
                      title={item.title}
                      assignees={item.assigneeIds.map((id, index) => ({ id, fullName: item.assignees[index] ?? "Member" }))}
                      canEdit
                      onSaved={(assignees) => setItems((current) => current.map((entry) => (entry.id === item.id
                        ? { ...entry, assigneeIds: assignees.map((person) => person.id), assignees: assignees.map((person) => person.fullName) }
                        : entry)))}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))
      ) : (
        <p className="mt-empty">
          {tab === "mine"
            ? mineCount === 0 && open.length > 0
              ? "Nothing is assigned to you. There are " + open.length + " open items across the squadron — try Everyone's, or Nobody's to see what still needs an owner."
              : "Nothing assigned to you."
            : tab === "unassigned"
              ? "Everything open has an owner."
              : "No open work matches that."}
        </p>
      )}
    </section>
  );
}

const mtCss = [
  inlinePickerCss,
  ".mt-controls{display:flex;align-items:center;gap:6px;flex:none}",
  ".mt{display:grid;gap:16px}",
  ".mt-tabs{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
  ".mt-tab{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--cu-border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:14px;font-weight:600;padding:8px 14px;border-radius:999px;cursor:pointer}",
  ".mt-tab.is-on{background:#7b68ee;border-color:#7b68ee;color:#fff}",
  ".mt-n{font-size:11.5px;font-weight:700;padding:1px 7px;border-radius:999px;background:rgba(0,0,0,.09)}",
  ".mt-tab.is-on .mt-n{background:rgba(255,255,255,.22)}",
  "html[data-theme=dark] .mt-n{background:rgba(255,255,255,.12)}",
  ".mt-search{margin-left:auto;flex:1 1 220px;max-width:340px;font:inherit;font-size:14px;min-height:38px;padding:0 12px;border:1px solid var(--cu-border,#d5d8de);border-radius:9px}",
  ".mt-group h2{margin:0 0 8px;font-size:14px;letter-spacing:.02em;text-transform:uppercase;color:var(--cu-muted,#656f7d);display:flex;align-items:center;gap:8px}",
  ".mt-group ul{list-style:none;margin:0;padding:0;border:1px solid var(--cu-border,#e4e6eb);border-radius:12px;overflow:hidden;background:var(--cu-bg,#fff)}",
  "html[data-theme=dark] .mt-group ul{background:#222326;border-color:#3a3d44}",
  ".mt-group li{display:flex;align-items:center;gap:0;position:relative;overflow:visible;padding-right:8px}",
  ".mt-group li + li{border-top:1px solid var(--cu-border,#eef0f3)}",
  ".mt-group li.is-picked{background:rgba(123,104,238,.1)}",
  ".mt-pick{flex:0 0 auto;width:17px;height:17px;margin:0 0 0 14px;accent-color:#7b68ee}",
  ".mt-bar{position:sticky;top:8px;z-index:5;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:11px 14px;border-radius:11px;background:#7b68ee;color:#fff}",
  ".mt-bar select{font:inherit;font-size:13.5px;min-height:34px;border-radius:8px;padding:0 8px;border:0}",
  ".mt-go{border:0;background:#fff;color:#4b3fd0;font:inherit;font-size:13.5px;font-weight:700;padding:8px 16px;border-radius:8px;cursor:pointer}",
  ".mt-go:disabled{opacity:.6;cursor:default}",
  ".mt-clear{border:1px solid rgba(255,255,255,.5);background:none;color:#fff;font:inherit;font-size:13.5px;font-weight:600;padding:7px 13px;border-radius:8px;cursor:pointer}",
  ".mt-note{margin:0;font-size:13px;padding:10px 13px;border-radius:9px;background:rgba(12,163,12,.12)}",
  "html[data-theme=dark] .mt-group li + li{border-color:#33363c}",
  ".mt-group a{flex:1;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:13px 16px;text-decoration:none;color:inherit;flex-wrap:wrap}",
  ".mt-group a:hover{background:rgba(123,104,238,.07)}",
  ".mt-title{font-size:14.5px;line-height:1.45;min-width:0;flex:1}",
  ".mt-meta{display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-size:12.5px;color:var(--cu-muted,#656f7d)}",
  ".mt-when{font-weight:600}.mt-when.is-late{color:#d03b3b}",
  ".mt-list{opacity:.85}",
  ".mt-who{padding:2px 9px;border-radius:999px;background:rgba(123,104,238,.13);font-weight:600}",
  ".mt-empty{margin:0;padding:22px;border:1px solid var(--cu-border,#e4e6eb);border-radius:12px;font-size:14px;line-height:1.6;color:var(--cu-muted,#656f7d)}",
  "@media (max-width:760px){.mt-search{margin-left:0;max-width:none}.mt-group a{align-items:flex-start;flex-direction:column;gap:6px}}"
].join("");
