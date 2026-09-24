"use client";

import { useEffect, useState } from "react";

// Who holds what, how far along they are, and what the Hub would put in front of them next.

interface Member {
  capid: string;
  fullName: string;
  dutyPosition: string | null;
  positionSource: "SET" | "CHART" | null;
  chartPosition: string | null;
  ignoreSource: boolean;
  pdLevel: string | null;
  specialtyTrack: string | null;
  trackRating: string | null;
  hasAccount: boolean;
}

interface Step {
  id: string;
  fromLevel: string;
  toLevel: string;
  title: string;
  detail: string | null;
  sourceCitation: string | null;
  confidence: string;
}

const LEVELS = ["I", "II", "III", "IV", "V"];

export function DevelopmentBoard() {
  const [members, setMembers] = useState<Member[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [useChart, setUseChart] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [newStep, setNewStep] = useState({ fromLevel: "I", toLevel: "II", title: "", sourceCitation: "" });

  useEffect(() => {
    fetch("/api/development")
      .then((response) => response.json() as Promise<{ members?: Member[]; steps?: Step[]; canEdit?: boolean; useChart?: boolean }>)
      .then((data) => { setMembers(data.members ?? []); setSteps(data.steps ?? []); setCanEdit(Boolean(data.canEdit)); setUseChart(data.useChart !== false); })
      .catch(() => undefined);
  }, []);

  async function send(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setNote(null);
    try {
      const response = await fetch("/api/development", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await response.json()) as { members?: Member[]; steps?: Step[]; message?: string; useChart?: boolean };
      if (data.members) setMembers(data.members);
      if (data.steps) setSteps(data.steps);
      if (typeof data.useChart === "boolean") setUseChart(data.useChart);
      setNote(data.message ?? "Saved.");
    } catch {
      setNote("That could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  const known = members.filter((member) => member.pdLevel).length;
  const positioned = members.filter((member) => member.dutyPosition).length;

  return (
    <div className="dv">
      <style>{dvCss}</style>

      <section className="dv-card">
        <h2>What the Hub knows</h2>
        <p>
          <strong>{positioned} of {members.length}</strong> members have a duty position recorded, and{" "}
          <strong>{known}</strong> have a professional development level. CAP keeps both in eServices, and squadron
          accounts cannot read that automatically — so it comes from a paste or from you setting it here.
        </p>
        {canEdit ? (
          <div className="dv-actions">
            <button type="button" className="dv-btn" onClick={() => setShowPaste(!showPaste)}>{showPaste ? "Close" : "Paste duty positions"}</button>
            <label className="dv-switch">
              <input type="checkbox" checked={useChart} disabled={busy === "chart"} onChange={(event) => send({ action: "chart", use: event.target.checked }, "chart")} />
              <span>Use the staff records where nothing is set here</span>
            </label>
          </div>
        ) : null}
        {showPaste ? (
          <form className="dv-paste" onSubmit={(event) => { event.preventDefault(); send({ action: "positions", text: paste }, "positions"); setPaste(""); }}>
            <p>In eServices, open the unit&apos;s duty position listing, select the whole table and copy it. Paste it here — anything that is not a member line is ignored.</p>
            <textarea rows={6} value={paste} onChange={(event) => setPaste(event.target.value)} placeholder={"729204\tMaratos, Tristan\tInformation Technology Officer"} />
            <button type="submit" className="dv-btn dv-btn--primary" disabled={busy === "positions" || paste.trim().length < 5}>
              {busy === "positions" ? "Reading…" : "Read it"}
            </button>
          </form>
        ) : null}
      </section>

      <section className="dv-card">
        <h2>The ladder</h2>
        <p>
          What it takes to move up a level. The Hub will not invent these: a professional development
          requirement guessed by a model is a member sent down the wrong path for months. Add them from the
          regulation, and the Hub will put them in front of whoever is at that level.
        </p>
        {steps.length ? (
          <ul className="dv-steps">
            {steps.map((step) => (
              <li key={step.id}>
                <span>
                  <strong>Level {step.fromLevel} → {step.toLevel}:</strong> {step.title}
                  {step.sourceCitation ? <small>{step.sourceCitation}</small> : null}
                </span>
                {canEdit ? (
                  <button type="button" className="dv-btn" disabled={busy === step.id} onClick={() => send({ action: "removeStep", stepId: step.id }, step.id)}>Remove</button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="dv-empty">Nothing recorded yet, so the Hub has nothing to prompt anybody with.</p>
        )}

        {canEdit ? (
          <form className="dv-new" onSubmit={(event) => { event.preventDefault(); send({ action: "step", ...newStep }, "step"); setNewStep({ ...newStep, title: "", sourceCitation: "" }); }}>
            <label>From
              <select value={newStep.fromLevel} onChange={(event) => setNewStep({ ...newStep, fromLevel: event.target.value })}>
                {LEVELS.map((level) => <option key={level} value={level}>Level {level}</option>)}
              </select>
            </label>
            <label>To
              <select value={newStep.toLevel} onChange={(event) => setNewStep({ ...newStep, toLevel: event.target.value })}>
                {LEVELS.map((level) => <option key={level} value={level}>Level {level}</option>)}
              </select>
            </label>
            <label className="dv-grow">What has to be done
              <input value={newStep.title} maxLength={200} placeholder="Complete Officer Basic Course" onChange={(event) => setNewStep({ ...newStep, title: event.target.value })} />
            </label>
            <label className="dv-grow">Where it says so
              <input value={newStep.sourceCitation} maxLength={200} placeholder="CAPR 60-1, para 4.2" onChange={(event) => setNewStep({ ...newStep, sourceCitation: event.target.value })} />
            </label>
            <button type="submit" className="dv-btn dv-btn--primary" disabled={busy === "step" || newStep.title.trim().length < 3}>Add</button>
          </form>
        ) : null}
      </section>

      <section className="dv-card">
        <h2>Members</h2>
        <div className="dv-table">
          {members.map((member) => {
            const next = steps.filter((step) => step.confidence === "CONFIRMED" && step.fromLevel === member.pdLevel);
            return (
              <article key={member.capid}>
                <div className="dv-who">
                  <strong>{member.fullName}</strong>
                  <small>{member.capid}{member.hasAccount ? "" : " · no Hub account yet"}</small>
                </div>
                <div className="dv-pos">
                  <input
                    className="dv-input"
                    key={member.capid + ":" + (member.dutyPosition ?? "")}
                    defaultValue={member.dutyPosition ?? ""}
                    placeholder="Duty position"
                    disabled={!canEdit}
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      if (value !== (member.dutyPosition ?? "")) {
                        send({ action: "member", capid: member.capid, dutyPosition: value || null, clearPosition: !value }, member.capid);
                      }
                    }}
                  />
                  {member.positionSource === "CHART" ? (
                    <small className="dv-from">
                      From the staff records.
                      {canEdit ? (
                        <button type="button" className="dv-link" onClick={() => send({ action: "member", capid: member.capid, ignoreSource: true, clearPosition: true }, member.capid)}>Ignore it</button>
                      ) : null}
                    </small>
                  ) : member.ignoreSource && member.chartPosition ? (
                    <small className="dv-from">
                      Staff records say &ldquo;{member.chartPosition}&rdquo;, ignored.
                      {canEdit ? (
                        <button type="button" className="dv-link" onClick={() => send({ action: "member", capid: member.capid, ignoreSource: false }, member.capid)}>Use it again</button>
                      ) : null}
                    </small>
                  ) : member.positionSource === "SET" && member.chartPosition && member.chartPosition !== member.dutyPosition ? (
                    <small className="dv-from">Set here. Staff records say &ldquo;{member.chartPosition}&rdquo;.</small>
                  ) : null}
                </div>
                <select
                  className="dv-input dv-input--small"
                  defaultValue={member.pdLevel ?? ""}
                  disabled={!canEdit}
                  onChange={(event) => send({ action: "member", capid: member.capid, pdLevel: event.target.value || null }, member.capid)}
                >
                  <option value="">Level?</option>
                  {LEVELS.map((level) => <option key={level} value={level}>Level {level}</option>)}
                </select>
                <span className="dv-next">
                  {!member.pdLevel ? "Level not recorded"
                    : next.length ? next.length + " step" + (next.length === 1 ? "" : "s") + " to Level " + next[0].toLevel
                    : "Nothing recorded after Level " + member.pdLevel}
                </span>
                {canEdit && next.length ? (
                  <button type="button" className="dv-btn" disabled={busy === "prompt" + member.capid} onClick={() => send({ action: "prompt", capid: member.capid }, "prompt" + member.capid)}>
                    {busy === "prompt" + member.capid ? "Adding…" : "Put it on their list"}
                  </button>
                ) : <span />}
              </article>
            );
          })}
        </div>
      </section>

      {note ? <p className="dv-note" role="status">{note}</p> : null}
    </div>
  );
}

const dvCss = [
  ".dv{display:grid;gap:16px}",
  ".dv-card{border:1px solid var(--cu-border,#e4e6eb);border-radius:12px;padding:16px 18px;background:var(--cu-bg,#fff)}",
  "html[data-theme=dark] .dv-card{background:#222326;border-color:#3a3d44}",
  ".dv-card h2{margin:0 0 6px;font-size:16px}",
  ".dv-card>p{margin:0;font-size:13.5px;line-height:1.6;color:var(--cu-muted,#656f7d);max-width:74ch}",
  ".dv-actions{margin-top:12px;display:flex;gap:8px;flex-wrap:wrap}",
  ".dv-btn{border:1px solid var(--cu-border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:13.5px;font-weight:600;padding:8px 14px;border-radius:8px;cursor:pointer;white-space:nowrap}",
  ".dv-btn--primary{background:#7b68ee;border-color:#7b68ee;color:#fff}.dv-btn:disabled{opacity:.55;cursor:default}",
  ".dv-paste{margin-top:12px;display:grid;gap:9px}",
  ".dv-paste p{margin:0;font-size:13px;line-height:1.55;color:var(--cu-muted,#656f7d)}",
  ".dv-paste textarea{width:100%;box-sizing:border-box;font:13px/1.5 ui-monospace,Consolas,monospace;padding:10px;border-radius:9px;border:1px solid var(--cu-border,#d5d8de);resize:vertical}",
  ".dv-paste button{justify-self:end}",
  ".dv-steps{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:7px}",
  ".dv-steps li{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid var(--cu-border,#e4e6eb);border-radius:9px;font-size:13.5px;line-height:1.5}",
  "html[data-theme=dark] .dv-steps li{border-color:#3a3d44}",
  ".dv-steps small{display:block;font-size:12px;color:var(--cu-muted,#656f7d);margin-top:2px}",
  ".dv-new{margin-top:12px;display:flex;gap:9px;flex-wrap:wrap;align-items:flex-end}",
  ".dv-new label{display:flex;flex-direction:column;gap:4px;font-size:12.5px}",
  ".dv-new .dv-grow{flex:1 1 220px}",
  ".dv-new input,.dv-new select{font:inherit;font-size:13.5px;min-height:36px;padding:0 9px;border:1px solid var(--cu-border,#d5d8de);border-radius:8px;width:100%;box-sizing:border-box}",
  ".dv-table{margin-top:12px;display:grid;gap:7px}",
  ".dv-table article{display:grid;grid-template-columns:minmax(150px,1.3fr) minmax(140px,1.4fr) 110px minmax(150px,1fr) auto;gap:10px;align-items:center;padding:9px 11px;border:1px solid var(--cu-border,#e4e6eb);border-radius:9px}",
  "html[data-theme=dark] .dv-table article{border-color:#3a3d44}",
  ".dv-who{display:flex;flex-direction:column;min-width:0}",
  ".dv-who strong{font-size:13.5px}.dv-who small{font-size:11.5px;color:var(--cu-muted,#656f7d)}",
  ".dv-switch{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;cursor:pointer}",
  ".dv-switch input{width:16px;height:16px;accent-color:#7b68ee}",
  ".dv-pos{display:flex;flex-direction:column;gap:3px;min-width:0}",
  ".dv-from{font-size:11.5px;color:var(--cu-muted,#8b93a1);line-height:1.4}",
  ".dv-link{border:0;background:none;padding:0 0 0 5px;color:#7b68ee;font:inherit;font-size:11.5px;font-weight:600;cursor:pointer;text-decoration:underline}",
  ".dv-input{font:inherit;font-size:13px;min-height:34px;padding:0 9px;border:1px solid var(--cu-border,#d5d8de);border-radius:8px;width:100%;box-sizing:border-box}",
  ".dv-next{font-size:12.5px;color:var(--cu-muted,#656f7d);line-height:1.4}",
  ".dv-empty{margin:12px 0 0;font-size:13.5px;color:var(--cu-muted,#656f7d)}",
  ".dv-note{margin:0;font-size:13px;padding:10px 13px;border-radius:9px;background:rgba(123,104,238,.12)}",
  "@media (max-width:900px){.dv-table article{grid-template-columns:1fr 1fr;gap:8px}.dv-next{grid-column:1/-1}}"
].join("");
