"use client";

import { useCallback, useEffect, useState } from "react";
import type { Reminder } from "@/lib/work/reminders";

// The reminders on one task, and the controls to argue with them.
//
// The assistant's suggestion is a starting point, so every date here can be moved later, moved sooner or
// deleted, and a member can add their own. Rows the assistant proposed say so, because a suggestion should
// never quietly read as a decision somebody made.

interface Proposed {
  remindOn: string;
  note: string;
}

function whenText(reminder: Reminder): string {
  if (reminder.sentAt) return "sent";
  if (reminder.daysAway === null) return reminder.remindOn;
  if (reminder.daysAway < 0) return Math.abs(reminder.daysAway) + " days ago";
  if (reminder.daysAway === 0) return "today";
  if (reminder.daysAway === 1) return "tomorrow";
  return "in " + reminder.daysAway + " days";
}

export function RemindersPanel({ itemId, dueOn, canEdit }: { itemId: string; dueOn: string | null; canEdit: boolean }) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [proposed, setProposed] = useState<Proposed[] | null>(null);
  /** Read out of the task when it had no due date. Offered, and only set if the proposal is kept. */
  const [proposedDue, setProposedDue] = useState<string>("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newDate, setNewDate] = useState("");

  const endpoint = "/api/work/items/" + itemId + "/reminders";

  const load = useCallback(async () => {
    try {
      const response = await fetch(endpoint);
      const data = (await response.json()) as { reminders?: Reminder[] };
      setReminders(data.reminders ?? []);
    } catch {
      // A task without its reminders showing is still a usable task.
    }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = (await response.json()) as { reminders?: Reminder[]; proposed?: Proposed[]; proposedDueOn?: string | null; message?: string };
      if (!response.ok) throw new Error(data.message || "That could not be saved.");
      if (data.reminders) setReminders(data.reminders);
      if (data.proposed) setProposed(data.proposed);
      if (data.proposedDueOn) setProposedDue(data.proposedDueOn);
      if (data.message) setNote(data.message);
      return data;
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "That could not be saved.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rm">
      <h3 className="tp-h">
        Reminders
        {/* Always offered, with or without a due date. Hiding it on an undated task meant the one case where
            somebody most needs help was the case with no button. */}
        {canEdit ? (
          <button type="button" className="rm-btn rm-btn--ai" disabled={busy} onClick={() => send({ action: "suggest" })}>
            <span aria-hidden="true">✨</span> {busy ? "Working…" : reminders.length ? "Suggest again" : "Set them up for me"}
          </button>
        ) : null}
      </h3>

      {!dueOn && !proposedDue ? (
        <p className="rm-faint">
          No due date yet. Press the button and the assistant will look for one in the task itself &mdash; squadron work
          usually carries the date in its own words &mdash; and work the reminders back from it.
        </p>
      ) : null}

      {note ? <p className="rm-note" role="status">{note}</p> : null}

      {/* A proposal is not a decision. It sits here until somebody keeps it or throws it away. */}
      {proposed?.length ? (
        <div className="rm-proposed">
          <strong>Suggested — nothing is set yet</strong>
          {proposedDue ? (
            <label className="rm-due">
              <span>Due date to set on this task</span>
              <input type="date" value={proposedDue} onChange={(event) => setProposedDue(event.target.value)} />
            </label>
          ) : null}
          <ul>
            {proposed.map((entry, index) => (
              <li key={entry.remindOn + index}>
                <input
                  type="date"
                  value={entry.remindOn}
                  max={dueOn ?? undefined}
                  onChange={(event) => setProposed(proposed.map((row, i) => i === index ? { ...row, remindOn: event.target.value } : row))}
                  aria-label={"Date for suggested reminder " + (index + 1)}
                />
                <input
                  value={entry.note}
                  maxLength={160}
                  onChange={(event) => setProposed(proposed.map((row, i) => i === index ? { ...row, note: event.target.value } : row))}
                  aria-label={"Why, for suggested reminder " + (index + 1)}
                />
                <button type="button" className="rm-x" aria-label="Drop this one" onClick={() => setProposed(proposed.filter((_, i) => i !== index))}>&times;</button>
              </li>
            ))}
          </ul>
          <div className="rm-actions">
            <button type="button" className="rm-btn" onClick={() => { setProposed(null); setProposedDue(""); }}>Throw away</button>
            <button
              type="button"
              className="rm-btn rm-btn--primary"
              disabled={busy || !proposed.length}
              onClick={async () => {
                await send({
                  action: "apply",
                  reminders: proposed.filter((row) => row.remindOn),
                  ...(proposedDue ? { dueOn: proposedDue } : {})
                });
                setProposed(null);
                setProposedDue("");
              }}
            >
              Keep these
            </button>
          </div>
        </div>
      ) : null}

      {reminders.length ? (
        <ul className="rm-list">
          {reminders.map((reminder) => (
            <li key={reminder.id} className={reminder.sentAt ? "is-sent" : ""}>
              {canEdit && !reminder.sentAt ? (
                <input
                  type="date"
                  value={reminder.remindOn}
                  max={dueOn ?? undefined}
                  disabled={busy}
                  onChange={(event) => event.target.value && send({ action: "update", id: reminder.id, remindOn: event.target.value })}
                  aria-label={"When to be reminded: " + (reminder.note ?? reminder.remindOn)}
                />
              ) : (
                <span className="rm-date">{reminder.remindOn}</span>
              )}
              <span className="rm-text">
                <span className="rm-when">{whenText(reminder)}</span>
                {reminder.note ? <small>{reminder.note}</small> : null}
                {reminder.source === "ASSISTANT" && !reminder.sentAt ? <em className="rm-by">suggested</em> : null}
              </span>
              {canEdit ? (
                <button type="button" className="rm-x" disabled={busy} aria-label="Delete this reminder" onClick={() => send({ action: "delete", id: reminder.id })}>&times;</button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : dueOn ? (
        <p className="rm-faint">
          None of its own, so this task is on the squadron&rsquo;s normal schedule &mdash; a week out, three days, the day
          before, and the day itself.
        </p>
      ) : null}

      {canEdit ? (
        adding ? (
          <div className="rm-add">
            <input type="date" value={newDate} max={dueOn ?? undefined} onChange={(event) => setNewDate(event.target.value)} aria-label="Date for a new reminder" />
            <button type="button" className="rm-btn" onClick={() => { setAdding(false); setNewDate(""); }}>Cancel</button>
            <button
              type="button"
              className="rm-btn rm-btn--primary"
              disabled={busy || !newDate}
              onClick={async () => {
                await send({ action: "add", remindOn: newDate, note: null });
                setAdding(false);
                setNewDate("");
              }}
            >
              Add
            </button>
          </div>
        ) : (
          <div className="rm-actions">
            <button type="button" className="rm-btn" onClick={() => setAdding(true)}>+ Add one</button>
            {reminders.length ? (
              <button type="button" className="rm-btn" disabled={busy} onClick={() => send({ action: "clear" })}>Remove all</button>
            ) : null}
          </div>
        )
      ) : null}

      <style>{rmCss}</style>
    </section>
  );
}

const rmCss = [
  ".rm{display:flex;flex-direction:column;gap:9px;min-width:0}",
  ".rm-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}",
  ".rm-list li{display:flex;align-items:center;gap:9px;min-width:0}",
  ".rm-list li.is-sent{opacity:.55}",
  ".rm-text{display:flex;flex-direction:column;gap:1px;flex:1;min-width:0}",
  ".rm-when{font-size:13px}",
  ".rm-text small{font-size:11.5px;opacity:.65}",
  ".rm-by{font-size:10.5px;font-style:normal;text-transform:uppercase;letter-spacing:.05em;opacity:.5}",
  ".rm-date{font-size:13px;font-variant-numeric:tabular-nums}",
  ".rm input[type=date],.rm-add input{font:inherit;font-size:12.5px;padding:5px 7px;border-radius:7px;border:1px solid var(--border,#d5d8de);background:transparent;color:inherit;min-width:0}",
  ".rm-proposed{border:1px dashed var(--border,#d5d8de);border-radius:9px;padding:10px;display:flex;flex-direction:column;gap:7px}",
  ".rm-proposed > strong{font-size:12px;text-transform:uppercase;letter-spacing:.04em;opacity:.6}",
  ".rm-proposed ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}",
  ".rm-proposed li{display:grid;grid-template-columns:140px minmax(0,1fr) auto;gap:6px;align-items:center}",
  ".rm-proposed input{font:inherit;font-size:12.5px;padding:5px 7px;border-radius:7px;border:1px solid var(--border,#d5d8de);background:transparent;color:inherit;min-width:0}",
  ".rm-btn--ai{border-color:#7b68ee;color:#7b68ee}",
  ".rm-due{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600}",
  ".rm-due input{max-width:180px}",
  ".rm-actions,.rm-add{display:flex;gap:7px;flex-wrap:wrap;align-items:center}",
  ".rm-btn{border:1px solid var(--border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:12.5px;font-weight:600;padding:5px 10px;border-radius:7px;cursor:pointer;white-space:nowrap}",
  ".rm-btn--primary{background:#7b68ee;border-color:#7b68ee;color:#fff}",
  ".rm-btn:disabled{opacity:.55;cursor:default}",
  ".rm-x{border:0;background:none;color:inherit;opacity:.45;cursor:pointer;font-size:15px;line-height:1;padding:0 4px}",
  ".rm-x:hover{opacity:1;color:#d03b3b}",
  ".rm-note{margin:0;font-size:12.5px;padding:8px 10px;border-radius:8px;background:rgba(123,104,238,.12)}",
  ".rm-faint{margin:0;font-size:12.5px;opacity:.7;line-height:1.5}",
  "@media (max-width:640px){.rm-proposed li{grid-template-columns:minmax(0,1fr) auto;row-gap:5px}}"
].join("");
