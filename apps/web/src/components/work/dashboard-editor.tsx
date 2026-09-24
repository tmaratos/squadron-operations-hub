"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DashboardWidget, WidgetType } from "@/lib/work/types";
import { ConfirmButton } from "@/components/confirm-button";

type Filters = NonNullable<DashboardWidget["config"]["filters"]>;

const TYPE_LABELS: Record<WidgetType, string> = {
  count: "Number tile",
  item_list: "Task list",
  status_breakdown: "Work by status",
  assignee_workload: "Workload by person",
  tag_breakdown: "Work by tag",
  text: "Note"
};

const DUE_LABELS: Record<string, string> = { "": "Any date", overdue: "Overdue", today: "Due today", next7: "Due in 7 days", next14: "Due in 14 days", none: "No due date" };
const TONE_LABELS: Record<string, string> = { accent: "Purple", danger: "Red", warning: "Amber", info: "Blue", success: "Green" };

interface Draft {
  id: string | null;
  type: WidgetType;
  title: string;
  due: string;
  statusName: string;
  tag: string;
  listId: string;
  includeClosed: boolean;
  tone: string;
  limit: number;
  text: string;
}

function toDraft(widget: DashboardWidget): Draft {
  const filters: Filters = widget.config.filters ?? {};
  return {
    id: widget.id,
    type: widget.type,
    title: widget.title,
    due: filters.due ?? "",
    statusName: filters.statusName ?? "",
    tag: filters.tags?.[0] ?? "",
    listId: widget.config.listIds?.[0] ?? "",
    includeClosed: Boolean(filters.includeClosed),
    tone: widget.config.tone ?? "accent",
    limit: widget.config.limit ?? 10,
    text: widget.config.text ?? ""
  };
}

const EMPTY: Draft = { id: null, type: "count", title: "", due: "", statusName: "", tag: "", listId: "", includeClosed: false, tone: "accent", limit: 10, text: "" };

function toPayload(draft: Draft) {
  const filters: Filters = {};
  if (draft.due) filters.due = draft.due as Filters["due"];
  if (draft.statusName) filters.statusName = draft.statusName;
  if (draft.tag) filters.tags = [draft.tag];
  if (draft.includeClosed) filters.includeClosed = true;
  const config: DashboardWidget["config"] = {};
  if (draft.type !== "text") config.filters = filters;
  if (draft.listId && draft.type !== "text") config.listIds = [draft.listId];
  if (draft.type === "count") config.tone = draft.tone as DashboardWidget["config"]["tone"];
  if (draft.type === "item_list") {
    config.limit = draft.limit;
    config.sortBy = "due";
  }
  if (draft.type === "tag_breakdown") config.limit = 12;
  if (draft.type === "text") config.text = draft.text;
  return { type: draft.type, title: draft.title.trim() || TYPE_LABELS[draft.type], config };
}

