"use client";

import { useEffect, useState } from "react";

// Two jobs, both copy-and-click: load the roster from eServices, and say who an unfamiliar address belongs to.

interface RosterRow { capid: string; fullName: string; memberType: string; hasAccount: boolean }
interface Unmatched { email: string; shownAs: string; suggestion: { capid: string; fullName: string } | null; capidNotOnRoster: string | null }
interface State { roster: RosterRow[]; unmatched: Unmatched[]; driveNote: string | null; message?: string }

export function RosterManager() {
  const [data, setData] = useState<State | null>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/admin/roster")
      .then((response) => response.json() as Promise<State & { message?: string }>)
      .then((result) => setData(result))
      .catch(() => setNote({ ok: false, text: "The roster could not be read." }));
  }, []);

  async function send(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setNote(null);
    try {
      const response = await fetch("/api/admin/roster", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = (await response.json()) as State & { message?: string };
      if (!response.ok) throw new Error(result.message || "That did not work.");
      setData(result);
      setNote({ ok: true, text: result.message ?? "Saved." });
      return true;
    } catch (caught) {
      setNote({ ok: false, text: caught instanceof Error ? caught.message : "That did not work." });
      return false;
    } finally {
      setBusy(null);
    }
  }

  const roster = data?.roster ?? [];
  const unmatched = data?.unmatched ?? [];

  return (
    <section className="rm">
      <style>{rmCss}</style>
      <div className="rm-head">
        <div>
          <h2>Squadron roster</h2>
          <p>
            {roster.length
              ? roster.length + " members loaded. Names in the Hub come from here, matched on CAPID."
              : "Not loaded yet. Until it is, people show up however Google names them — sometimes just a number."}
          </p>
        </div>
        <button type="button" className="rm-btn rm-btn--primary" onClick={() => setOpen(!open)}>{open ? "Close" : roster.length ? "Update from eServices" : "Load from eServices"}</button>
      </div>

      {open ? (
        <form className="rm-form" onSubmit={async (event) => { event.preventDefault(); if (await send({ action: "import", text }, "import")) { setText(""); setOpen(false); } }}>
          <ol className="rm-steps">
            <li>In eServices, open <strong>Personnel → Member Email Addresses</strong> for TN-170.</li>
            <li>Select the whole list (drag across it, or press Ctrl+A) and copy it.</li>
            <li>Paste it below. Everything that is not a member line is ignored, so do not worry about tidying it.</li>
          </ol>
          <textarea value={text} onChange={(event) => setText(event.target.value)} rows={7} placeholder={"362254\tMaj Lemont T Adrian\n249023\t1st Lt Ernest E Burchell\n…"} aria-label="Roster text" />
          <div className="rm-actions">
            <button type="submit" className="rm-btn rm-btn--primary" disabled={busy === "import" || text.trim().length < 5}>{busy === "import" ? "Loading…" : "Load roster"}</button>
          </div>
        </form>
      ) : null}

      {note ? <p className={"rm-note " + (note.ok ? "is-ok" : "is-bad")} role="status">{note.text}</p> : null}

      {roster.length && unmatched.length ? (
        <div className="rm-unmatched">
          <h3>Who are these? ({unmatched.length})</h3>
          <p>These addresses can see the squadron Drive but are not tied to anyone on the roster, so the Hub cannot show a name. Pick the member each one belongs to. Leave any you are unsure of.</p>
          <ul>
            {unmatched.map((row) => {
              const chosen = choices[row.email] ?? row.suggestion?.capid ?? "";
              return (
                <li key={row.email}>
                  <div className="rm-addr">
                    <strong>{row.email}</strong>
                    <small>
                      {row.capidNotOnRoster
                        ? "CAPID " + row.capidNotOnRoster + " is not on the senior roster — probably a cadet or another unit."
                        : row.suggestion ? "Looks like it could be " + row.suggestion.fullName + ". Check before saving." : "Shown as “" + row.shownAs + "”."}
                    </small>
                  </div>
                  {row.capidNotOnRoster ? null : (
                    <div className="rm-pick">
                      <select value={chosen} onChange={(event) => setChoices({ ...choices, [row.email]: event.target.value })} aria-label={"Member for " + row.email}>
                        <option value="">Choose a member…</option>
                        {roster.map((member) => <option key={member.capid} value={member.capid}>{member.fullName} ({member.capid})</option>)}
                      </select>
                      <button type="button" className="rm-btn" disabled={!chosen || busy === row.email} onClick={() => send({ action: "link", email: row.email, capid: chosen }, row.email)}>
                        {busy === row.email ? "Saving…" : "This is them"}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {data?.driveNote ? <p className="rm-fine">{data.driveNote}</p> : null}
    </section>
  );
}

const rmCss = [
  ".rm{border:1px solid var(--cu-border,#e4e6eb);border-radius:12px;padding:16px 18px;margin-bottom:16px;background:var(--cu-bg,#fff)}",
  "html[data-theme=dark] .rm{background:#222326;border-color:#3a3d44}",
  ".rm-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}",
  ".rm-head h2{margin:0;font-size:16px}.rm-head p{margin:4px 0 0;font-size:13.5px;line-height:1.5;color:var(--cu-muted,#656f7d);max-width:62ch}",
  ".rm-form{margin-top:14px;display:grid;gap:10px}",
  ".rm-steps{margin:0;padding-left:20px;font-size:13.5px;line-height:1.6}",
  ".rm-form textarea{width:100%;box-sizing:border-box;font:13px/1.5 ui-monospace,Consolas,monospace;padding:10px;border-radius:8px;border:1px solid var(--cu-border,#d5d8de);resize:vertical}",
  ".rm-actions{display:flex;justify-content:flex-end}",
  ".rm-btn{border:1px solid var(--cu-border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:14px;font-weight:600;padding:9px 16px;border-radius:8px;cursor:pointer;white-space:nowrap}",
  ".rm-btn--primary{background:#7b68ee;border-color:#7b68ee;color:#fff}.rm-btn:disabled{opacity:.55;cursor:default}",
  ".rm-note{margin:12px 0 0;font-size:13px;padding:9px 12px;border-radius:8px}",
  ".rm-note.is-ok{background:rgba(12,163,12,.12);color:#0a7a0a}.rm-note.is-bad{background:rgba(208,59,59,.12);color:#c03030}",
  "html[data-theme=dark] .rm-note.is-ok{color:#7fdc7f}html[data-theme=dark] .rm-note.is-bad{color:#f5a9a9}",
  ".rm-unmatched{margin-top:16px;padding-top:14px;border-top:1px solid var(--cu-border,#eef0f3)}",
  ".rm-unmatched h3{margin:0;font-size:14.5px}.rm-unmatched>p{margin:4px 0 10px;font-size:13px;line-height:1.5;color:var(--cu-muted,#656f7d)}",
  ".rm-unmatched ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}",
  ".rm-unmatched li{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:10px 12px;border:1px solid var(--cu-border,#e4e6eb);border-radius:10px}",
  "html[data-theme=dark] .rm-unmatched li{border-color:#3a3d44}",
  ".rm-addr{display:flex;flex-direction:column;gap:2px;min-width:0}",
  ".rm-addr strong{font-size:13.5px;word-break:break-all}.rm-addr small{font-size:12.5px;color:var(--cu-muted,#656f7d)}",
  ".rm-pick{display:flex;gap:8px;flex-wrap:wrap}",
  ".rm-pick select{font:inherit;font-size:13.5px;min-height:36px;border-radius:8px;max-width:260px}",
  ".rm-fine{margin:12px 0 0;font-size:12px;color:var(--cu-muted,#656f7d)}"
].join("");
