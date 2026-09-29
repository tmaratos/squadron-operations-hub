"use client";

import { useState } from "react";
import type { CapwatchStatus } from "@/lib/capwatch/capwatch";

// CAPWATCH, for the person whose job it is to keep it working.
//
// The password field is write-only: it is never filled in on load, never returned by the server, and the
// value is dropped from component state the moment it has been sent. What the page shows instead is whether
// a credential exists and when CAP last accepted it, which is the only fact that actually matters.

function when(value: string | null | undefined): string {
  if (!value) return "never";
  const at = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  if (Number.isNaN(at.getTime())) return value;
  return at.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const OUTCOME: Record<string, string> = {
  OK: "Working",
  AUTH_FAILED: "Authentication refused",
  DOWNLOAD_FAILED: "Download failed",
  BAD_ARCHIVE: "The download was unreadable",
  BLACKOUT: "Skipped: CAPWATCH was closed",
  ERROR: "Failed",
  RUNNING: "Running"
};

export function CapwatchCard({ status: initial, mayManage }: {
  status: CapwatchStatus;
  mayManage: boolean;
}) {
  const [status, setStatus] = useState(initial);
  const [capid, setCapid] = useState(initial.capid ?? "");
  const [password, setPassword] = useState("");
  const [replacing, setReplacing] = useState(!initial.configured);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function send(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setNote(null);
    try {
      const response = await fetch("/api/integrations/capwatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = (await response.json()) as { ok?: boolean; message?: string; status?: CapwatchStatus };
      if (data.status) setStatus(data.status);
      setNote(data.message ?? null);
      setFailed(!response.ok);
      if (response.ok) {
        // Gone from the browser the instant it has been used, whatever else happens.
        setPassword("");
        setReplacing(false);
      }
    } catch {
      setNote("That could not be done.");
      setFailed(true);
    } finally {
      setBusy(null);
      // Never leave a typed password sitting in state after a failed attempt either.
      if (body.action === "save") setPassword("");
    }
  }

  const authFailed = status.lastSync?.status === "AUTH_FAILED";

  return (
    <section className="cw">
      <style>{cwCss}</style>

      <div className="cw-head">
        <span className="cw-logo" aria-hidden="true">✈</span>
        <div>
          <h2>CAPWATCH</h2>
          <p>
            CAP&rsquo;s own record of the unit &mdash; who belongs to TN-170, their grade, duty positions and
            professional development. The Hub reads it on a schedule from its own server; nothing runs on
            anybody&rsquo;s computer.
          </p>
        </div>
        <span className={"cw-pill" + (status.configured ? (authFailed ? " is-bad" : " is-ok") : "")}>
          {status.configured ? (authFailed ? "Needs attention" : "Configured") : "Not configured"}
        </span>
      </div>

      {authFailed ? (
        <p className="cw-alert">
          CAPWATCH authentication failed. The authorised member has most likely changed their eServices
          password &mdash; replacing it below is all that is needed, and no code change is involved.
        </p>
      ) : null}

      <dl className="cw-facts">
        <div><dt>Authorised CAPID</dt><dd>{status.capid ?? (mayManage ? "none" : "hidden")}</dd></div>
        <div><dt>Unit (ORGID)</dt><dd>{status.orgId}</dd></div>
        <div><dt>Credential</dt><dd>{status.configured ? "Configured" : "Not configured"}</dd></div>
        <div><dt>Last updated</dt><dd>{when(status.credentialUpdatedAt)}</dd></div>
        <div><dt>CAP last accepted it</dt><dd>{when(status.lastAuthOkAt)}</dd></div>
        <div>
          <dt>Last run</dt>
          <dd>
            {status.lastSync ? (OUTCOME[status.lastSync.status] ?? status.lastSync.status) : "never"}
            {status.lastSync ? " · " + when(status.lastSync.startedAt) : ""}
            {status.lastSync?.membersSeen ? " · " + status.lastSync.membersSeen + " members" : ""}
          </dd>
        </div>
      </dl>

      {note ? <p className={"cw-note" + (failed ? " is-bad" : "")} role="status">{note}</p> : null}

      {mayManage ? (
        <>
          <div className="cw-actions">
            <button
              type="button"
              className="cw-btn"
              disabled={!status.configured || busy !== null}
              onClick={() => send({ action: "test" }, "test")}
            >
              {busy === "test" ? "Testing…" : "Test connection"}
            </button>
            {status.configured && !replacing ? (
              <button type="button" className="cw-btn" onClick={() => setReplacing(true)}>
                Replace credential
              </button>
            ) : null}
          </div>

          {replacing ? (
            <form
              className="cw-form"
              onSubmit={(event) => {
                event.preventDefault();
                send({ action: "save", capid: capid.trim(), password }, "save");
              }}
            >
              <label>
                <span>Authorised CAPID</span>
                <input
                  value={capid}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="729204"
                  onChange={(event) => setCapid(event.target.value)}
                />
              </label>
              <label>
                <span>eServices password</span>
                <input
                  type="password"
                  value={password}
                  autoComplete="new-password"
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <button type="submit" className="cw-btn cw-btn--primary" disabled={busy !== null || !password}>
                {busy === "save" ? "Checking with CAP…" : "Save and test"}
              </button>
              {status.configured ? (
                <button type="button" className="cw-btn" onClick={() => { setReplacing(false); setPassword(""); }}>
                  Cancel
                </button>
              ) : null}
              <p className="cw-fine">
                The password is checked against CAP before anything is stored, so a wrong one cannot cost you
                a working credential. It is never shown again, and never sent back to this page.
              </p>
            </form>
          ) : null}

          <p className="cw-fine">
            This is the authorised member&rsquo;s live eServices password, not a separate key, so it stops
            working whenever they change it. Whoever holds the CAPWATCH duty can replace it here.
          </p>
        </>
      ) : (
        <p className="cw-fine">
          Only the members who hold the CAPWATCH duty can change this. You are seeing whether it is working,
          which is what matters if the member directory looks out of date.
        </p>
      )}

      <p className="cw-fine cw-closed">
        CAP closes CAPWATCH between midnight and 02:30 Central every day. The Hub does not attempt a download
        in that window, so a run skipped overnight is not a fault.
      </p>
    </section>
  );
}

const cwCss = [
  ".cw{border:1px solid var(--cu-border,#e4e6eb);border-radius:12px;padding:16px 18px;display:flex;flex-direction:column;gap:11px;min-width:0}",
  "html[data-theme=dark] .cw{background:#222326;border-color:#3a3d44}",
  ".cw-head{display:flex;gap:11px;align-items:flex-start;flex-wrap:wrap}",
  ".cw-logo{flex:0 0 auto;width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:rgba(42,120,214,.12);font-size:15px}",
  ".cw-head h2{margin:0;font-size:15.5px}",
  ".cw-head p{margin:3px 0 0;font-size:12.5px;opacity:.75;line-height:1.5;max-width:62ch}",
  ".cw-head > div{flex:1;min-width:200px}",
  ".cw-pill{font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;border:1px solid var(--cu-border,#e4e6eb);white-space:nowrap;align-self:flex-start}",
  ".cw-pill.is-ok{background:rgba(12,163,12,.14);color:#0a7a0a;border-color:transparent}",
  ".cw-pill.is-bad{background:rgba(208,59,59,.14);color:#c03030;border-color:transparent}",
  ".cw-alert{margin:0;font-size:12.5px;line-height:1.5;padding:10px 12px;border-radius:9px;background:rgba(208,59,59,.1);border:1px solid rgba(208,59,59,.3)}",
  ".cw-facts{margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}",
  ".cw-facts div{display:flex;flex-direction:column;gap:1px;min-width:0}",
  ".cw-facts dt{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;opacity:.5}",
  ".cw-facts dd{margin:0;font-size:13px;overflow:hidden;text-overflow:ellipsis}",
  ".cw-note{margin:0;font-size:12.5px;line-height:1.5;padding:9px 12px;border-radius:8px;background:rgba(123,104,238,.12)}",
  ".cw-note.is-bad{background:rgba(208,59,59,.12)}",
  ".cw-actions{display:flex;gap:8px;flex-wrap:wrap}",
  ".cw-btn{border:1px solid var(--cu-border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:12.5px;font-weight:600;padding:8px 13px;border-radius:8px;cursor:pointer;white-space:nowrap}",
  ".cw-btn:disabled{opacity:.5;cursor:default}",
  ".cw-btn--primary{background:#7b68ee;border-color:#7b68ee;color:#fff}",
  ".cw-form{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;padding-top:10px;border-top:1px dashed var(--cu-border,#e4e6eb)}",
  ".cw-form label{display:flex;flex-direction:column;gap:3px;flex:1;min-width:180px}",
  ".cw-form label span{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;opacity:.55}",
  ".cw-form input{font:inherit;font-size:13px;padding:8px 10px;border-radius:8px;border:1px solid var(--cu-border,#e4e6eb);background:var(--cu-bg,#fff);color:inherit;min-width:0}",
  "html[data-theme=dark] .cw-form input{background:#2a2b2f;border-color:#3a3d44}",
  ".cw-fine{margin:0;font-size:11.5px;opacity:.65;line-height:1.5;flex:1 0 100%}",
  ".cw-closed{opacity:.55}"
].join("");