export function DashboardEditor({ dashboardId, widgets, lists, tags, statusNames }: {
  dashboardId: string;
  widgets: DashboardWidget[];
  lists: Array<{ id: string; name: string }>;
  tags: string[];
  statusNames: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(body: unknown) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/work/dashboards/" + dashboardId + "/widgets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(data.message || "Could not save.");
      router.refresh();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= widgets.length) return;
    const ids = widgets.map((widget) => widget.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await send({ action: "reorder", widgetIds: ids });
  }

  async function saveDraft() {
    if (!draft) return;
    const widget = toPayload(draft);
    const ok = draft.id ? await send({ action: "update", widgetId: draft.id, widget }) : await send({ action: "create", widget });
    if (ok) setDraft(null);
  }

  const set = (change: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...change } : current));

  return (
    <>
      <button type="button" className="de-open" onClick={() => setOpen(true)}>✎ Customize</button>
      {open ? (
        <div className="de-overlay" onClick={() => { setOpen(false); setDraft(null); }}>
          <aside className="de-panel" onClick={(event) => event.stopPropagation()} aria-label="Customize dashboard">
            <style>{deCss}</style>
            <header className="de-head">
              <strong>{draft ? (draft.id ? "Edit card" : "New card") : "Customize dashboard"}</strong>
              <button type="button" className="de-icon" onClick={() => { setOpen(false); setDraft(null); }} aria-label="Close">✕</button>
            </header>
            {error ? <p className="de-error" role="alert">{error}</p> : null}

            {!draft ? (
              <>
                <p className="de-muted">Cards appear on the dashboard in this order. Changes save immediately for everyone.</p>
                <ul className="de-cards">
                  {widgets.map((widget, index) => (
                    <li key={widget.id} className="de-card">
                      <div className="de-card-main">
                        <strong>{widget.title}</strong>
                        <span className="de-muted">{TYPE_LABELS[widget.type] ?? widget.type}</span>
                      </div>
                      <button type="button" className="de-icon" disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label="Move up">↑</button>
                      <button type="button" className="de-icon" disabled={busy || index === widgets.length - 1} onClick={() => move(index, 1)} aria-label="Move down">↓</button>
                      <button type="button" className="de-icon" disabled={busy} onClick={() => setDraft(toDraft(widget))} aria-label="Edit card">✎</button>
                      <ConfirmButton className="de-icon de-danger" disabled={busy} ariaLabel="Remove card" question="Remove?" onConfirm={() => send({ action: "delete", widgetId: widget.id })}>✕</ConfirmButton>
                    </li>
                  ))}
                </ul>
                <button type="button" className="de-primary" disabled={busy} onClick={() => setDraft({ ...EMPTY })}>+ Add card</button>
              </>
            ) : (
              <form className="de-form" onSubmit={(event) => { event.preventDefault(); saveDraft(); }}>
                <label>Card type
                  <select value={draft.type} onChange={(event) => set({ type: event.target.value as WidgetType })}>
                    {(Object.keys(TYPE_LABELS) as WidgetType[]).map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}
                  </select>
                </label>
                <label>Title
                  <input value={draft.title} maxLength={80} placeholder={TYPE_LABELS[draft.type]} onChange={(event) => set({ title: event.target.value })} />
                </label>

                {draft.type === "text" ? (
                  <label>Note
                    <textarea rows={6} value={draft.text} maxLength={5000} onChange={(event) => set({ text: event.target.value })} />
                  </label>
                ) : (
                  <fieldset className="de-fieldset">
                    <legend>Which tasks</legend>
                    <label>List
                      <select value={draft.listId} onChange={(event) => set({ listId: event.target.value })}>
                        <option value="">All lists</option>
                        {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
                      </select>
                    </label>
                    <label>Due
                      <select value={draft.due} onChange={(event) => set({ due: event.target.value })}>
                        {Object.keys(DUE_LABELS).map((key) => <option key={key} value={key}>{DUE_LABELS[key]}</option>)}
                      </select>
                    </label>
                    <label>Status
                      <select value={draft.statusName} onChange={(event) => set({ statusName: event.target.value })}>
                        <option value="">Any status</option>
                        {statusNames.map((name) => <option key={name} value={name}>{name}</option>)}
                      </select>
                    </label>
                    <label>Tag
                      <select value={draft.tag} onChange={(event) => set({ tag: event.target.value })}>
                        <option value="">Any tag</option>
                        {tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                      </select>
                    </label>
                    <label className="de-check"><input type="checkbox" checked={draft.includeClosed} onChange={(event) => set({ includeClosed: event.target.checked })} /> Include finished tasks</label>
                  </fieldset>
                )}

                {draft.type === "count" ? (
                  <label>Color
                    <select value={draft.tone} onChange={(event) => set({ tone: event.target.value })}>
                      {Object.keys(TONE_LABELS).map((tone) => <option key={tone} value={tone}>{TONE_LABELS[tone]}</option>)}
                    </select>
                  </label>
                ) : null}
                {draft.type === "item_list" ? (
                  <label>Show up to
                    <select value={draft.limit} onChange={(event) => set({ limit: Number(event.target.value) })}>
                      {[5, 10, 15, 25].map((limit) => <option key={limit} value={limit}>{limit} tasks</option>)}
                    </select>
                  </label>
                ) : null}

                <div className="de-actions">
                  <button type="button" className="de-ghost" onClick={() => setDraft(null)}>Back</button>
                  <button type="submit" className="de-primary" disabled={busy}>{busy ? "Saving…" : draft.id ? "Save card" : "Add card"}</button>
                </div>
              </form>
            )}
          </aside>
        </div>
      ) : null}
    </>
  );
}

const deCss = [
  ".de-overlay{position:fixed;inset:0;z-index:95;background:rgba(0,0,0,.4);display:flex;justify-content:flex-end}",
  ".de-panel{width:min(440px,100%);height:100%;overflow-y:auto;background:var(--cu-bg,#fff);color:var(--cu-text,#292d34);padding:16px 20px 32px;box-shadow:-8px 0 24px rgba(0,0,0,.3);display:flex;flex-direction:column;gap:12px}",
  ".de-head{display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;border-bottom:1px solid var(--cu-border,#e4e6eb)}",
  ".de-muted{font-size:12px;color:var(--cu-muted,#656f7d);margin:0}",
  ".de-error{color:#d03b3b;margin:0;font-size:13px}",
  ".de-cards{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}",
  ".de-card{display:flex;align-items:center;gap:4px;padding:8px 8px 8px 12px;border:1px solid var(--cu-border,#e4e6eb);border-radius:8px}",
  ".de-card-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.de-card-main strong{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".de-icon{display:grid;place-items:center;width:28px;height:28px;border:0;border-radius:6px;background:none;color:inherit;cursor:pointer;font-size:13px}",
  ".de-icon:hover:not(:disabled){background:var(--cu-hover,rgba(0,0,0,.06))}.de-icon:disabled{opacity:.3;cursor:default}",
  ".de-danger:hover:not(:disabled){color:#d03b3b}",
  ".de-primary{border:0;background:#7b68ee;color:#fff;font:inherit;font-size:13px;font-weight:600;padding:8px 14px;border-radius:8px;cursor:pointer}",
  ".de-primary:hover{background:#6a58e0}.de-primary:disabled{opacity:.6}",
  ".de-ghost{border:1px solid var(--cu-border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:13px;padding:8px 14px;border-radius:8px;cursor:pointer}",
  ".de-form{display:flex;flex-direction:column;gap:12px}",
  ".de-form label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--cu-muted,#656f7d)}",
  ".de-form input,.de-form select,.de-form textarea{font:inherit;font-size:13px;color:var(--cu-text,#292d34)}",
  ".de-fieldset{border:1px solid var(--cu-border,#e4e6eb);border-radius:8px;padding:10px 12px;display:grid;grid-template-columns:1fr 1fr;gap:10px}",
  ".de-fieldset legend{font-size:12px;font-weight:600;padding:0 4px}",
  ".de-form .de-check{flex-direction:row;align-items:center;grid-column:1/-1}",
  ".de-actions{display:flex;justify-content:flex-end;gap:8px}",
  ".de-open{position:relative;z-index:1;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.12);color:#fff;font:inherit;font-size:12px;font-weight:600;padding:6px 12px;border-radius:8px;cursor:pointer}",
  ".de-open:hover{background:rgba(255,255,255,.22)}",
  "@media (max-width:480px){.de-fieldset{grid-template-columns:1fr}}"
].join("");
