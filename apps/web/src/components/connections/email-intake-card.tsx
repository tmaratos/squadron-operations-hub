"use client";

import { useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";

// Forward an email to your own address and it becomes a task. No copying, no learning curve.
export function EmailIntakeCard({ address }: { address: string }) {
  const [current, setCurrent] = useState(address);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(current);
      setNote("Copied. Paste it into your email app's forwarding or To line.");
    } catch {
      setNote("Your browser would not let the Hub copy. Select the address and copy it yourself.");
    }
  }

  async function issueNew() {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/email-intake", { method: "POST" });
      const data = (await response.json()) as { address?: string; message?: string };
      if (!response.ok || !data.address) throw new Error(data.message || "A new address could not be issued.");
      setCurrent(data.address);
      setNote(data.message ?? "New address ready.");
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "A new address could not be issued.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ei" aria-labelledby="ei-title">
      <style>{eiCss}</style>
      <div className="ei-head">
        <span className="ei-logo" aria-hidden="true">✉</span>
        <div>
          <h2 id="ei-title">Turn email into a task</h2>
          <p>Forward any email to this address and it becomes a task in Command Intake, assigned to you. The subject becomes the task name.</p>
        </div>
      </div>
      <p className="ei-address"><code>{current}</code></p>
      <div className="ei-actions">
        <button type="button" className="ei-btn ei-btn--primary" onClick={copy}>Copy address</button>
        <ConfirmButton className="ei-btn" disabled={busy} question="The address you have now stops working. Sure?" onConfirm={issueNew}>{busy ? "Issuing…" : "Issue a new one"}</ConfirmButton>
      </div>
      {note ? <p className="ei-note" role="status">{note}</p> : null}
      <p className="ei-fine">Keep it to yourself: anyone who has it can create tasks in your name. Issuing a new address stops the old one working immediately.</p>
    </section>
  );
}

const eiCss = [
  ".ei{border:1px solid var(--cu-border,#e4e6eb);border-radius:12px;padding:16px 18px;background:var(--cu-bg,#fff)}",
  "html[data-theme=dark] .ei{background:#222326;border-color:#3a3d44}",
  ".ei-head{display:flex;gap:12px;align-items:flex-start}",
  ".ei-logo{flex:0 0 auto;width:34px;height:34px;border-radius:9px;background:#2a78d6;color:#fff;font-size:17px;display:flex;align-items:center;justify-content:center}",
  ".ei-head h2{margin:0;font-size:16px}",
  ".ei-head p{margin:4px 0 0;font-size:13.5px;line-height:1.5;color:var(--cu-muted,#656f7d);max-width:64ch}",
  ".ei-address{margin:14px 0 0}",
  ".ei-address code{display:block;overflow-x:auto;padding:10px 12px;border-radius:9px;background:rgba(42,120,214,.1);border:1px solid rgba(42,120,214,.28);font-size:15px;font-weight:600;white-space:nowrap}",
  ".ei-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}",
  ".ei-btn{border:1px solid var(--cu-border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:14px;font-weight:600;padding:9px 16px;border-radius:8px;cursor:pointer}",
  ".ei-btn--primary{background:#7b68ee;border-color:#7b68ee;color:#fff}.ei-btn:disabled{opacity:.6;cursor:default}",
  ".ei-note{margin:10px 0 0;font-size:13px;padding:9px 12px;border-radius:8px;background:rgba(12,163,12,.12);color:#0a7a0a}",
  "html[data-theme=dark] .ei-note{color:#7fdc7f}",
  ".ei-fine{margin:10px 0 0;font-size:12px;line-height:1.5;color:var(--cu-muted,#656f7d)}",
  "@media (max-width:760px){.ei-address code{font-size:13.5px}}"
].join("");
