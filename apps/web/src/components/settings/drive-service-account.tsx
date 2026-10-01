"use client";

import { useEffect, useState } from "react";

// Giving the Hub its own key to the squadron's documents.
//
// Until this is set, every Drive call runs on whoever happens to be signed in - so the squadron's files are
// reachable only while that person's Google account still works, and the whole thing stops the day they leave
// the unit. A service account belongs to no one, which is the point.
//
// The key is pasted once and never shown again. It is not like a password that can be reset by the person who
// owns it: a service account key does not expire, so a leaked one works until somebody notices and revokes it
// in Google Cloud. So the box empties the moment it is saved, and nothing here ever reads it back.

interface Status {
  configured: boolean;
  clientEmail: string | null;
  projectId: string | null;
  updatedAt: string | null;
  lastOkAt?: string | null;
  lastError?: string | null;
}

export function DriveServiceAccount({ driveId }: { driveId: string | null }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [mayManage, setMayManage] = useState(false);
  const [key, setKey] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/integrations/drive")
      .then((response) => response.json() as Promise<{ status?: Status; mayManage?: boolean }>)
      .then((data) => {
        setStatus(data.status ?? null);
        setMayManage(Boolean(data.mayManage));
      })
      .catch(() => undefined);
  }, []);

  async function send(body: Record<string, unknown>, which: string) {
    setBusy(which);
    setNote(null);
    try {
      const response = await fetch("/api/integrations/drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = (await response.json()) as { message?: string; status?: Status };
      if (data.status) setStatus(data.status);
      setNote(data.message ?? (response.ok ? "Done." : "That did not work."));
      // Emptied whether or not it saved. A key left sitting in a textarea is a key in the page for anybody
      // who walks past, and retyping it is a smaller cost than that.
      if (which === "save") setKey("");
    } catch {
      setNote("That did not reach the Hub. Try again.");
    } finally {
      setBusy(null);
    }
  }

  if (!mayManage) {
    return (
      <p className="dsa-lead">
        {status?.configured
          ? "The Hub has its own key to the squadron's documents."
          : "The Hub does not have its own key to the squadron's documents yet."}{" "}
        Only command staff can change this.
      </p>
    );
  }

  return (
    <div className="dsa">
      <style>{dsaCss}</style>

      <p className="dsa-lead">
        With this set, the Hub reads the squadron&apos;s documents as itself rather than as whoever is signed
        in — so Drive keeps working when people come and go, and nobody needs a CAP Google account for the
        Hub to find a regulation.
      </p>

      {status?.configured ? (
        <div className="dsa-state">
          <p>
            <strong>Configured.</strong>{" "}
            {status.lastOkAt
              ? "Last worked " + new Date(status.lastOkAt).toLocaleString() + "."
              : "Not yet proven against the Shared Drive — press Test below."}
          </p>
          {status.clientEmail ? (
            <p className="dsa-who">
              Acting as <code>{status.clientEmail}</code>
            </p>
          ) : null}
          {status.lastError ? <p className="dsa-bad">Last error: {status.lastError}</p> : null}
        </div>
      ) : (
        <div className="dsa-state dsa-state--none">
          <p><strong>Not set.</strong> Drive still depends on a signed-in member&apos;s Google account.</p>
        </div>
      )}

      {status?.clientEmail && driveId ? (
        <ol className="dsa-steps">
          <li>
            Open the Shared Drive, then <strong>Manage members</strong>.
          </li>
          <li>
            Add <code>{status.clientEmail}</code> as <strong>Content manager</strong>.
          </li>
          <li>Press Test below. It will say what it can see.</li>
        </ol>
      ) : null}

      <label className="dsa-field">
        <span>{status?.configured ? "Replace the key" : "Paste the service account JSON key"}</span>
        <textarea
          rows={4}
          value={key}
          spellCheck={false}
          placeholder={'{ "type": "service_account", "project_id": "...", ... }'}
          onChange={(event) => setKey(event.target.value)}
        />
        <small>
          Pasted once and never shown again. A service account key does not expire, so if this one is ever
          exposed, revoke it in Google Cloud rather than relying on it being forgotten.
        </small>
      </label>

      <div className="dsa-actions">
        <button
          type="button"
          className="dsa-btn dsa-btn--primary"
          disabled={busy !== null || key.trim().length < 50}
          onClick={() => send({ action: "save", key: key.trim() }, "save")}
        >
          {busy === "save" ? "Saving…" : "Save the key"}
        </button>
        {status?.configured ? (
          <button
            type="button"
            className="dsa-btn"
            disabled={busy !== null}
            onClick={() => send({ action: "check" }, "check")}
          >
            {busy === "check" ? "Testing…" : "Test it against the Shared Drive"}
          </button>
        ) : null}
      </div>

      {note ? <p className="dsa-note" role="status">{note}</p> : null}
    </div>
  );
}

const dsaCss = [
  ".dsa-lead{margin:0;font-size:14px;line-height:1.6;color:var(--cu-muted,#656f7d);max-width:70ch}",
  ".dsa-state{margin-top:12px;padding:11px 13px;border-radius:10px;background:rgba(12,163,12,.1);font-size:13.5px}",
  ".dsa-state--none{background:rgba(229,154,0,.13)}",
  ".dsa-state p{margin:0}",
  ".dsa-who{margin-top:5px!important;color:var(--cu-muted,#656f7d)}",
  ".dsa-who code,.dsa-steps code{font-size:12.5px;word-break:break-all}",
  ".dsa-bad{margin-top:5px!important;color:#b03030;font-weight:600}",
  ".dsa-steps{margin:12px 0 0;padding-left:20px;display:grid;gap:5px;font-size:13.5px;line-height:1.55}",
  ".dsa-field{display:grid;gap:5px;margin-top:14px}",
  ".dsa-field>span{font-size:12.5px;font-weight:600;color:var(--cu-muted,#656f7d)}",
  ".dsa-field textarea{width:100%;border:1px solid var(--cu-border,#e4e6eb);border-radius:9px;background:transparent;color:inherit;font:inherit;font-size:12.5px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;padding:9px 11px;resize:vertical}",
  "html[data-theme=dark] .dsa-field textarea{border-color:#3a3d44}",
  ".dsa-field small{font-size:12.5px;color:var(--cu-muted,#656f7d);line-height:1.5}",
  ".dsa-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}",
  ".dsa-btn{border:1px solid var(--cu-border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:13.5px;font-weight:600;padding:9px 15px;border-radius:9px;cursor:pointer}",
  ".dsa-btn--primary{background:#7b68ee;border-color:#7b68ee;color:#fff}",
  ".dsa-btn:disabled{opacity:.55;cursor:default}",
  ".dsa-note{margin:12px 0 0;font-size:13px;padding:9px 12px;border-radius:8px;background:rgba(123,104,238,.12)}"
].join("");
