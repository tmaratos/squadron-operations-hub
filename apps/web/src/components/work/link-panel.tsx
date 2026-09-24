"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import type { Contradiction, ItemLink } from "@/lib/work/links";

// What a task waits on, what waits on it, and what else bears on it.
//
// The squadron was writing these into task titles in capitals, where nothing could check them and nothing
// noticed when a date moved. Recorded properly, the same facts can be contradicted by arithmetic.

const LABELS: Record<ItemLink["direction"], string> = {
  blockedBy: "Waiting on",
  blocking: "Holding up",
  related: "Bears on"
};

export function LinkPanel({ itemId, title, canEdit, onOpen }: {
  itemId: string;
  title: string;
  canEdit: boolean;
  onOpen: (id: string) => void;
}) {
  const [links, setLinks] = useState<ItemLink[]>([]);
  const [problems, setProblems] = useState<Contradiction[]>([]);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: string; title: string; listName: string }>>([]);
  const [kind, setKind] = useState<"blockedBy" | "blocking" | "related">("blockedBy");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/work/links?checks=1&item=" + encodeURIComponent(itemId));
      const data = (await response.json()) as { links?: ItemLink[]; contradictions?: Contradiction[] };
      setLinks(data.links ?? []);
      // Only the ones naming this task. A contradiction elsewhere is not this panel's business.
      setProblems((data.contradictions ?? []).filter((problem) => problem.itemIds.includes(itemId)));
    } catch {
      // A panel that cannot reach the server shows what it has, rather than an error nobody can act on.
    }
  }, [itemId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!adding || query.trim().length < 2) { setResults([]); return; }
    const timer = window.setTimeout(() => {
      fetch("/api/work/search?q=" + encodeURIComponent(query.trim()))
        .then((response) => response.json() as Promise<{ tasks?: Array<{ id: string; title: string; listName: string }> }>)
        .then((data) => setResults((data.tasks ?? []).filter((entry) => entry.id !== itemId).slice(0, 6)))
        .catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [adding, query, itemId]);

  async function link(otherId: string) {
    setBusy(true);
    try {
      // "Waiting on" is the same fact as the other task blocking this one, recorded the way round it reads.
      const body = kind === "blockedBy"
        ? { action: "add", fromItemId: otherId, toItemId: itemId, kind: "BLOCKS" }
        : kind === "blocking"
          ? { action: "add", fromItemId: itemId, toItemId: otherId, kind: "BLOCKS" }
          : { action: "add", fromItemId: itemId, toItemId: otherId, kind: "RELATES" };
      await fetch("/api/work/links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setAdding(false);
      setQuery("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function unlink(linkId: string) {
    setBusy(true);
    try {
      await fetch("/api/work/links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove", linkId }) });
      await load();
    } finally {
      setBusy(false);
    }
  }

  const groups: Array<ItemLink["direction"]> = ["blockedBy", "blocking", "related"];

  return (
    <div className="lk">
      <style>{lkCss}</style>

      {problems.map((problem, index) => (
        <p key={index} className="lk-problem" role="status">
          <strong>This does not add up.</strong> {problem.text}
        </p>
      ))}

      {groups.map((direction) => {
        const mine = links.filter((entry) => entry.direction === direction);
        if (!mine.length) return null;
        return (
          <div key={direction} className="lk-group">
            <span className="lk-label">{LABELS[direction]}</span>
            <ul>
              {mine.map((entry) => (
                <li key={entry.id}>
                  <button type="button" className={"lk-item" + (entry.otherClosed ? " is-done" : "")} onClick={() => onOpen(entry.otherId)}>
                    <span className="lk-dot" data-done={entry.otherClosed ? "yes" : "no"} />
                    <span className="lk-title">{entry.otherTitle}</span>
                    <span className="lk-meta">{entry.otherListName}{entry.otherDueOn ? " · " + entry.otherDueOn : ""}</span>
                  </button>
                  {canEdit ? (
                    <ConfirmButton className="lk-x" question="Remove this link?" disabled={busy} onConfirm={() => unlink(entry.id)} ariaLabel="Remove link">
                      &times;
                    </ConfirmButton>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {!links.length ? <p className="lk-empty">Nothing recorded. If this waits on something, say so here rather than in its name.</p> : null}

      {canEdit ? (
        adding ? (
          <div className="lk-add">
            <div className="lk-kind">
              {groups.map((direction) => (
                <button key={direction} type="button" className={kind === direction ? "is-on" : ""} onClick={() => setKind(direction)}>
                  {LABELS[direction]}
                </button>
              ))}
            </div>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={"Which task does this " + LABELS[kind].toLowerCase() + "?"}
              aria-label={"Find a task this " + LABELS[kind].toLowerCase()}
              autoFocus
            />
            <ul className="lk-results">
              {results.map((entry) => (
                <li key={entry.id}>
                  <button type="button" disabled={busy} onClick={() => link(entry.id)}>
                    <span className="lk-title">{entry.title}</span>
                    <span className="lk-meta">{entry.listName}</span>
                  </button>
                </li>
              ))}
              {query.trim().length >= 2 && !results.length ? <li className="lk-none">Nothing matches.</li> : null}
            </ul>
            <button type="button" className="lk-cancel" onClick={() => { setAdding(false); setQuery(""); }}>Cancel</button>
          </div>
        ) : (
          <button type="button" className="lk-open" onClick={() => setAdding(true)}>+ Link another task</button>
        )
      ) : null}
    </div>
  );
}

const lkCss = [
  ".lk{display:flex;flex-direction:column;gap:8px;padding:0 4px}",
  ".lk-problem{margin:0;font-size:12.5px;line-height:1.5;padding:9px 11px;border-radius:8px;background:rgba(229,72,77,.12);border:1px solid rgba(229,72,77,.35)}",
  ".lk-group{display:flex;flex-direction:column;gap:3px}",
  ".lk-label{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;opacity:.55}",
  ".lk-group ul,.lk-results{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}",
  ".lk-group li{display:flex;align-items:center;gap:4px}",
  ".lk-item{flex:1;min-width:0;display:flex;align-items:center;gap:8px;border:0;background:none;color:inherit;font:inherit;font-size:13px;text-align:left;padding:5px 7px;border-radius:7px;cursor:pointer}",
  ".lk-item:hover{background:rgba(123,104,238,.12)}",
  ".lk-item.is-done .lk-title{text-decoration:line-through;opacity:.6}",
  ".lk-dot{width:7px;height:7px;border-radius:50%;flex:none;background:#f5a623}",
  ".lk-dot[data-done=yes]{background:#2ecc71}",
  ".lk-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".lk-meta{font-size:11px;opacity:.55;flex:none}",
  ".lk-x{border:0;background:none;color:inherit;opacity:.4;cursor:pointer;font-size:15px;padding:0 4px;border-radius:5px}",
  ".lk-x:hover{opacity:1;color:#d03b3b}",
  ".lk-empty{margin:0;font-size:12.5px;opacity:.6}",
  ".lk-open,.lk-cancel{align-self:flex-start;border:0;background:none;color:var(--tp-muted,#656f7d);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;padding:4px 0}",
  ".lk-open:hover{color:#7b68ee}",
  ".lk-add{display:flex;flex-direction:column;gap:6px}",
  ".lk-kind{display:flex;gap:4px}",
  ".lk-kind button{border:1px solid var(--tp-border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:11.5px;font-weight:600;padding:4px 9px;border-radius:999px;cursor:pointer}",
  ".lk-kind button.is-on{background:#7b68ee;border-color:#7b68ee;color:#fff}",
  ".lk-add input{font:inherit;font-size:13px;padding:6px 9px;border-radius:7px;border:1px solid var(--tp-border,#d5d8de);background:transparent;color:inherit}",
  ".lk-results button{width:100%;display:flex;align-items:center;gap:8px;border:0;background:none;color:inherit;font:inherit;font-size:13px;text-align:left;padding:6px 8px;border-radius:7px;cursor:pointer}",
  ".lk-results button:hover{background:rgba(123,104,238,.12)}",
  ".lk-none{font-size:12.5px;opacity:.55;padding:4px 8px}"
].join("");
