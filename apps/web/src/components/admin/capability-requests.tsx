"use client";

import { useEffect, useState } from "react";

// What members asked the Hub to do that it could not. This is the backlog, written by the people using it
// rather than guessed at, and it only exists because the assistant says "not yet" instead of improvising.

interface RequestRow {
  id: string;
  request: string;
  interpretation: string | null;
  status: "OPEN" | "PLANNED" | "BUILT" | "DECLINED";
  note: string | null;
  askedBy: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<RequestRow["status"], string> = {
  OPEN: "Not looked at",
  PLANNED: "Going to build",
  BUILT: "Built",
  DECLINED: "Not doing"
};

export function CapabilityRequests() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/admin/capability-requests" + (showAll ? "?all=1" : ""))
      .then((response) => response.json() as Promise<{ requests?: RequestRow[] }>)
      .then((data) => { setRows(data.requests ?? []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [showAll]);

  async function review(id: string, status: RequestRow["status"]) {
    setBusy(id);
    try {
      const response = await fetch("/api/admin/capability-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status })
      });
      const data = (await response.json()) as { requests?: RequestRow[] };
      if (data.requests) setRows(showAll ? data.requests : data.requests.filter((row) => row.status === "OPEN" || row.status === "PLANNED"));
    } finally {
      setBusy(null);
    }
  }

  if (loaded && !rows.length && !showAll) return null;

  return (
    <section className="cr">
      <style>{crCss}</style>
      <div className="cr-head">
        <div>
          <h2>Asked for, but not possible yet</h2>
          <p>When the assistant cannot do something, it says so and records it here instead of building an approximation.</p>
        </div>
        <button type="button" className="cr-btn" onClick={() => setShowAll(!showAll)}>{showAll ? "Show open only" : "Show everything"}</button>
      </div>

      {rows.length ? (
        <ul className="cr-list">
          {rows.map((row) => (
            <li key={row.id}>
              <div className="cr-what">
                <strong>{row.interpretation || row.request}</strong>
                <small>
                  {row.askedBy ? row.askedBy + " · " : ""}
                  {new Date(row.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  {" · " + STATUS_LABEL[row.status]}
                </small>
                {row.interpretation && row.interpretation !== row.request ? <em>They said: “{row.request}”</em> : null}
              </div>
              <div className="cr-actions">
                <button type="button" className="cr-btn" disabled={busy === row.id} onClick={() => review(row.id, "PLANNED")}>Going to build</button>
                <button type="button" className="cr-btn" disabled={busy === row.id} onClick={() => review(row.id, "BUILT")}>Built</button>
                <button type="button" className="cr-btn" disabled={busy === row.id} onClick={() => review(row.id, "DECLINED")}>Not doing</button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="cr-empty">Nothing recorded. Either the Hub is doing what people ask, or nobody has asked it for something new.</p>
      )}
    </section>
  );
}

const crCss = [
  ".cr{border:1px solid var(--cu-border,#e4e6eb);border-radius:12px;padding:16px 18px;margin-bottom:16px;background:var(--cu-bg,#fff)}",
  "html[data-theme=dark] .cr{background:#222326;border-color:#3a3d44}",
  ".cr-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}",
  ".cr-head h2{margin:0;font-size:16px}.cr-head p{margin:4px 0 0;font-size:13.5px;line-height:1.5;color:var(--cu-muted,#656f7d);max-width:62ch}",
  ".cr-list{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:8px}",
  ".cr-list li{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:11px 13px;border:1px solid var(--cu-border,#e4e6eb);border-radius:10px}",
  "html[data-theme=dark] .cr-list li{border-color:#3a3d44}",
  ".cr-what{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}",
  ".cr-what strong{font-size:14px;line-height:1.45}",
  ".cr-what small{font-size:12px;color:var(--cu-muted,#656f7d)}",
  ".cr-what em{font-style:normal;font-size:12.5px;color:var(--cu-muted,#8b93a1);line-height:1.45}",
  ".cr-actions{display:flex;gap:6px;flex-wrap:wrap}",
  ".cr-btn{border:1px solid var(--cu-border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:12.5px;font-weight:600;padding:6px 11px;border-radius:7px;cursor:pointer;white-space:nowrap}",
  ".cr-btn:disabled{opacity:.55;cursor:default}",
  ".cr-empty{margin:12px 0 0;font-size:13.5px;color:var(--cu-muted,#656f7d);line-height:1.5}"
].join("");
