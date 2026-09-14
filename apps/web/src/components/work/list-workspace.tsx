"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ItemDetail, ItemPriority, ListDetail, ListStatus, WorkItem } from "@/lib/work/types";

type Person = { id: string; fullName: string };
type Mode = "list" | "board";

const PRIORITIES: ItemPriority[] = ["URGENT", "HIGH", "NORMAL", "LOW"];
const PRIORITY_COLOR: Record<ItemPriority, string> = { URGENT: "#e5484d", HIGH: "#f76808", NORMAL: "#5f55ee", LOW: "#87909e" };

async function send(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed.");
  return data;
}

function formatDue(value: string | null): { text: string; late: boolean } {
  if (!value) return { text: "", late: false };
  const today = new Date().toISOString().slice(0, 10);
  const date = new Date(value + "T12:00:00");
  return { text: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }), late: value < today };
}

export function ListWorkspace({ list, initialItems, people, canEdit }: { list: ListDetail; initialItems: WorkItem[]; people: Person[]; canEdit: boolean }) {
  const [items, setItems] = useState<WorkItem[]>(initialItems);
  const [mode, setMode] = useState<Mode>("list");
  const [search, setSearch] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const statusById = useMemo(() => new Map(list.statuses.map((status) => [status.id, status])), [list.statuses]);
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
      setError(caught instanceof Error ? caught.message : "Could not add the item.");
    }
  }

  async function patch(itemId: string, body: Record<string, unknown>) {
    setError("");
    try {
      const data = await send("/api/work/items/" + itemId, "PATCH", body);
      await reload();
      return data.item as ItemDetail;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
      return null;
    }
  }

  function renderRow(item: WorkItem, depth: number): ReactNode {
    const kids = (childrenOf.get(item.id) ?? []).filter(matches);
    const status = item.statusId ? statusById.get(item.statusId) : undefined;
    const due = formatDue(item.dueOn);
    return (
      <div key={item.id}>
        <div className="lw-row" style={{ paddingLeft: 12 + depth * 22 }}>
          <button className="lw-caret" aria-label="Show sub-items" onClick={() => setExpanded({ ...expanded, [item.id]: !expanded[item.id] })} style={{ visibility: item.childCount ? "visible" : "hidden" }}>
            {expanded[item.id] ? "▾" : "▸"}
          </button>
          <span className="lw-status-dot" style={{ background: status?.color ?? "#87909e" }} title={status?.name} />
          <button className="lw-title" onClick={() => setOpenId(item.id)}>{item.title}</button>
          <span className="lw-meta">
            {item.childCount ? <span className="lw-pill">{item.childCount} sub</span> : null}
            {item.checklistTotal ? <span className="lw-pill">☑ {item.checklistDone}/{item.checklistTotal}</span> : null}
            {item.tags.slice(0, 3).map((tag) => <span key={tag.id} className={"work-tag work-tag--" + tag.color}>{tag.label}</span>)}
            {item.tags.length > 3 ? <span className="lw-pill">+{item.tags.length - 3}</span> : null}
          </span>
          <span className="lw-col lw-assignee">{item.assignees.map((person) => person.fullName.split(" ")[0]).join(", ")}</span>
          <span className={"lw-col lw-due" + (due.late && !isClosed(item) ? " lw-late" : "")}>{due.text}</span>
          <span className="lw-col lw-priority">{item.priority ? <span style={{ color: PRIORITY_COLOR[item.priority] }}>⚑ {item.priority.toLowerCase()}</span> : null}</span>
        </div>
        {expanded[item.id] ? kids.map((kid) => renderRow(kid, depth + 1)) : null}
      </div>
    );
  }

  const visibleStatuses = list.statuses.filter((status) => showClosed || (status.category !== "DONE" && status.category !== "CLOSED"));
  const unassignedStatus = topLevel.filter((item) => matches(item) && (!item.statusId || !statusById.has(item.statusId)));

  return (
    <div className="lw">
      <style>{lwCss}</style>
      <header className="lw-head">
        <div>
          <h1>{list.name}</h1>
          {list.description ? <p>{list.description}</p> : null}
        </div>
      </header>
      <div className="lw-toolbar">
        <div className="lw-tabs" role="tablist">
          {(["list", "board"] as Mode[]).map((value) => (
            <button key={value} role="tab" aria-selected={mode === value} className={mode === value ? "is-active" : ""} onClick={() => setMode(value)}>
              {value === "list" ? "☰ List" : "▦ Board"}
            </button>
          ))}
        </div>
        <input className="lw-search" placeholder="Search items or tags" value={search} onChange={(event) => setSearch(event.target.value)} />
        <label className="lw-check"><input type="checkbox" checked={showClosed} onChange={(event) => setShowClosed(event.target.checked)} /> Show closed</label>
        <span className="lw-total">{items.filter((item) => !isClosed(item)).length} open · {items.length} total</span>
      </div>
      {error ? <p className="lw-error" role="alert">{error}</p> : null}

      {mode === "list" ? (
        <div className="lw-groups">
          {visibleStatuses.map((status) => {
            const rows = topLevel.filter((item) => item.statusId === status.id && matches(item));
            return (
              <section key={status.id} className="lw-group">
                <h2><span className="lw-badge" style={{ background: status.color }}>{status.name}</span><span className="lw-n">{rows.length}</span></h2>
                {rows.map((item) => renderRow(item, 0))}
                {canEdit ? <QuickAdd onAdd={(title) => quickAdd(title, status.id)} /> : null}
              </section>
            );
          })}
          {unassignedStatus.length ? (
            <section className="lw-group">
              <h2><span className="lw-badge" style={{ background: "#87909e" }}>no status</span><span className="lw-n">{unassignedStatus.length}</span></h2>
              {unassignedStatus.map((item) => renderRow(item, 0))}
            </section>
          ) : null}
        </div>
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
                <h2><span className="lw-badge" style={{ background: status.color }}>{status.name}</span><span className="lw-n">{cards.length}</span></h2>
                {cards.map((item) => {
                  const due = formatDue(item.dueOn);
                  return (
                    <article key={item.id} className="lw-card" draggable={canEdit} onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)} onClick={() => setOpenId(item.id)}>
                      <strong>{item.title}</strong>
                      <div className="lw-meta">
                        {item.tags.slice(0, 3).map((tag) => <span key={tag.id} className={"work-tag work-tag--" + tag.color}>{tag.label}</span>)}
                      </div>
                      <div className="lw-card-foot">
                        <span className={due.late ? "lw-late" : ""}>{due.text}</span>
                        {item.childCount ? <span>{item.childCount} sub</span> : null}
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
    </div>
  );
}

function QuickAdd({ onAdd, label = "+ Add item" }: { onAdd: (title: string) => Promise<unknown> | void; label?: string }) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  if (!open) return <button className="lw-add" onClick={() => setOpen(true)}>{label}</button>;
  return (
    <form className="lw-addform" onSubmit={async (event) => {
      event.preventDefault();
      await onAdd(value);
      setValue("");
    }}>
      <input autoFocus value={value} placeholder="Name, then Enter" onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }} />
      <button type="submit">Save</button>
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
    fetch("/api/work/items/" + itemId).then((response) => response.json()).then((data) => {
      if (active && data.item) adopt(data.item);
    });
    return () => {
      active = false;
    };
  }, [itemId]);

  async function save(body: Record<string, unknown>) {
    const next = await onPatch(itemId, body);
    if (next) adopt(next);
  }

  return (
    <div className="lw-overlay" onClick={onClose}>
      <aside className="lw-panel" onClick={(event) => event.stopPropagation()} aria-label="Item details">
        <div className="lw-panel-top">
          <span className="lw-crumbs">
            {item?.listName}
            {item?.ancestors.map((ancestor) => (
              <span key={ancestor.id}> / <button onClick={() => onOpen(ancestor.id)}>{ancestor.title}</button></span>
            ))}
          </span>
          <button className="lw-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {!item ? <p>Loading…</p> : (
          <div className="lw-panel-body">
            <input className="lw-panel-title" value={draft.title} disabled={!canEdit}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              onBlur={() => { if (draft.title.trim() && draft.title !== item.title) save({ title: draft.title }); }} />

            <div className="lw-fields">
              <label>Status
                <select value={item.statusId ?? ""} disabled={!canEdit} onChange={(event) => save({ statusId: event.target.value || null })}>
                  {statuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
                </select>
              </label>
              <label>Priority
                <select value={item.priority ?? ""} disabled={!canEdit} onChange={(event) => save({ priority: event.target.value || null })}>
                  <option value="">none</option>
                  {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority.toLowerCase()}</option>)}
                </select>
              </label>
              <label>Start
                <input type="date" value={item.startOn ?? ""} disabled={!canEdit} onChange={(event) => save({ startOn: event.target.value || null })} />
              </label>
              <label>Due
                <input type="date" value={item.dueOn ?? ""} disabled={!canEdit} onChange={(event) => save({ dueOn: event.target.value || null })} />
              </label>
              <label className="lw-wide">Assignees
                <select multiple value={item.assignees.map((person) => person.id)} disabled={!canEdit}
                  onChange={(event) => save({ assigneeIds: Array.from(event.target.selectedOptions).map((option) => option.value) })}>
                  {people.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
                </select>
              </label>
              <label className="lw-wide">Tags (comma separated)
                <input value={draft.tags} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
                  onBlur={() => save({ tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean) })} />
              </label>
            </div>

            <label className="lw-desc">Description
              <textarea rows={12} value={draft.description} disabled={!canEdit}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                onBlur={() => { if (draft.description !== (item.description ?? "")) save({ description: draft.description }); }} />
            </label>

            <section className="lw-section">
              <h3>Sub-items <span className="lw-n">{item.children.length}</span></h3>
              {item.children.map((child) => {
                const status = statuses.find((entry) => entry.id === child.statusId);
                return (
                  <button key={child.id} className="lw-subitem" onClick={() => onOpen(child.id)}>
                    <span className="lw-status-dot" style={{ background: status?.color ?? "#87909e" }} /> {child.title}
                  </button>
                );
              })}
              {canEdit ? <QuickAdd label="+ Add sub-item" onAdd={async (title) => {
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
                  {canEdit ? <QuickAdd label="+ Add entry" onAdd={(label) => save({ checklistEntry: { checklistId: checklist.id, label } })} /> : null}
                </div>
              ))}
              {canEdit ? <QuickAdd label="+ New checklist" onAdd={(name) => save({ checklist: { name } })} /> : null}
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
                  <div className="lw-comment-head"><strong>{entry.authorName}</strong> <span>{new Date(entry.createdAt).toLocaleString()}</span></div>
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
                  <input value={comment} placeholder="Write a comment" onChange={(event) => setComment(event.target.value)} />
                  <button type="submit">Comment</button>
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
  ".lw{display:flex;flex-direction:column;gap:12px}",
  ".lw-head h1{margin:0;font-size:22px}.lw-head p{margin:4px 0 0;opacity:.7;font-size:13px}",
  ".lw-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;border-bottom:1px solid var(--border,#e4e6eb);padding-bottom:10px}",
  ".lw-tabs{display:flex;gap:4px}.lw-tabs button{border:0;background:transparent;color:inherit;padding:6px 10px;border-radius:6px;cursor:pointer;font:inherit}",
  ".lw-tabs button.is-active{background:rgba(123,104,238,.16);color:#7b68ee;font-weight:600}",
  ".lw-search{flex:1;min-width:160px;max-width:320px}",
  ".lw-check{display:flex;gap:6px;align-items:center;font-size:13px}.lw-total{font-size:12px;opacity:.65;margin-left:auto}",
  ".lw-error{color:#e5484d;margin:0}",
  ".lw-groups{display:flex;flex-direction:column;gap:18px}",
  ".lw-group h2,.lw-column h2{display:flex;align-items:center;gap:8px;font-size:13px;margin:0 0 6px}",
  ".lw-badge{color:#fff;text-transform:uppercase;font-size:11px;font-weight:700;padding:3px 8px;border-radius:4px;letter-spacing:.03em}",
  ".lw-n{font-size:12px;opacity:.6;font-weight:400}",
  ".lw-row{display:grid;grid-template-columns:18px 10px minmax(0,max-content) minmax(0,1fr) 120px 70px 80px;align-items:center;gap:8px;border-top:1px solid var(--border,#e4e6eb);padding-top:7px;padding-bottom:7px;padding-right:12px}",
  ".lw-row:hover{background:rgba(123,104,238,.06)}",
  ".lw-caret{border:0;background:none;color:inherit;cursor:pointer;padding:0;font-size:12px}",
  ".lw-status-dot{display:inline-block;width:10px;height:10px;border-radius:3px;flex:none}",
  ".lw-title{border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;padding:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}",
  ".lw-title:hover{color:#7b68ee}",
  ".lw-meta{display:flex;gap:4px;flex-wrap:wrap;overflow:hidden;min-width:0}",
  ".lw-pill{font-size:11px;padding:1px 6px;border-radius:10px;background:rgba(135,144,158,.18)}",
  ".lw-col{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".lw-late{color:#e5484d}",
  ".lw-add{border:0;background:none;color:inherit;opacity:.6;cursor:pointer;padding:6px 12px;text-align:left;font:inherit;font-size:13px}",
  ".lw-add:hover{opacity:1;color:#7b68ee}",
  ".lw-addform{display:flex;gap:6px;padding:6px 12px}.lw-addform input{flex:1}",
  ".lw-board{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;align-items:flex-start}",
  ".lw-column{flex:0 0 280px;background:rgba(135,144,158,.08);border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:8px}",
  ".lw-card{background:var(--surface,#fff);border:1px solid var(--border,#e4e6eb);border-radius:8px;padding:10px;cursor:pointer;display:flex;flex-direction:column;gap:6px;font-size:13px}",
  ".lw-card:hover{border-color:#7b68ee}",
  ".lw-card-foot{display:flex;gap:10px;font-size:12px;opacity:.75}",
  ".lw-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:60;display:flex;justify-content:flex-end}",
  ".lw-panel{width:min(760px,100%);height:100%;overflow-y:auto;background:var(--surface,#fff);color:inherit;box-shadow:-8px 0 24px rgba(0,0,0,.25);padding:16px 20px}",
  "html[data-theme=dark] .lw-panel,html[data-theme=dark] .lw-card{background:#222326;border-color:#34363b;color:#e8e9ea}",
  ".lw-panel-top{display:flex;justify-content:space-between;gap:12px;font-size:12px;opacity:.8}",
  ".lw-crumbs button{border:0;background:none;color:#7b68ee;cursor:pointer;font:inherit;padding:0}",
  ".lw-close{border:0;background:none;color:inherit;font-size:18px;cursor:pointer}",
  ".lw-panel-body{display:flex;flex-direction:column;gap:14px;margin-top:8px}",
  ".lw-panel-title{font-size:22px;font-weight:700;border:1px solid transparent;background:transparent;color:inherit;padding:4px 6px;width:100%}",
  ".lw-panel-title:hover,.lw-panel-title:focus{border-color:var(--border,#e4e6eb)}",
  ".lw-fields{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}",
  ".lw-fields label,.lw-desc{display:flex;flex-direction:column;gap:4px;font-size:12px}",
  ".lw-wide{grid-column:1/-1}",
  ".lw-desc textarea{font:inherit;font-size:13px;line-height:1.5;white-space:pre-wrap}",
  ".lw-section h3{font-size:14px;margin:0 0 6px}",
  ".lw-subitem{display:flex;gap:8px;align-items:center;width:100%;border:0;border-top:1px solid var(--border,#e4e6eb);background:none;color:inherit;font:inherit;padding:7px 4px;cursor:pointer;text-align:left}",
  ".lw-checklist{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}",
  ".lw-entry{display:flex;gap:8px;align-items:flex-start;font-size:13px}.lw-done{text-decoration:line-through;opacity:.6}",
  ".lw-comment{border-top:1px solid var(--border,#e4e6eb);padding:8px 0;font-size:13px}",
  ".lw-comment-head span{opacity:.6;font-size:12px}.lw-comment-body{white-space:pre-wrap;margin-top:4px}",
  "@media (max-width:700px){.lw-row{grid-template-columns:18px 10px minmax(0,1fr) 60px}.lw-meta,.lw-assignee,.lw-priority{display:none}}"
].join("");
