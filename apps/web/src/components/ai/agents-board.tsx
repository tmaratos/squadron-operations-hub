"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import type { Agent } from "@/lib/ai/agents";

// Seeing the agents. Shared ones the squadron keeps, and the ones a member made for themselves.
//
// These are suggestions, not pre-built agents pretending to exist. Pressing one fills the form with a
// starting brief that is meant to be edited - the squadron knows its own job better than a template does.
const SUGGESTIONS: Array<{ emoji: string; name: string; purpose: string; brief: string }> = [
  {
    emoji: "🗂️",
    name: "Filing Clerk",
    purpose: "Puts new work in the right list",
    brief: "When somebody describes work, decide which department and list it belongs in by comparing it with the work already filed there. If nothing fits, say so and suggest a new list rather than using a general one."
  },
  {
    emoji: "📅",
    name: "Deadline Watch",
    purpose: "Finds what is slipping",
    brief: "Report what is overdue or due soon, who owns it, and what has no owner at all. Say the dates plainly. Never invent a deadline that is not recorded in the Hub."
  },
  {
    emoji: "📋",
    name: "Meeting Prep",
    purpose: "Builds the senior staff agenda",
    brief: "Draft an agenda from open work, recent changes and anything overdue. Group it by department. Keep each line short enough to read aloud."
  }
];

export function AgentsBoard({ agents: initial, canEdit, lists = [] }: {
  agents: Agent[];
  canEdit: boolean;
  lists?: Array<{ id: string; name: string; spaceName: string }>;
}) {
  const [agents, setAgents] = useState(initial);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Partial<Agent> & { open?: boolean } | null>(null);
  const router = useRouter();
  const [unread, setUnread] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch("/api/ai/agents/run")
      .then((response) => response.json() as Promise<{ unread?: Record<string, number> }>)
      .then((data) => setUnread(data.unread ?? {}))
      .catch(() => undefined);
  }, [agents.length]);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/ai/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = (await response.json()) as { agents?: Agent[]; message?: string };
      if (!response.ok) throw new Error(data.message || "That could not be saved.");
      if (data.agents) setAgents(data.agents);
      setEditing(null);
      setNote(data.message ?? "Saved.");
      // The sidebar is rendered on the server, so a new agent never reached it and the list looked stale
      // however many times the page was refreshed.
      router.refresh();
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "That could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      name: String(form.get("name") ?? "").trim(),
      purpose: String(form.get("purpose") ?? "").trim(),
      brief: String(form.get("brief") ?? "").trim(),
      emoji: String(form.get("emoji") ?? "").trim() || "🤖",
      shared: form.get("shared") === "on",
      // What it watches, and whether it looks on its own.
      scopeType: form.get("scopeId") ? ("list" as const) : null,
      scopeId: (String(form.get("scopeId") ?? "") || null),
      schedule: form.get("schedule") === "on" ? ("DAILY" as const) : null
    };
    if (!body.name) return;
    send(editing?.id ? { action: "update", id: editing.id, ...body } : { action: "create", ...body });
  }

  const shared = agents.filter((agent) => agent.shared);
  const mine = agents.filter((agent) => !agent.shared);

  const card = (agent: Agent) => (
    <article key={agent.id} className="ag-card">
      <span className="ag-face" aria-hidden="true">
        {agent.emoji}
        {unread[agent.id] ? <i className="ag-unread">{unread[agent.id]}</i> : null}
      </span>
      <div className="ag-body">
        <h3>{agent.name}</h3>
        {agent.purpose ? <p>{agent.purpose}</p> : <p className="ag-faint">No description</p>}
        <p className="ag-meta">
          {agent.shared ? "Shared with the squadron" : "Yours only"}
          {agent.scopeName ? " · watches " + agent.scopeName : " · watches everything"}
          {agent.schedule ? " · looks every day" : " · only when asked"}
        </p>
      </div>
      <div className="ag-actions">
        {/* Opens the assistant on this agent. It used to link to "/?agent=" and nothing anywhere read
            that, so it navigated to the home page and did nothing at all. */}
        <button
          type="button"
          className="ag-btn ag-btn--primary"
          onClick={() => window.dispatchEvent(new CustomEvent("hub:ask", { detail: { agentId: agent.id, agentName: agent.name } }))}
        >
          Ask
        </button>
        {agent.canEdit ? (
          <>
            <button type="button" className="ag-btn" onClick={() => setEditing({ ...agent, open: true })}>Edit</button>
            <ConfirmButton
              className="ag-btn ag-btn--danger"
              disabled={busy}
              question={"Remove " + agent.name + "?"}
              onConfirm={() => send({ action: "delete", id: agent.id })}
            >
              Remove
            </ConfirmButton>
          </>
        ) : null}
      </div>
    </article>
  );

  return (
    <div className="ag">
      <style>{agCss}</style>
      {note ? <p className="ag-note" role="status">{note}</p> : null}

      {canEdit && !editing ? (
        <div className="ag-new">
          <button type="button" className="ag-btn ag-btn--primary" onClick={() => setEditing({ open: true })}>New agent</button>
          <span className="ag-faint">or start from:</span>
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion.name}
              type="button"
              className="ag-btn"
              onClick={() => setEditing({ ...suggestion, open: true })}
            >
              {suggestion.emoji} {suggestion.name}
            </button>
          ))}
        </div>
      ) : null}

      {editing ? (
        <form className="ag-form" onSubmit={submit}>
          <div className="ag-form-row">
            <label className="ag-emoji">Icon<input name="emoji" defaultValue={editing.emoji ?? "🤖"} maxLength={8} /></label>
            <label className="ag-grow">Name<input name="name" defaultValue={editing.name ?? ""} maxLength={60} required autoFocus placeholder="Compliance Casey" /></label>
          </div>
          <label>What it is for<input name="purpose" defaultValue={editing.purpose ?? ""} maxLength={160} placeholder="Watches deadlines and says what is slipping" /></label>
          <label>
            Standing instructions
            <textarea name="brief" defaultValue={editing.brief ?? ""} maxLength={4000} rows={6} placeholder="Tell it how to behave. This goes in front of everything it is asked." />
          </label>
          <label>
            What it watches
            <select name="scopeId" defaultValue={editing.scopeId ?? ""}>
              <option value="">Everything in the squadron</option>
              {lists.map((list) => <option key={list.id} value={list.id}>{list.spaceName} · {list.name}</option>)}
            </select>
          </label>
          <label className="ag-check">
            <input type="checkbox" name="schedule" defaultChecked={Boolean(editing.schedule)} />
            <span>Look once a day and tell me what it finds, without being asked. It only ever reports — it never creates, assigns or changes anything on its own.</span>
          </label>
          <label className="ag-check">
            <input type="checkbox" name="shared" defaultChecked={editing.shared ?? false} />
            <span>Share it with the squadron — everybody can see and use it. Leave this off to keep it to yourself.</span>
          </label>
          <p className="ag-faint">
            An agent cannot do anything you could not already ask for. Everything it proposes is still shown to you and
            confirmed before it happens.
          </p>
          <div className="ag-form-actions">
            <button type="button" className="ag-btn" onClick={() => setEditing(null)}>Cancel</button>
            <button type="submit" className="ag-btn ag-btn--primary" disabled={busy}>{busy ? "Saving…" : editing.id ? "Save" : "Create"}</button>
          </div>
        </form>
      ) : null}

      <section>
        <h2>Shared with the squadron <span className="ag-n">{shared.length}</span></h2>
        {shared.length ? <div className="ag-grid">{shared.map(card)}</div> : <p className="ag-faint">None yet. A shared agent is how the squadron keeps one answer to a question instead of eleven.</p>}
      </section>

      <section>
        <h2>Yours <span className="ag-n">{mine.length}</span></h2>
        {mine.length ? <div className="ag-grid">{mine.map(card)}</div> : <p className="ag-faint">None yet. Anything you make here stays private unless you share it.</p>}
      </section>
    </div>
  );
}

