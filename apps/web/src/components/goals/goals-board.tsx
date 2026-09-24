"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import type { Goal, Horizon } from "@/lib/goals/goals";

// Long term and short term, kept apart, because they are read at different moments.
//
// Shaped for a squadron rather than for a software team: the examples offered are the awards and checks
// TN-170 is actually measured against, and a target can read its progress straight from the work already
// in the Hub so nobody has to remember to update a number.

const SUGGESTIONS: Array<{ horizon: Horizon; name: string; detail: string }> = [
  { horizon: "SHORT", name: "Quality Cadet Unit Award for this year", detail: "Scored automatically. Every criterion has to hold by the end of the award year." },
  { horizon: "SHORT", name: "AEX programme completed and reported", detail: "Registration, the required activities, and the report filed before the national deadline." },
  { horizon: "LONG", name: "Every duty position filled with a named backup", detail: "No single point of failure in any functional area." },
  { horizon: "LONG", name: "Pass the next Subordinate Unit Inspection", detail: "Everything an inspector asks for is current and findable before the visit." }
];

function pct(value: number): number {
  return Math.round(value * 100);
}

export function GoalsBoard({ goals: initial, canEdit, lists, people }: {
  goals: Goal[];
  canEdit: boolean;
  lists: Array<{ id: string; name: string; spaceName: string }>;
  people: Array<{ userId: string; fullName: string }>;
}) {
  const [goals, setGoals] = useState(initial);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<{ horizon: Horizon; name?: string; detail?: string } | null>(null);
  const [targetFor, setTargetFor] = useState<string | null>(null);
  const router = useRouter();

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = (await response.json()) as { goals?: Goal[]; message?: string };
      if (!response.ok) throw new Error(data.message || "That could not be saved.");
      if (data.goals) setGoals(data.goals);
      setAdding(null);
      setTargetFor(null);
      setNote(data.message ?? "Saved.");
      router.refresh();
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "That could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  function whenText(goal: Goal): string {
    if (!goal.targetDate) return "No date set";
    if (goal.daysLeft === null) return goal.targetDate;
    if (goal.daysLeft < 0) return Math.abs(goal.daysLeft) + " days past";
    if (goal.daysLeft === 0) return "Due today";
    if (goal.daysLeft < 45) return goal.daysLeft + " days left";
    return "by " + new Date(goal.targetDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }

  const card = (goal: Goal) => (
    <article key={goal.id} className={"gl-card" + (goal.status !== "OPEN" ? " gl-card--closed" : "")}>
      <header>
        <div className="gl-head">
          <h3>{goal.name}</h3>
          <p className="gl-meta">
            {goal.ownerName ?? "No owner"} · <span className={goal.daysLeft !== null && goal.daysLeft < 0 ? "gl-late" : ""}>{whenText(goal)}</span>
            {goal.status !== "OPEN" ? " · " + goal.status.toLowerCase() : ""}
          </p>
        </div>
        <span className="gl-pct" title={pct(goal.progress) + "% of the way there"}>{pct(goal.progress)}%</span>
      </header>

      <div className="gl-bar"><span style={{ width: pct(goal.progress) + "%" }} /></div>
      {goal.detail ? <p className="gl-detail">{goal.detail}</p> : null}

      {goal.targets.length ? (
        <ul className="gl-targets">
          {goal.targets.map((target) => (
            <li key={target.id}>
              <span className="gl-t-label">{target.label}</span>
              <span className="gl-t-read">{target.readout}</span>
              {canEdit && target.kind !== "TASKS" ? (
                target.kind === "CHECK" ? (
                  <button type="button" className="gl-btn" disabled={busy} onClick={() => send({ action: "setTarget", targetId: target.id, current: target.currentValue >= 1 ? 0 : 1 })}>
                    {target.currentValue >= 1 ? "Undo" : "Mark done"}
                  </button>
                ) : (
                  <input
                    className="gl-num"
                    type="number"
                    defaultValue={target.currentValue}
                    min={0}
                    aria-label={"Progress for " + target.label}
                    onBlur={(event) => {
                      const value = Number(event.target.value);
                      if (!Number.isNaN(value) && value !== target.currentValue) send({ action: "setTarget", targetId: target.id, current: value });
                    }}
                  />
                )
              ) : null}
              {canEdit ? <button type="button" className="gl-x" aria-label={"Remove " + target.label} onClick={() => send({ action: "removeTarget", targetId: target.id })}>×</button> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="gl-faint">No targets yet, so nothing is being measured.</p>
      )}

      {canEdit ? (
        targetFor === goal.id ? (
          <form
            className="gl-target-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const kind = String(form.get("kind")) as "NUMBER" | "CHECK" | "TASKS";
              send({
                action: "addTarget",
                goalId: goal.id,
                label: String(form.get("label") ?? "").trim(),
                kind,
                targetValue: kind === "NUMBER" ? Number(form.get("targetValue") || 1) : 1,
                unit: kind === "NUMBER" ? String(form.get("unit") ?? "").trim() || null : null,
                sourceListId: kind === "TASKS" ? String(form.get("sourceListId") ?? "") || null : null
              });
            }}
          >
            <input name="label" placeholder="What has to be true" maxLength={160} required autoFocus />
            <select name="kind" defaultValue="TASKS">
              <option value="TASKS">Work in a list getting finished</option>
              <option value="NUMBER">A number to reach</option>
              <option value="CHECK">A single thing, done or not</option>
            </select>
            <select name="sourceListId" defaultValue="">
              <option value="">Which list (for the first kind)</option>
              {lists.map((list) => <option key={list.id} value={list.id}>{list.spaceName} · {list.name}</option>)}
            </select>
            <input name="targetValue" type="number" min={1} defaultValue={1} aria-label="Target number" />
            <input name="unit" placeholder="Unit, e.g. cadets" maxLength={24} />
            <button type="submit" className="gl-btn gl-btn--primary" disabled={busy}>Add</button>
            <button type="button" className="gl-btn" onClick={() => setTargetFor(null)}>Cancel</button>
          </form>
        ) : (
          <div className="gl-actions">
            <button type="button" className="gl-btn" onClick={() => setTargetFor(goal.id)}>+ Add a target</button>
            {goal.status === "OPEN" ? (
              <button type="button" className="gl-btn" disabled={busy} onClick={() => send({ action: "update", id: goal.id, status: "MET" })}>Mark met</button>
            ) : (
              <button type="button" className="gl-btn" disabled={busy} onClick={() => send({ action: "update", id: goal.id, status: "OPEN" })}>Reopen</button>
            )}
            <ConfirmButton className="gl-btn gl-btn--danger" disabled={busy} question={"Remove " + goal.name + "?"} onConfirm={() => send({ action: "delete", id: goal.id })}>
              Remove
            </ConfirmButton>
          </div>
        )
      ) : null}
    </article>
  );

  const section = (horizon: Horizon, title: string, blurb: string) => {
    const mine = goals.filter((goal) => goal.horizon === horizon);
    return (
      <section className="gl-section">
        <div className="gl-section-head">
          <div>
            <h2>{title} <span className="gl-n">{mine.length}</span></h2>
            <p className="gl-faint">{blurb}</p>
          </div>
          {canEdit ? <button type="button" className="gl-btn gl-btn--primary" onClick={() => setAdding({ horizon })}>New goal</button> : null}
        </div>

        {adding?.horizon === horizon ? (
          <form
            className="gl-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              send({
                action: "create",
                horizon,
                name: String(form.get("name") ?? "").trim(),
                detail: String(form.get("detail") ?? "").trim(),
                targetDate: String(form.get("targetDate") ?? "") || null,
                ownerUserId: String(form.get("ownerUserId") ?? "") || null
              });
            }}
          >
            <input name="name" defaultValue={adding.name ?? ""} placeholder="What the squadron is trying to achieve" maxLength={160} required autoFocus />
            <textarea name="detail" defaultValue={adding.detail ?? ""} rows={2} maxLength={2000} placeholder="What it means, in one or two lines" />
            <div className="gl-form-row">
              <label>By when<input name="targetDate" type="date" /></label>
              <label>
                Whose it is
                <select name="ownerUserId" defaultValue="">
                  <option value="">Nobody yet</option>
                  {people.map((person) => <option key={person.userId} value={person.userId}>{person.fullName}</option>)}
                </select>
              </label>
            </div>
            <div className="gl-form-actions">
              <button type="button" className="gl-btn" onClick={() => setAdding(null)}>Cancel</button>
              <button type="submit" className="gl-btn gl-btn--primary" disabled={busy}>Create</button>
            </div>
          </form>
        ) : null}

        {mine.length ? <div className="gl-grid">{mine.map(card)}</div> : (
          <div className="gl-empty">
            <p className="gl-faint">Nothing here yet. These are the ones a squadron usually has:</p>
            <div className="gl-suggest">
              {SUGGESTIONS.filter((entry) => entry.horizon === horizon).map((entry) => (
                <button key={entry.name} type="button" className="gl-btn" onClick={() => setAdding({ horizon, name: entry.name, detail: entry.detail })}>
                  {entry.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="gl">
      <style>{glCss}</style>
      {note ? <p className="gl-note" role="status">{note}</p> : null}
      {section("SHORT", "This year", "What has to be true by the end of the award or fiscal year. The things a staff meeting is about.")}
      {section("LONG", "Beyond this year", "Where the squadron is going. Read less often, and worth being honest about.")}
    </div>
  );
}

const glCss = [
  ".gl{display:flex;flex-direction:column;gap:28px}",
  ".gl-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:12px}",
  ".gl-section h2{font-size:16px;margin:0 0 3px;display:flex;align-items:center;gap:8px}",
  ".gl-n{font-size:12px;font-weight:600;opacity:.55}",
  ".gl-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(360px,1fr))}",
  ".gl-card{border:1px solid var(--border,#e4e6eb);border-radius:10px;padding:14px;background:var(--surface,#fff);display:flex;flex-direction:column;gap:8px}",
  "html[data-theme=dark] .gl-card{background:#222326;border-color:#34363b}",
  ".gl-card--closed{opacity:.6}",
  ".gl-card header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}",
  ".gl-head h3{margin:0;font-size:14.5px;line-height:1.35}",
  ".gl-meta{margin:3px 0 0;font-size:12px;opacity:.65}",
  ".gl-late{color:#d03b3b;font-weight:600}",
  ".gl-pct{font-size:19px;font-weight:700;flex:none}",
  ".gl-bar{height:6px;border-radius:999px;background:rgba(123,104,238,.16);overflow:hidden}",
  ".gl-bar span{display:block;height:100%;background:#7b68ee;border-radius:999px}",
  ".gl-detail{margin:0;font-size:12.5px;opacity:.8}",
  ".gl-targets{list-style:none;margin:2px 0 0;padding:0;display:flex;flex-direction:column;gap:5px}",
  ".gl-targets li{display:flex;align-items:center;gap:8px;font-size:12.5px}",
  ".gl-t-label{flex:1;min-width:0}",
  ".gl-t-read{opacity:.65;white-space:nowrap}",
  ".gl-num{width:74px;font:inherit;font-size:12.5px;padding:3px 6px;border-radius:6px;border:1px solid var(--border,#d5d8de);background:transparent;color:inherit}",
  ".gl-x{border:0;background:none;color:inherit;opacity:.45;cursor:pointer;font-size:15px;line-height:1;padding:0 3px}",
  ".gl-x:hover{opacity:1;color:#d03b3b}",
  ".gl-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:2px}",
  ".gl-btn{border:1px solid var(--border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:12.5px;font-weight:600;padding:5px 10px;border-radius:7px;cursor:pointer;white-space:nowrap}",
  ".gl-btn--primary{background:#7b68ee;border-color:#7b68ee;color:#fff}",
  ".gl-btn--danger{color:#d03b3b}.gl-btn--danger:hover{border-color:#d03b3b}",
  ".gl-form,.gl-target-form{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid var(--border,#e4e6eb);border-radius:10px;margin-bottom:12px;background:var(--surface,#fff)}",
  "html[data-theme=dark] .gl-form,html[data-theme=dark] .gl-target-form{background:#222326;border-color:#34363b}",
  ".gl-form input,.gl-form textarea,.gl-form select,.gl-target-form input,.gl-target-form select{font:inherit;font-size:13.5px;padding:6px 9px;border-radius:7px;border:1px solid var(--border,#d5d8de);background:transparent;color:inherit;min-height:32px}",
  ".gl-form-row{display:flex;gap:10px;flex-wrap:wrap}.gl-form-row label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;flex:1 1 160px}",
  ".gl-form-actions{display:flex;gap:8px;justify-content:flex-end}",
  ".gl-target-form{flex-direction:row;flex-wrap:wrap;align-items:center}",
  ".gl-empty{padding:14px;border:1px dashed var(--border,#d5d8de);border-radius:10px}",
  ".gl-suggest{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}",
  ".gl-note{margin:0;font-size:13px;padding:10px 13px;border-radius:9px;background:rgba(123,104,238,.12)}",
  ".gl-faint{font-size:12.5px;color:var(--muted,#656f7d);margin:0}"
].join("");
