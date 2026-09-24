"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Cadence, DutyOccurrence, RoleDuty } from "@/lib/work/duties";
import { ConfirmButton } from "@/components/confirm-button";

const CADENCE_LABELS: Record<Cadence, string> = {
  MONTHLY: "Every month",
  QUARTERLY: "Every three months",
  SEMIANNUAL: "Twice a year",
  ANNUAL: "Every year",
  EVERY_N_YEARS: "Every few years",
  ONE_TIME: "Once"
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function whenText(duty: RoleDuty): string {
  const base = CADENCE_LABELS[duty.cadence];
  if (duty.cadence === "ANNUAL" && duty.dueMonth) return base + ", by " + MONTHS[duty.dueMonth - 1] + " " + (duty.dueDay ?? 1);
  if (duty.cadence === "EVERY_N_YEARS") return "Every " + (duty.intervalYears ?? 1) + " years" + (duty.dueMonth ? ", in " + MONTHS[duty.dueMonth - 1] : "");
  if (duty.cadence === "MONTHLY" && duty.dueDay) return base + ", by day " + duty.dueDay;
  if (duty.cadence === "ONE_TIME" && duty.anchorDate) return "Once, on " + duty.anchorDate;
  return base;
}

function friendlyDate(value: string): string {
  return new Date(value + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function DutiesBoard({ duties, outlook, canEdit }: { duties: RoleDuty[]; outlook: DutyOccurrence[]; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ role: "", title: "", cadence: "ANNUAL" as Cadence, dueMonth: "", dueDay: "", intervalYears: "3", sourceCitation: "", detail: "" });

  async function call(body: Record<string, unknown>) {
    setBusy(true);
    setNote("");
    try {
      const response = await fetch("/api/work/duties", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(data.message || "That could not be saved.");
      router.refresh();
      return true;
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "That could not be saved.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const unverified = duties.filter((duty) => duty.confidence === "UNVERIFIED");
  const confirmed = duties.filter((duty) => duty.confidence === "CONFIRMED");
  const roles = Array.from(new Set(confirmed.map((duty) => duty.role))).sort();
  const years = Array.from(new Set(outlook.map((entry) => entry.dueOn.slice(0, 4)))).sort();

  async function submit() {
    const duty: Record<string, unknown> = {
      role: form.role.trim(),
      title: form.title.trim(),
      cadence: form.cadence,
      detail: form.detail.trim() || undefined,
      sourceCitation: form.sourceCitation.trim() || undefined
    };
    if (form.dueMonth) duty.dueMonth = Number(form.dueMonth);
    if (form.dueDay) duty.dueDay = Number(form.dueDay);
    if (form.cadence === "EVERY_N_YEARS" && form.intervalYears) duty.intervalYears = Number(form.intervalYears);
    const ok = await call({ action: "create", duty });
    if (ok) {
      setShowForm(false);
      setForm({ role: "", title: "", cadence: "ANNUAL", dueMonth: "", dueDay: "", intervalYears: "3", sourceCitation: "", detail: "" });
    }
  }

  return (
    <div className="dt">
      <style>{dtCss}</style>

      <div className="dt-intro">
        <p><strong>What each role has to do, and when.</strong> Every duty shows where the requirement comes from. A duty only counts once a person confirms it, so nothing here is taken on trust — one you add yourself counts immediately, because adding it is confirming it.</p>
        {canEdit ? <button type="button" className="dt-btn dt-btn--primary" onClick={() => setShowForm(!showForm)}>{showForm ? "Close" : "+ Add a duty"}</button> : null}
      </div>

      {note ? <p className="dt-note" role="status">{note}</p> : null}

      {showForm ? (
        <form className="dt-form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <label>Role<input value={form.role} placeholder="Finance Officer" maxLength={80} required onChange={(event) => setForm({ ...form, role: event.target.value })} /></label>
          <label>What has to be done<input value={form.title} placeholder="Send the CAPF 172 to Wing" maxLength={200} required onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <label>How often
            <select value={form.cadence} onChange={(event) => setForm({ ...form, cadence: event.target.value as Cadence })}>
              {(Object.keys(CADENCE_LABELS) as Cadence[]).map((key) => <option key={key} value={key}>{CADENCE_LABELS[key]}</option>)}
            </select>
          </label>
          {form.cadence === "EVERY_N_YEARS" ? (
            <label>Every how many years<input type="number" min={1} max={10} value={form.intervalYears} onChange={(event) => setForm({ ...form, intervalYears: event.target.value })} /></label>
          ) : null}
          <label>Month it is due
            <select value={form.dueMonth} onChange={(event) => setForm({ ...form, dueMonth: event.target.value })}>
              <option value="">Not set</option>
              {MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
            </select>
          </label>
          <label>Day of the month<input type="number" min={1} max={31} value={form.dueDay} placeholder="15" onChange={(event) => setForm({ ...form, dueDay: event.target.value })} /></label>
          <label className="dt-wide">Where this requirement comes from<input value={form.sourceCitation} placeholder="CAPR 173-1 para 9.c.(1)" maxLength={200} onChange={(event) => setForm({ ...form, sourceCitation: event.target.value })} /></label>
          <label className="dt-wide">Notes (optional)<textarea rows={2} value={form.detail} maxLength={2000} onChange={(event) => setForm({ ...form, detail: event.target.value })} /></label>
          <div className="dt-actions dt-wide">
            <button type="button" className="dt-btn" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className="dt-btn dt-btn--primary" disabled={busy || !form.role.trim() || !form.title.trim()}>{busy ? "Saving…" : "Add duty"}</button>
          </div>
        </form>
      ) : null}

      {unverified.length ? (
        <section className="dt-section dt-review">
          <h2>Waiting for someone to confirm <span className="dt-count">{unverified.length}</span></h2>
          <p className="dt-muted">These were proposed, usually from a regulation or an existing task. Confirm the ones that are right; reject the rest.</p>
          {unverified.map((duty) => (
            <article key={duty.id} className="dt-duty">
              <div className="dt-duty-main">
                <strong>{duty.title}</strong>
                <span className="dt-muted">{duty.role} · {whenText(duty)}</span>
                {duty.sourceCitation ? <span className="dt-source">Source: {duty.sourceCitation}</span> : <span className="dt-source dt-source--missing">No source recorded</span>}
                {duty.sourceQuote ? <span className="dt-quote">&ldquo;{duty.sourceQuote}&rdquo;</span> : null}
              </div>
              {canEdit ? (
                <div className="dt-duty-actions">
                  <button type="button" className="dt-btn dt-btn--primary" disabled={busy} onClick={() => call({ action: "confirm", dutyId: duty.id })}>Confirm</button>
                  <button type="button" className="dt-btn" disabled={busy} onClick={() => call({ action: "reject", dutyId: duty.id })}>Reject</button>
                </div>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}

      <section className="dt-section">
        <h2>Confirmed duties <span className="dt-count">{confirmed.length}</span></h2>
        {confirmed.length === 0 ? (
          // An empty catalogue is the reason nothing is being routed, so say so here rather than leaving
          // somebody to work out why the page is quiet.
          <p className="dt-muted">
            Nothing confirmed yet, so no duty is putting work on anybody&rsquo;s list. Add one above — what the role
            has to do, how often, and the regulation or squadron document it comes from — and it starts counting
            straight away. Reading a regulation below proposes duties instead, for someone to confirm.
          </p>
        ) : null}
        {roles.map((role) => (
          <div key={role} className="dt-role">
            <h3>{role}</h3>
            {confirmed.filter((duty) => duty.role === role).map((duty) => (
              <article key={duty.id} className="dt-duty">
                <div className="dt-duty-main">
                  <strong>{duty.title}</strong>
                  <span className="dt-muted">{whenText(duty)}</span>
                  {duty.sourceCitation ? <span className="dt-source">Source: {duty.sourceCitation}</span> : null}
                </div>
                {canEdit ? (
                  <div className="dt-duty-actions">
                    <ConfirmButton className="dt-btn" disabled={busy} onConfirm={() => call({ action: "delete", dutyId: duty.id })}>Delete</ConfirmButton>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ))}
      </section>

      <section className="dt-section">
        <h2>The next five years <span className="dt-count">{outlook.length}</span></h2>
        {outlook.length === 0 ? <p className="dt-muted">Once duties are confirmed, every date they fall due is worked out here.</p> : null}
        {years.map((year) => {
          const entries = outlook.filter((entry) => entry.dueOn.startsWith(year));
          return (
            <details key={year} className="dt-year" open={year === years[0]}>
              <summary>{year} <span className="dt-count">{entries.length}</span></summary>
              <ul>
                {entries.map((entry, index) => (
                  <li key={entry.dutyId + index}>
                    <span className="dt-when">{friendlyDate(entry.dueOn)}</span>
                    <span className="dt-what"><strong>{entry.role}</strong> — {entry.title}</span>
                    {entry.confidence === "UNVERIFIED" ? <span className="dt-flag">unconfirmed</span> : null}
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </section>
    </div>
  );
}

const dtCss = [
  ".dt{--dt-border:var(--cu-border,#e4e6eb);--dt-muted:var(--cu-muted,#656f7d);--dt-card:#fff;display:flex;flex-direction:column;gap:22px;max-width:1100px}",
  "html[data-theme=dark] .dt{--dt-card:#222326}",
  ".dt-intro{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:14px 16px;border-radius:12px;background:rgba(123,104,238,.1);border:1px solid rgba(123,104,238,.3)}",
  ".dt-intro p{margin:0;font-size:14px;line-height:1.55;max-width:70ch}",
  ".dt-note{margin:0;font-size:13px;color:#c03030}",
  ".dt-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;padding:16px;border:1px solid var(--dt-border);border-radius:12px;background:var(--dt-card)}",
  ".dt-form label{display:flex;flex-direction:column;gap:5px;font-size:13px}",
  ".dt-form input,.dt-form select,.dt-form textarea{font-size:14px;min-height:38px}",
  ".dt-wide{grid-column:1/-1}",
  ".dt-actions{display:flex;justify-content:flex-end;gap:8px}",
  ".dt-btn{border:1px solid var(--dt-border);background:var(--dt-card);color:inherit;font:inherit;font-size:14px;font-weight:600;padding:9px 16px;border-radius:8px;cursor:pointer;min-height:40px}",
  ".dt-btn--primary{background:#7b68ee;border-color:#7b68ee;color:#fff}.dt-btn:disabled{opacity:.55;cursor:default}",
  ".dt-section{display:flex;flex-direction:column;gap:10px}",
  ".dt-section h2{margin:0;font-size:17px}",
  ".dt-count{font-size:13px;color:var(--dt-muted);font-weight:500}",
  ".dt-muted{color:var(--dt-muted);font-size:13px;margin:0;line-height:1.5}",
  ".dt-review{padding:14px 16px;border:1px solid rgba(229,154,0,.45);border-radius:12px;background:rgba(229,154,0,.07)}",
  ".dt-role h3{margin:14px 0 6px;font-size:14px;color:var(--dt-muted);text-transform:uppercase;letter-spacing:.04em}",
  ".dt-duty{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:12px 14px;border:1px solid var(--dt-border);border-radius:10px;background:var(--dt-card)}",
  ".dt-duty-main{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1 1 320px}",
  ".dt-duty-main strong{font-size:14px}",
  ".dt-source{font-size:12px;color:var(--dt-muted)}",
  ".dt-source--missing{color:#c07000}",
  ".dt-quote{font-size:12px;font-style:italic;color:var(--dt-muted);border-left:2px solid var(--dt-border);padding-left:8px;margin-top:4px}",
  ".dt-duty-actions{display:flex;gap:8px;flex-wrap:wrap}",
  ".dt-year{border:1px solid var(--dt-border);border-radius:10px;background:var(--dt-card);padding:10px 14px}",
  ".dt-year summary{cursor:pointer;font-weight:600;font-size:15px}",
  ".dt-year ul{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}",
  ".dt-year li{display:grid;grid-template-columns:130px minmax(0,1fr) auto;gap:10px;align-items:baseline;font-size:13px;padding:4px 0;border-top:1px solid var(--dt-border)}",
  ".dt-when{color:var(--dt-muted);font-variant-numeric:tabular-nums}",
  ".dt-flag{font-size:11px;padding:1px 8px;border-radius:10px;background:rgba(229,154,0,.18);color:#8a5a00}",
  "html[data-theme=dark] .dt-flag{color:#f0b429}",
  "@media (max-width:760px){.dt-intro{flex-direction:column;align-items:flex-start}.dt-btn{width:100%}.dt-duty-actions{width:100%}.dt-duty-actions .dt-btn{flex:1}.dt-year li{grid-template-columns:minmax(0,1fr);gap:2px}.dt-when{font-size:12px}}"
].join("");
