"use client";

import { useState } from "react";
import type { Control, ControlSummary } from "@/lib/security/attestation";

// The attestation, as the system currently stands.
//
// Three states and no fourth. Passing means the Hub checked and it held. Failing means it checked and it did
// not. Needs a person means it cannot be checked from in here at all, which is said plainly rather than
// quietly counted as a pass - a page that marks a laptop's disk encryption green because somebody typed it
// into a form once is worse than having no page.

const LABEL: Record<Control["state"], string> = {
  PASS: "Holding",
  FAIL: "Not holding",
  NEEDS_PERSON: "Needs a person"
};

export function SecurityControls({ initial }: { initial: ControlSummary }) {
  const [summary, setSummary] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function recheck() {
    setBusy(true);
    try {
      const response = await fetch("/api/security", { cache: "no-store" });
      if (response.ok) setSummary((await response.json()) as ControlSummary);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sc">
      <div className="sc-head">
        <p className="sc-count">
          <strong>{summary.passing} holding</strong>
          {summary.failing ? <span className="sc-bad"> · {summary.failing} not holding</span> : null}
          {summary.needsPerson ? <span className="sc-warn"> · {summary.needsPerson} need a person</span> : null}
        </p>
        <button type="button" className="sc-btn" onClick={recheck} disabled={busy}>{busy ? "Checking…" : "Check now"}</button>
      </div>
      <p className="sc-when">Last checked {new Date(summary.checkedAt).toLocaleString()}. Checked again every night, and whenever this page is opened.</p>

      <ul className="sc-list">
        {summary.controls.map((control) => (
          <li key={control.key} className={"sc-item sc-item--" + control.state.toLowerCase()}>
            <div className="sc-item-head">
              <strong>{control.question}</strong>
              <span className={"sc-tag sc-tag--" + control.state.toLowerCase()}>{LABEL[control.state]}</span>
            </div>
            <p className="sc-evidence">{control.evidence}</p>
            {control.remedy ? <p className="sc-remedy">{control.remedy}</p> : null}
          </li>
        ))}
      </ul>

      <style>{scCss}</style>
    </div>
  );
}

const scCss = [
  ".sc{display:flex;flex-direction:column;gap:10px;min-width:0}",
  ".sc-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}",
  ".sc-count{margin:0;font-size:14px}",
  ".sc-bad{color:#d03b3b;font-weight:600}",
  ".sc-warn{color:#d9932b;font-weight:600}",
  ".sc-when{margin:0;font-size:12px;opacity:.6}",
  ".sc-btn{border:1px solid var(--cu-border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:12.5px;font-weight:600;padding:6px 12px;border-radius:8px;cursor:pointer}",
  ".sc-list{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}",
  ".sc-item{border:1px solid var(--cu-border,#e4e6eb);border-left-width:3px;border-radius:9px;padding:11px 13px;display:flex;flex-direction:column;gap:5px;min-width:0}",
  ".sc-item--pass{border-left-color:#2ea060}",
  ".sc-item--fail{border-left-color:#d03b3b;background:rgba(208,59,59,.06)}",
  ".sc-item--needs_person{border-left-color:#d9932b}",
  ".sc-item-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap}",
  ".sc-item-head strong{font-size:13.5px}",
  ".sc-tag{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:2px 8px;border-radius:999px;white-space:nowrap;background:rgba(127,127,127,.15)}",
  ".sc-tag--pass{background:rgba(46,160,96,.18);color:#2ea060}",
  ".sc-tag--fail{background:rgba(208,59,59,.18);color:#d03b3b}",
  ".sc-tag--needs_person{background:rgba(217,147,43,.18);color:#d9932b}",
  ".sc-evidence{margin:0;font-size:12.5px;line-height:1.5;opacity:.85}",
  ".sc-remedy{margin:0;font-size:12.5px;line-height:1.5;font-weight:600}"
].join("");
