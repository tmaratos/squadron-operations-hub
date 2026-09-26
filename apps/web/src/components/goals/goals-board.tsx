"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { Dictate } from "@/components/dictate";
import type { Goal, GoalStep, Horizon } from "@/lib/goals/goals";

interface DraftStep { title: string; dueOn: string | null; listId: string | null; listName: string | null }
interface Draft { name: string; detail: string | null; horizon: Horizon; targetDate: string | null; steps: DraftStep[] }
interface Check { tone: "OK" | "WARN"; says: string }

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
  // Describing a goal out loud. The draft sits here, edited freely, until somebody presses the button.
  const [said, setSaid] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [stepFor, setStepFor] = useState<string | null>(null);
  const [showTargets, setShowTargets] = useState<string | null>(null);
  const router = useRouter();

  async function describe() {
    if (said.trim().length < 8) return setNote("Say a bit more about what you are trying to achieve.");
    setDrafting(true);
    setNote(null);
    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "draft", prompt: said })
      });
      const data = (await response.json()) as { draft?: Draft; checks?: Check[]; message?: string };
      if (!response.ok || !data.draft) throw new Error(data.message || "That could not be drafted.");
      setDraft(data.draft);
      setChecks(data.checks ?? []);
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "That could not be drafted.");
    } finally {
      setDrafting(false);
    }
  }

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

      {/* The steps are the honest measure: a goal made of eight jobs is however many of those are done. */}
      {goal.steps.length ? (
        <ul className="gl-steps">
          {goal.steps.map((step: GoalStep) => (
            <li key={step.id} className={step.done ? "is-done" : ""}>
              <span className="gl-step-mark" aria-hidden="true">{step.done ? "\u2713" : "\u25cb"}</span>
              <span className="gl-step-label">
                {step.itemId && step.listId
                  ? <a href={"/lists/" + step.listId + "?item=" + step.itemId}>{step.title}</a>
                  : step.title}
                {step.unattached ? <em className="gl-step-note"> no task yet</em> : null}
                {step.dueOn ? <em className="gl-step-note"> {step.dueOn}</em> : null}
              </span>
              {canEdit ? (
                <button type="button" className="gl-x" aria-label={"Remove step " + step.title} onClick={() => send({ action: "removeStep", stepId: step.id })}>&times;</button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {canEdit ? (
        stepFor === goal.id ? (
          <form
            className="gl-target-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              send({
                action: "addStep",
                goalId: goal.id,
                title: String(form.get("title") ?? "").trim(),
                listId: String(form.get("listId") ?? "") || null,
                dueOn: String(form.get("dueOn") ?? "") || null
              });
              setStepFor(null);
            }}
          >
            <input name="title" placeholder="What has to be done" maxLength={200} required autoFocus />
            <select name="listId" defaultValue="">
              <option value="">No task, just a line</option>
              {lists.map((list) => <option key={list.id} value={list.id}>{list.spaceName} &middot; {list.name}</option>)}
            </select>
            <input name="dueOn" type="date" aria-label="Due date for this step" />
            <button type="submit" className="gl-btn gl-btn--primary" disabled={busy}>Add step</button>
            <button type="button" className="gl-btn" onClick={() => setStepFor(null)}>Cancel</button>
          </form>
        ) : null
      ) : null}

      {showTargets === goal.id && goal.targets.length ? (
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
      ) : null}

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
            <button type="button" className="gl-btn" onClick={() => setStepFor(stepFor === goal.id ? null : goal.id)}>+ Add a step</button>
            {/* Targets are the older, fiddlier way of measuring a goal and are no longer the front door.
                They still work, and a goal that uses one still shows it - it is just not the first thing
                somebody is asked to understand. */}
            {goal.targets.length || showTargets === goal.id ? (
              <button type="button" className="gl-btn" onClick={() => setShowTargets(showTargets === goal.id ? null : goal.id)}>
                {showTargets === goal.id ? "Hide measures" : "Measures (" + goal.targets.length + ")"}
              </button>
            ) : (
              <button type="button" className="gl-btn" onClick={() => { setShowTargets(goal.id); setTargetFor(goal.id); }}>+ Measure a number</button>
            )}
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
            <div className="gl-say-actions">
              <Dictate
                onText={(text) => setAdding((current) => (current ? { ...current, detail: (current.detail ? current.detail + " " + text : text) } : current))}
                label="Say the detail"
              />
            </div>
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

  const composer = canEdit ? (
    <section className="gl-composer">
      <h2>Set up a goal by describing it</h2>
      <p className="gl-faint">
        Say what you are trying to achieve and roughly what has to happen. The assistant turns it into a goal with
        steps, shows you what it came up with, and changes nothing until you say so.
      </p>
      <div className="gl-say">
        <textarea
          value={said}
          onChange={(event) => setSaid(event.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="We want every senior member to finish Level 1 before the end of the fiscal year"
        />
        <div className="gl-say-actions">
          <Dictate onText={(text) => setSaid((current) => (current ? current + " " + text : text))} label="Say it" />
          <button type="button" className="gl-btn gl-btn--primary" disabled={drafting || busy} onClick={describe}>
            {drafting ? "Working\u2026" : "Draft it"}
          </button>
        </div>
      </div>

      {draft ? (
        <div className="gl-draft">
          <h3>Check this over</h3>
          {checks.length ? (
            <ul className="gl-checks">
              {checks.map((check) => (
                <li key={check.says} className={check.tone === "WARN" ? "is-warn" : ""}>{check.says}</li>
              ))}
            </ul>
          ) : null}

          <label className="gl-field">
            <span>Goal</span>
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={160} />
          </label>
          <label className="gl-field">
            <span>What counts as done</span>
            <textarea value={draft.detail ?? ""} onChange={(event) => setDraft({ ...draft, detail: event.target.value })} rows={2} maxLength={2000} />
          </label>
          <div className="gl-form-row">
            <label>
              When
              <select value={draft.horizon} onChange={(event) => setDraft({ ...draft, horizon: event.target.value as Horizon })}>
                <option value="SHORT">This year</option>
                <option value="LONG">Beyond this year</option>
              </select>
            </label>
            <label>
              By when
              <input type="date" value={draft.targetDate ?? ""} onChange={(event) => setDraft({ ...draft, targetDate: event.target.value || null })} />
            </label>
          </div>

          <p className="gl-faint">
            The steps. Each one with a list chosen becomes a real task you can assign; leave the list empty and it
            stays a line on the goal until you decide where it belongs.
          </p>
          <ul className="gl-draft-steps">
            {draft.steps.map((step, index) => (
              <li key={index}>
                <input
                  value={step.title}
                  onChange={(event) => setDraft({ ...draft, steps: draft.steps.map((entry, i) => i === index ? { ...entry, title: event.target.value } : entry) })}
                  maxLength={200}
                  aria-label={"Step " + (index + 1)}
                />
                <select
                  value={step.listId ?? ""}
                  onChange={(event) => setDraft({ ...draft, steps: draft.steps.map((entry, i) => i === index ? { ...entry, listId: event.target.value || null } : entry) })}
                  aria-label={"Which list step " + (index + 1) + " goes in"}
                >
                  <option value="">No task yet</option>
                  {lists.map((list) => <option key={list.id} value={list.id}>{list.spaceName} &middot; {list.name}</option>)}
                </select>
                <input
                  type="date"
                  value={step.dueOn ?? ""}
                  onChange={(event) => setDraft({ ...draft, steps: draft.steps.map((entry, i) => i === index ? { ...entry, dueOn: event.target.value || null } : entry) })}
                  aria-label={"Due date for step " + (index + 1)}
                />
                <button type="button" className="gl-x" aria-label={"Remove step " + (index + 1)} onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, i) => i !== index) })}>&times;</button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="gl-btn"
            onClick={() => setDraft({ ...draft, steps: [...draft.steps, { title: "", dueOn: null, listId: null, listName: null }] })}
          >
            + Another step
          </button>

          <div className="gl-form-actions">
            <button type="button" className="gl-btn" onClick={() => { setDraft(null); setChecks([]); }}>Throw it away</button>
            <button
              type="button"
              className="gl-btn gl-btn--primary"
              disabled={busy}
              onClick={() => {
                const steps = draft.steps.filter((step) => step.title.trim().length >= 3);
                send({
                  action: "createFromDraft",
                  name: draft.name,
                  detail: draft.detail,
                  horizon: draft.horizon,
                  targetDate: draft.targetDate,
                  steps: steps.map((step) => ({ title: step.title, dueOn: step.dueOn, listId: step.listId }))
                });
                setDraft(null);
                setChecks([]);
                setSaid("");
              }}
            >
              Create it
            </button>
          </div>
        </div>
      ) : null}
    </section>
  ) : null;

  return (
    <div className="gl">
      <style>{glCss}</style>
      {note ? <p className="gl-note" role="status">{note}</p> : null}
      {composer}
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
  ".gl-grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(min(360px,100%),1fr))}",
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
  ".gl-faint{font-size:12.5px;color:var(--muted,#656f7d);margin:0}",
  ".gl-composer{border:1px solid var(--border,#e4e6eb);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:9px;min-width:0}",
  "html[data-theme=dark] .gl-composer{background:#222326;border-color:#34363b}",
  ".gl-composer h2{margin:0;font-size:15.5px}",
  ".gl-composer h3{margin:0;font-size:14px}",
  ".gl-say{display:flex;flex-direction:column;gap:8px}",
  ".gl-say textarea{font:inherit;font-size:14px;padding:9px 11px;border-radius:8px;border:1px solid var(--border,#d5d8de);background:transparent;color:inherit;resize:vertical;min-width:0}",
  ".gl-say-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}",
  ".gl-draft{display:flex;flex-direction:column;gap:9px;border-top:1px solid var(--border,#e4e6eb);padding-top:12px;margin-top:3px}",
  ".gl-checks{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:5px}",
  ".gl-checks li{font-size:12.5px;padding:7px 10px;border-radius:7px;background:rgba(46,160,96,.1);border-left:3px solid #2ea060}",
  ".gl-checks li.is-warn{background:rgba(217,147,43,.12);border-left-color:#d9932b}",
  ".gl-field{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600}",
  ".gl-field input,.gl-field textarea{font:inherit;font-size:13.5px;font-weight:400;padding:7px 9px;border-radius:7px;border:1px solid var(--border,#d5d8de);background:transparent;color:inherit;min-width:0}",
  ".gl-draft-steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}",
  ".gl-draft-steps li{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,150px) 140px auto;gap:6px;align-items:center}",
  ".gl-draft-steps input,.gl-draft-steps select{font:inherit;font-size:13px;padding:6px 8px;border-radius:7px;border:1px solid var(--border,#d5d8de);background:transparent;color:inherit;min-width:0}",
  ".gl-steps{list-style:none;margin:2px 0 0;padding:0;display:flex;flex-direction:column;gap:5px}",
  ".gl-steps li{display:flex;align-items:flex-start;gap:7px;font-size:12.5px}",
  ".gl-steps li.is-done .gl-step-label{opacity:.55;text-decoration:line-through}",
  ".gl-step-mark{flex:0 0 auto;opacity:.6}",
  ".gl-step-label{flex:1;min-width:0}",
  ".gl-step-label a{color:inherit}",
  ".gl-step-note{opacity:.55;font-style:normal;font-size:11.5px}",
  "@media (max-width:640px){.gl-draft-steps li{grid-template-columns:minmax(0,1fr) auto;row-gap:5px}}"
].join("");
