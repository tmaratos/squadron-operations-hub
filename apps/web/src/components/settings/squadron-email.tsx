"use client";

import { useState } from "react";
import type { NotificationLevel } from "@/lib/notify/squadron-switch";

// The switch that stops the Hub emailing the squadron.
//
// Three choices rather than a toggle, because the difference between them is the thing worth getting right.
// Most of the time what somebody wants is the middle one: the automated nudges stop and a staff member can
// still reach people when it matters. "Nothing at all" is there because it was asked for, and it says plainly
// what it costs rather than letting somebody find out during the week they needed it.

export function SquadronEmail({
  initial,
  levels,
  canChange
}: {
  initial: NotificationLevel;
  levels: Array<{ value: NotificationLevel; label: string; detail: string }>;
  canChange: boolean;
}) {
  const [level, setLevel] = useState<NotificationLevel>(initial);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function choose(next: NotificationLevel) {
    if (next === level || busy) return;
    const before = level;
    setLevel(next);
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/settings/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: next })
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        // Put back, because a setting that looks changed and is not is worse than one that refused.
        setLevel(before);
        setNote(data.message ?? "That could not be saved.");
        return;
      }
      setNote(data.message ?? "Saved.");
    } catch {
      setLevel(before);
      setNote("That did not reach the Hub. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sqe">
      <style>{sqeCss}</style>
      <p className="sqe-lead">
        What the Hub sends to members by email. This is the whole squadron at once — a member who only wants
        less mail for themselves can switch their own off on their notifications page.
      </p>

      <div className="sqe-choices" role="radiogroup" aria-label="Squadron email">
        {levels.map((option) => (
          <label key={option.value} className={"sqe-choice" + (level === option.value ? " is-on" : "")}>
            <input
              type="radio"
              name="notify-level"
              checked={level === option.value}
              disabled={!canChange || busy}
              onChange={() => choose(option.value)}
            />
            <span>
              <strong>{option.label}</strong>
              <small>{option.detail}</small>
            </span>
          </label>
        ))}
      </div>

      {level !== "EVERYTHING" ? (
        <p className="sqe-warn">
          {level === "NOTHING"
            ? "Nothing is being emailed to anybody, including anything urgent a staff member sends. Members will only see things if they open the Hub."
            : "No automated email is going out. Members will only see reminders and deadlines if they open the Hub."}
        </p>
      ) : null}

      {!canChange ? <p className="sqe-note">Only command staff can change this.</p> : null}
      {note ? <p className="sqe-note" role="status">{note}</p> : null}
    </div>
  );
}

const sqeCss = [
  ".sqe-lead{margin:0;font-size:14px;line-height:1.6;color:var(--cu-muted,#656f7d);max-width:70ch}",
  ".sqe-choices{display:grid;gap:8px;margin-top:14px}",
  ".sqe-choice{display:flex;gap:11px;align-items:flex-start;padding:12px 13px;border:1px solid var(--cu-border,#e4e6eb);border-radius:10px;cursor:pointer}",
  "html[data-theme=dark] .sqe-choice{border-color:#3a3d44}",
  ".sqe-choice.is-on{border-color:#7b68ee;background:rgba(123,104,238,.07)}",
  ".sqe-choice input{width:18px;height:18px;margin-top:2px;flex:0 0 auto;accent-color:#7b68ee}",
  ".sqe-choice span{display:flex;flex-direction:column;gap:3px}",
  ".sqe-choice strong{font-size:14.5px}",
  ".sqe-choice small{font-size:13px;color:var(--cu-muted,#656f7d);line-height:1.5}",
  ".sqe-warn{margin:12px 0 0;font-size:13px;line-height:1.55;padding:10px 12px;border-radius:9px;background:rgba(229,154,0,.13);font-weight:600}",
  ".sqe-note{margin:11px 0 0;font-size:13px;padding:9px 12px;border-radius:8px;background:rgba(123,104,238,.12)}"
].join("");
