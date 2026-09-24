"use client";

import { useEffect, useRef, useState } from "react";
import { PeoplePicker } from "./people-picker";
import type { ItemPriority } from "@/lib/work/types";

// Assigning somebody, and setting a priority, from wherever a task is shown.
//
// These are the two things changed most often and they used to need the task panel: open it, change one
// field, close it again. Both live in the row now, and because every list in the app shows tasks the same
// way, they are one component used in all of them rather than a picker bolted onto a single page.

export const PRIORITY_COLOR: Record<ItemPriority, string> = {
  URGENT: "#e5484d",
  HIGH: "#f5a623",
  NORMAL: "#5f55ee",
  LOW: "#87909e"
};

const LEVELS: ItemPriority[] = ["URGENT", "HIGH", "NORMAL", "LOW"];

export interface InlinePerson {
  id: string;
  fullName: string;
}

async function patchItem(itemId: string, body: Record<string, unknown>): Promise<boolean> {
  try {
    const response = await fetch("/api/work/items/" + encodeURIComponent(itemId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Closes the popover on a press outside it, or on Escape, and never on a press inside it. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

export function initialsOf(name: string): string {
  const parts = name.split(" ").filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

export function InlineAssignee({
  itemId,
  title,
  assignees,
  canEdit,
  onSaved
}: {
  itemId: string;
  title: string;
  assignees: InlinePerson[];
  canEdit: boolean;
  onSaved?: (assignees: InlinePerson[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(assignees);
  const ref = useDismiss(open, () => setOpen(false));

  useEffect(() => { setCurrent(assignees); }, [assignees]);

  async function save(next: InlinePerson[]) {
    setBusy(true);
    const ok = await patchItem(itemId, { assigneeIds: next.map((person) => person.id) });
    setBusy(false);
    setOpen(false);
    if (ok) {
      setCurrent(next);
      onSaved?.(next);
    }
  }

  return (
    <span className="ip" ref={ref} onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="ip-button"
        disabled={!canEdit || busy}
        title={current.length ? current.map((person) => person.fullName).join(", ") : "Assign somebody"}
        aria-label={"Assignee for " + title}
        onClick={() => setOpen((was) => !was)}
      >
        {current.length ? (
          <span className="ip-avatars">
            {current.slice(0, 3).map((person) => (
              <span key={person.id} className="ip-avatar" title={person.fullName}>{initialsOf(person.fullName)}</span>
            ))}
            {current.length > 3 ? <span className="ip-more">+{current.length - 3}</span> : null}
          </span>
        ) : (
          <span className="ip-nobody" aria-label="Unassigned">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <circle cx="8" cy="5.5" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
              <path d="M3 13.5c.8-2.4 2.7-3.6 5-3.6s4.2 1.2 5 3.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </span>
        )}
      </button>

      {open ? (
        <span className="ip-pop">
          {current.length ? (
            <span className="ip-current">
              {current.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  className="ip-chip"
                  title={"Take " + person.fullName + " off this"}
                  onClick={() => save(current.filter((entry) => entry.id !== person.id))}
                >
                  {person.fullName} ×
                </button>
              ))}
            </span>
          ) : null}
          <PeoplePicker
            excludeUserIds={current.map((person) => person.id)}
            onClose={() => setOpen(false)}
            onPick={(person) => save([...current, { id: person.userId, fullName: person.fullName }])}
          />
        </span>
      ) : null}
    </span>
  );
}

export function InlinePriority({
  itemId,
  title,
  priority,
  canEdit,
  onSaved
}: {
  itemId: string;
  title: string;
  priority: ItemPriority | null;
  canEdit: boolean;
  onSaved?: (priority: ItemPriority | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(priority);
  const ref = useDismiss(open, () => setOpen(false));

  useEffect(() => { setCurrent(priority); }, [priority]);

  async function save(next: ItemPriority | null) {
    setBusy(true);
    const ok = await patchItem(itemId, { priority: next });
    setBusy(false);
    setOpen(false);
    if (ok) {
      setCurrent(next);
      onSaved?.(next);
    }
  }

  return (
    <span className="ip" ref={ref} onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="ip-button"
        disabled={!canEdit || busy}
        title="Set priority"
        aria-label={"Priority for " + title}
        onClick={() => setOpen((was) => !was)}
      >
        {current ? (
          <span style={{ color: PRIORITY_COLOR[current] }}>⚑ <span className="ip-level">{current[0] + current.slice(1).toLowerCase()}</span></span>
        ) : (
          <span className="ip-faint">—</span>
        )}
      </button>

      {open ? (
        <span className="ip-pop ip-pop--narrow">
          {LEVELS.map((level) => (
            <button key={level} type="button" className="ip-item" style={{ color: PRIORITY_COLOR[level] }} onClick={() => save(level)}>
              ⚑ {level[0] + level.slice(1).toLowerCase()}
            </button>
          ))}
          <button type="button" className="ip-item ip-item--clear" onClick={() => save(null)}>No priority</button>
        </span>
      ) : null}
    </span>
  );
}

/** One stylesheet for both, rendered once by whatever page uses them. */
export const inlinePickerCss = [
  ".ip{position:relative;display:inline-flex;max-width:100%}",
  ".ip-button{display:inline-flex;align-items:center;gap:4px;border:0;background:none;color:inherit;font:inherit;font-size:inherit;padding:2px 6px;border-radius:6px;cursor:pointer;max-width:100%;min-height:26px}",
  ".ip-button:hover:not(:disabled){background:rgba(123,104,238,.14)}",
  ".ip-button:disabled{cursor:default}",
  ".ip-avatars{display:inline-flex;align-items:center}",
  ".ip-avatar{width:22px;height:22px;margin-right:-6px;border-radius:50%;background:#7b68ee;color:#fff;font-size:10px;font-weight:700;display:grid;place-items:center;border:2px solid var(--surface,#fff)}",
  ".ip-more{margin-left:10px;font-size:11px;opacity:.7}",
  ".ip-nobody{display:inline-flex;opacity:.45}",
  ".ip-faint{opacity:.45}",
  ".ip-pop{position:absolute;top:calc(100% + 4px);right:0;z-index:70;min-width:200px;display:flex;flex-direction:column;gap:2px;padding:6px;border-radius:10px;border:1px solid var(--border,#e4e6eb);background:var(--surface,#fff);box-shadow:0 16px 40px rgba(9,20,44,.24);text-align:left}",
  ".ip-pop--narrow{min-width:150px}",
  "html[data-theme=dark] .ip-pop{background:#26272b;border-color:#3a3c42}",
  "html[data-theme=dark] .ip-avatar{border-color:#26272b}",
  ".ip-item{border:0;background:none;font:inherit;font-size:13px;text-align:left;padding:7px 9px;border-radius:7px;cursor:pointer}",
  ".ip-item:hover{background:rgba(123,104,238,.14)}",
  ".ip-item--clear{color:var(--muted,#656f7d)}",
  ".ip-current{display:flex;flex-wrap:wrap;gap:4px;padding-bottom:6px;margin-bottom:4px;border-bottom:1px solid var(--border,#eef0f3)}",
  ".ip-chip{border:1px solid var(--border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:12px;padding:3px 7px;border-radius:99px;cursor:pointer}",
  ".ip-chip:hover{border-color:#d03b3b;color:#d03b3b}"
].join("");