const agCss = [
  ".ag{display:flex;flex-direction:column;gap:22px}",
  ".ag h2{font-size:15px;margin:0 0 10px;display:flex;align-items:center;gap:8px}",
  ".ag-n{font-size:12px;font-weight:600;opacity:.6}",
  ".ag-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(min(320px,100%),1fr))}",
  ".ag-card{display:grid;grid-template-columns:38px 1fr;grid-template-areas:'face body' 'face actions';gap:6px 12px;align-items:start;padding:14px;border:1px solid var(--border,#e4e6eb);border-radius:10px;background:var(--surface,#fff)}",
  ".ag-card .ag-face{grid-area:face}.ag-body{grid-area:body}",
  "html[data-theme=dark] .ag-card{background:#222326;border-color:#34363b}",
  ".ag-face{position:relative;font-size:24px;line-height:1;flex:none;width:38px;height:38px;display:grid;place-items:center;border-radius:9px;background:rgba(123,104,238,.14)}",
  ".ag-unread{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#e5484d;color:#fff;font-size:11px;font-weight:700;font-style:normal;display:grid;place-items:center}",
  ".ag-body{flex:1;min-width:0}",
  ".ag-body h3{margin:0;font-size:14.5px}",
  ".ag-body p{margin:3px 0 0;font-size:12.5px}",
  ".ag-meta{opacity:.6;font-size:11.5px !important}",
  ".ag-actions{grid-area:actions;display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}",
  ".ag-btn{border:1px solid var(--border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:12.5px;font-weight:600;padding:5px 10px;border-radius:7px;cursor:pointer;white-space:nowrap;text-decoration:none;text-align:center}",
  ".ag-btn--primary{background:#7b68ee;border-color:#7b68ee;color:#fff}",
  ".ag-btn--danger{color:#d03b3b}.ag-btn--danger:hover{border-color:#d03b3b}",
  ".ag-new{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
  ".ag-form{display:flex;flex-direction:column;gap:10px;padding:16px;border:1px solid var(--border,#e4e6eb);border-radius:10px;background:var(--surface,#fff)}",
  "html[data-theme=dark] .ag-form{background:#222326;border-color:#34363b}",
  ".ag-form label{display:flex;flex-direction:column;gap:5px;font-size:12.5px;font-weight:600}",
  ".ag-form select{font:inherit;font-size:14px;padding:7px 9px;border-radius:7px;border:1px solid var(--border,#d5d8de);background:transparent;color:inherit;min-height:34px}",
  ".ag-form input,.ag-form textarea{font:inherit;font-size:14px;padding:7px 9px;border-radius:7px;border:1px solid var(--border,#d5d8de);background:transparent;color:inherit;min-height:34px}",
  ".ag-form-row{display:flex;gap:10px;align-items:flex-end}",
  ".ag-emoji{width:76px;flex:none}.ag-emoji input{text-align:center;font-size:20px}",
  ".ag-grow{flex:1;min-width:0}",
  ".ag-check{flex-direction:row !important;align-items:flex-start;gap:8px !important;font-weight:500 !important}",
  ".ag-check input{min-height:auto;margin-top:3px}",
  ".ag-form-actions{display:flex;gap:8px;justify-content:flex-end}",
  ".ag-note{margin:0;font-size:13px;padding:10px 13px;border-radius:9px;background:rgba(123,104,238,.12)}",
  ".ag-faint{font-size:12.5px;color:var(--muted,#656f7d)}"
].join("");
