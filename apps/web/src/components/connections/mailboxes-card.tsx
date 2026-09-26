"use client";

import { useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import type { MailAccount } from "@/lib/google/mail-accounts";

// Which mailboxes the Hub reads for this member.
//
// People keep squadron business in more than one: a CAP address and the personal one everybody actually
// writes to them on, and sometimes a third for an activity. Reading only the one they signed in with means
// the Hub sees part of the picture and says nothing about the rest, which reads as there being nothing
// there.
//
// The account somebody signed in with is listed but cannot be removed here - that one is how they get in,
// and taking it away from this page would be a surprising way to lose access.

export function MailboxesCard({ signedInAs, accounts: initial, microsoftReady = false }: {
  signedInAs: string;
  accounts: MailAccount[];
  /** False until an administrator has registered the Hub with Microsoft once. */
  microsoftReady?: boolean;
}) {
  const [accounts, setAccounts] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function remove(id: string, email: string) {
    setBusy(id);
    setNote(null);
    try {
      const response = await fetch("/api/google/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", id })
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message || "That could not be removed.");
      setAccounts(accounts.filter((account) => account.id !== id));
      setNote(email + " will not be read any more.");
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "That could not be removed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mb" aria-labelledby="mb-title">
      <div className="mb-head">
        <span className="mb-logo" aria-hidden="true">✉</span>
        <div>
          <h2 id="mb-title">Which mailboxes are read</h2>
          <p>
            Add any mailbox you keep squadron business in &mdash; Gmail, or Outlook, Hotmail and Office 365,
            which is what a CAP address runs on. Each one is read the same way, and only for suggesting work:
            nothing is ever sent from them, and nothing is deleted or moved.
          </p>
        </div>
      </div>

      <ul className="mb-list">
        <li>
          <span className="mb-text">
            <strong>{signedInAs}</strong>
            <small>The account you sign in with</small>
          </span>
          <span className="mb-tag">sign-in</span>
        </li>
        {accounts.map((account) => (
          <li key={account.id}>
            <span className="mb-text">
              <strong>{account.email}</strong>
              <small>
                {account.provider === "MICROSOFT" ? "Outlook or Microsoft 365" : "Gmail"}
                {" · added " + new Date(account.addedOn).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </small>
            </span>
            <ConfirmButton
              className="mb-btn mb-btn--danger"
              disabled={busy === account.id}
              question={"Stop reading " + account.email + "?"}
              onConfirm={() => remove(account.id, account.email)}
            >
              Remove
            </ConfirmButton>
          </li>
        ))}
      </ul>

      {note ? <p className="mb-note" role="status">{note}</p> : null}

      {/* Plain links, not fetches: these leave for the provider and come back to this page. */}
      <div className="mb-add">
        <a className="mb-btn mb-btn--primary" href="/api/auth/google/start?add=mailbox">Connect a Gmail mailbox</a>
        {microsoftReady ? (
          <a className="mb-btn mb-btn--primary" href="/api/auth/microsoft/start">Connect an Outlook or CAP mailbox</a>
        ) : (
          <span className="mb-fine">
            Outlook, Hotmail and CAP mailboxes need setting up once by an administrator before anybody can connect one.
          </span>
        )}
      </div>
      <p className="mb-fine">
        You will be asked which account to use. Pick a different one from the list &mdash; choosing the account you are
        already signed in with simply re-confirms the one you have.
      </p>

      <style>{mbCss}</style>
    </section>
  );
}

const mbCss = [
  ".mb{border:1px solid var(--cu-border,#e4e6eb);border-radius:12px;padding:16px 18px;display:flex;flex-direction:column;gap:11px;min-width:0}",
  "html[data-theme=dark] .mb{background:#222326;border-color:#3a3d44}",
  ".mb-head{display:flex;gap:11px;align-items:flex-start}",
  ".mb-logo{flex:0 0 auto;width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:rgba(42,120,214,.12);font-size:15px}",
  ".mb-head h2{margin:0;font-size:15.5px}",
  ".mb-head p{margin:3px 0 0;font-size:12.5px;opacity:.75;line-height:1.5}",
  ".mb-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}",
  ".mb-list li{display:flex;align-items:center;gap:10px;padding:9px 11px;border:1px solid var(--cu-border,#e4e6eb);border-radius:9px;min-width:0}",
  ".mb-text{display:flex;flex-direction:column;gap:1px;flex:1;min-width:0}",
  ".mb-text strong{font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".mb-text small{font-size:11.5px;opacity:.6}",
  ".mb-tag{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;opacity:.5;white-space:nowrap}",
  ".mb-btn{border:1px solid var(--cu-border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:12.5px;font-weight:600;padding:7px 12px;border-radius:8px;cursor:pointer;white-space:nowrap;text-decoration:none;align-self:flex-start;display:inline-block}",
  ".mb-btn--primary{background:#7b68ee;border-color:#7b68ee;color:#fff}",
  ".mb-btn--danger{color:#d03b3b}.mb-btn--danger:hover{border-color:#d03b3b}",
  ".mb-note{margin:0;font-size:12.5px;padding:8px 11px;border-radius:8px;background:rgba(123,104,238,.12)}",
  ".mb-add{display:flex;gap:8px;flex-wrap:wrap;align-items:center}",
  ".mb-fine{margin:0;font-size:11.5px;opacity:.6;line-height:1.5}"
].join("");
