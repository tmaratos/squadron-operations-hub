"use client";

import { useState } from "react";
import type { MemberAddress } from "@/lib/notify/addresses";

// The member's own addresses, on the page where they already go to change what they are told about.
//
// The whole point is that this is theirs: add a personal address, a work one, switch the CAP address off if
// it forwards somewhere they never read. The server decides what is allowed - see lib/notify/addresses.ts -
// and this page says what the server said rather than guessing at the rules a second time, so the two can
// never drift into disagreeing about whether something worked.

export function AddressBook({ initial, canManage }: { initial: MemberAddress[]; canManage: boolean }) {
  const [addresses, setAddresses] = useState(initial);
  const [adding, setAdding] = useState("");
  const [label, setLabel] = useState("");
  const [awaiting, setAwaiting] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/notifications/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = (await response.json()) as { message?: string; addresses?: MemberAddress[]; awaitingCode?: string };
      if (data.addresses) setAddresses(data.addresses);
      setNote(data.message ?? null);
      return { ok: response.ok, awaitingCode: data.awaitingCode };
    } catch {
      setNote("That did not reach the Hub. Try again.");
      return { ok: false, awaitingCode: undefined };
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const result = await send({ action: "add", email: adding.trim(), label: label.trim() || null });
    if (result.ok && result.awaitingCode) {
      setAwaiting(result.awaitingCode);
      setAdding("");
      setLabel("");
    }
  }

  async function confirm() {
    if (!awaiting) return;
    const result = await send({ action: "confirm", email: awaiting, code: code.trim() });
    if (result.ok) {
      setAwaiting(null);
      setCode("");
    }
  }

  if (!canManage) {
    return (
      <section className="nab">
        <style>{nabCss}</style>
        <h2>Where we email you</h2>
        <p className="nab-lead">
          Your account is not linked to a CAPID yet, so there is no member record to hang addresses on. Ask a
          staff member to link it and this list will appear.
        </p>
      </section>
    );
  }

  const on = addresses.filter((address) => address.notify && address.verified).length;

  return (
    <section className="nab">
      <style>{nabCss}</style>
      <h2>Where we email you</h2>
      <p className="nab-lead">
        Add as many addresses as you like and switch each one on or off. Everything switched on gets the same
        email. {on === 1 ? "One address is on." : on + " addresses are on."}
      </p>

      <ul className="nab-list">
        {addresses.map((address) => (
          <li key={address.email} className={"nab-row" + (address.verified ? "" : " is-pending")}>
            <label className="nab-toggle">
              <input
                type="checkbox"
                checked={address.notify && address.verified}
                disabled={busy || !address.verified}
                onChange={(event) => send({ action: "notify", email: address.email, notify: event.target.checked })}
              />
              <span className="nab-who">
                <strong>{address.email}</strong>
                <small>
                  {address.kind === "CAP"
                    ? "Your CAP address"
                    // An address staff entered from the eServices roster is not one the member added, and
                    // saying so put words in their mouth about a setting they never touched.
                    : address.label || (address.addedByMember ? "Added by you" : "On file with CAP")}
                  {address.verified ? "" : " — not confirmed yet"}
                </small>
              </span>
            </label>
            <div className="nab-row-actions">
              {address.verified ? null : (
                <button type="button" className="nab-link" disabled={busy} onClick={() => setAwaiting(address.email)}>
                  Enter code
                </button>
              )}
              {address.removable ? (
                <button
                  type="button"
                  className="nab-remove"
                  disabled={busy}
                  aria-label={"Remove " + address.email}
                  onClick={() => send({ action: "remove", email: address.email })}
                >
                  ×
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {awaiting ? (
        <div className="nab-confirm">
          <p>
            We sent a six-digit code to <strong>{awaiting}</strong>. It is good for thirty minutes.
          </p>
          <div className="nab-fields">
            <input
              className="nab-input nab-input--code"
              value={code}
              inputMode="numeric"
              placeholder="000000"
              maxLength={6}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            />
            <button type="button" className="nab-btn" disabled={busy || code.length < 6} onClick={confirm}>
              {busy ? "Checking…" : "Confirm"}
            </button>
            <button type="button" className="nab-link" disabled={busy} onClick={() => { setAwaiting(null); setCode(""); }}>
              Not now
            </button>
          </div>
        </div>
      ) : (
        <div className="nab-add">
          <div className="nab-fields">
            <input
              className="nab-input"
              type="email"
              value={adding}
              placeholder="you@example.com"
              onChange={(event) => setAdding(event.target.value)}
            />
            <input
              className="nab-input nab-input--label"
              value={label}
              placeholder="Label (optional)"
              maxLength={40}
              onChange={(event) => setLabel(event.target.value)}
            />
            <button type="button" className="nab-btn" disabled={busy || adding.trim().length < 3} onClick={add}>
              {busy ? "Sending…" : "Add address"}
            </button>
          </div>
          <small className="nab-hint">We send a code there first, so a typo cannot send squadron mail to a stranger.</small>
        </div>
      )}

      {note ? <p className="nab-note" role="status">{note}</p> : null}
    </section>
  );
}

const nabCss = [
  ".nab{border:1px solid var(--cu-border,#e4e6eb);border-radius:12px;background:var(--cu-bg,#fff);padding:16px 18px}",
  "html[data-theme=dark] .nab{background:#222326;border-color:#3a3d44}",
  ".nab h2{margin:0 0 6px;font-size:17px}",
  ".nab-lead{margin:0;font-size:14.5px;line-height:1.6;max-width:70ch;color:var(--cu-muted,#656f7d)}",
  ".nab-list{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}",
  ".nab-row{display:flex;align-items:center;gap:10px;padding:11px 13px;border:1px solid var(--cu-border,#e4e6eb);border-radius:10px}",
  "html[data-theme=dark] .nab-row{border-color:#3a3d44}",
  ".nab-row.is-pending{border-style:dashed;opacity:.8}",
  ".nab-toggle{display:flex;align-items:center;gap:11px;flex:1;min-width:0;cursor:pointer}",
  ".nab-toggle input{width:20px;height:20px;flex:0 0 auto;accent-color:#7b68ee}",
  ".nab-who{display:flex;flex-direction:column;gap:2px;min-width:0}",
  ".nab-who strong{font-size:14.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".nab-who small{font-size:12.5px;color:var(--cu-muted,#656f7d)}",
  ".nab-row-actions{flex:0 0 auto;display:flex;align-items:center;gap:6px}",
  ".nab-remove{border:0;background:none;color:inherit;opacity:.35;font-size:19px;line-height:1;padding:4px 9px;cursor:pointer;border-radius:7px}",
  ".nab-remove:hover{opacity:1;color:#d03b3b}",
  ".nab-link{border:0;background:none;padding:0;color:#7b68ee;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;text-decoration:underline}",
  ".nab-add,.nab-confirm{margin-top:14px}",
  ".nab-confirm p{margin:0 0 9px;font-size:13.5px;line-height:1.55}",
  ".nab-fields{display:flex;gap:8px;flex-wrap:wrap;align-items:center}",
  ".nab-input{flex:1 1 200px;min-width:0;border:1px solid var(--cu-border,#e4e6eb);border-radius:9px;background:transparent;color:inherit;font:inherit;font-size:14px;padding:9px 11px}",
  ".nab-input--label{flex:0 1 150px}",
  ".nab-input--code{flex:0 0 120px;letter-spacing:3px;text-align:center;font-variant-numeric:tabular-nums}",
  "html[data-theme=dark] .nab-input{border-color:#3a3d44}",
  ".nab-btn{flex:0 0 auto;border:1px solid var(--cu-border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:13.5px;font-weight:600;padding:9px 15px;border-radius:9px;cursor:pointer}",
  ".nab-btn:disabled{opacity:.55;cursor:default}",
  ".nab-hint{display:block;margin-top:8px;font-size:12.5px;color:var(--cu-muted,#656f7d);line-height:1.5}",
  ".nab-note{margin:12px 0 0;font-size:13px;padding:9px 12px;border-radius:8px;background:rgba(123,104,238,.12)}",
  "@media (max-width:760px){.nab{padding:14px}.nab-input--label{flex:1 1 100%}}"
].join("");
