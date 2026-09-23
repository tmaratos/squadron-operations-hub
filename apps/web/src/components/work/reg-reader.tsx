"use client";

import { useEffect, useState } from "react";

// Pointing the Hub at the squadron's own documents and letting it propose what they require.
//
// Documents are read one at a time so progress is visible, and because the squadron's own AI server is
// small and takes a moment per document. Nothing it proposes counts until a person confirms it below.

interface DocumentRow {
  id: string;
  name: string;
  webViewLink: string | null;
  status: "PENDING" | "READ" | "FAILED" | "SKIPPED";
  dutiesFound: number;
  error: string | null;
  readAt: string | null;
}

export function RegReader() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [readingAll, setReadingAll] = useState(false);

  useEffect(() => {
    fetch("/api/regs")
      .then((response) => response.json() as Promise<{ documents?: DocumentRow[] }>)
      .then((data) => setDocuments(data.documents ?? []))
      .catch(() => undefined);
  }, []);

  async function send(body: Record<string, unknown>, key: string) {
    setBusy(key);
    try {
      const response = await fetch("/api/regs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await response.json()) as { documents?: DocumentRow[]; message?: string };
      if (data.documents) setDocuments(data.documents);
      if (data.message) setNote(data.message);
      return data.documents ?? [];
    } catch {
      setNote("That could not be done just now.");
      return [];
    } finally {
      setBusy(null);
    }
  }

  // Reads the queue in order, stopping the moment anything goes wrong, so a broken document does not
  // silently burn through the rest.
  async function readAll(queue: DocumentRow[]) {
    setReadingAll(true);
    try {
      for (const document of queue) {
        const updated = await send({ action: "read", id: document.id }, document.id);
        const row = updated.find((entry) => entry.id === document.id);
        if (row?.status === "FAILED") break;
      }
    } finally {
      setReadingAll(false);
    }
  }

  const pending = documents.filter((document) => document.status === "PENDING");
  const read = documents.filter((document) => document.status === "READ");

  return (
    <section className="rr">
      <style>{rrCss}</style>
      <div className="rr-head">
        <div>
          <h2>Read the squadron&apos;s documents</h2>
          <p>
            The Hub looks through the regulations and documents in your Shared Drive and proposes the recurring
            duties they create. Everything it finds comes with the sentence it came from, and nothing counts
            until you confirm it.
          </p>
        </div>
        <div className="rr-actions">
          <button type="button" className="rr-btn" disabled={Boolean(busy) || readingAll} onClick={() => send({ action: "refresh" }, "refresh")}>
            {busy === "refresh" ? "Looking…" : "Check the Drive"}
          </button>
          {pending.length ? (
            <button type="button" className="rr-btn rr-btn--primary" disabled={Boolean(busy) || readingAll} onClick={() => readAll(pending)}>
              {readingAll ? "Reading…" : "Read all " + pending.length}
            </button>
          ) : null}
        </div>
      </div>

      {note ? <p className="rr-note" role="status">{note}</p> : null}

      {documents.length ? (
        <ul className="rr-list">
          {[...pending, ...documents.filter((document) => document.status !== "PENDING")].slice(0, 25).map((document) => (
            <li key={document.id}>
              <div className="rr-doc">
                <strong>{document.name}</strong>
                <small>
                  {document.status === "PENDING" ? "Not read yet"
                    : document.status === "READ" ? (document.dutiesFound ? document.dutiesFound + " to check" : "Nothing required")
                    : document.status === "SKIPPED" ? "Barely any text"
                    : document.error ?? "Could not be read"}
                </small>
              </div>
              <div className="rr-actions">
                {document.webViewLink ? <a className="rr-link" href={document.webViewLink} target="_blank" rel="noreferrer noopener">Open</a> : null}
                {document.status !== "READ" || document.dutiesFound === 0 ? (
                  <button type="button" className="rr-btn" disabled={Boolean(busy) || readingAll} onClick={() => send({ action: "read", id: document.id }, document.id)}>
                    {busy === document.id ? "Reading…" : document.status === "PENDING" ? "Read it" : "Read again"}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rr-empty">Press <strong>Check the Drive</strong> to see what documents the squadron has.</p>
      )}

      {read.length ? <p className="rr-foot">Anything proposed is waiting below as unconfirmed. Confirm one and it starts producing real tasks before it is due.</p> : null}
    </section>
  );
}

const rrCss = [
  ".rr{border:1px solid var(--cu-border,#e4e6eb);border-radius:12px;padding:16px 18px;margin-bottom:16px;background:var(--cu-bg,#fff)}",
  "html[data-theme=dark] .rr{background:#222326;border-color:#3a3d44}",
  ".rr-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}",
  ".rr-head h2{margin:0;font-size:16px}",
  ".rr-head p{margin:4px 0 0;font-size:13.5px;line-height:1.55;color:var(--cu-muted,#656f7d);max-width:66ch}",
  ".rr-actions{display:flex;gap:7px;flex-wrap:wrap;align-items:center}",
  ".rr-btn{border:1px solid var(--cu-border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:13.5px;font-weight:600;padding:8px 14px;border-radius:8px;cursor:pointer;white-space:nowrap}",
  ".rr-btn--primary{background:#7b68ee;border-color:#7b68ee;color:#fff}.rr-btn:disabled{opacity:.55;cursor:default}",
  ".rr-link{font-size:13px;font-weight:600;color:#7b68ee;text-decoration:none}",
  ".rr-note{margin:12px 0 0;font-size:13px;padding:9px 12px;border-radius:8px;background:rgba(123,104,238,.12)}",
  ".rr-list{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:7px;max-height:340px;overflow:auto}",
  ".rr-list li{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:9px 12px;border:1px solid var(--cu-border,#e4e6eb);border-radius:9px}",
  "html[data-theme=dark] .rr-list li{border-color:#3a3d44}",
  ".rr-doc{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}",
  ".rr-doc strong{font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".rr-doc small{font-size:12px;color:var(--cu-muted,#656f7d)}",
  ".rr-empty,.rr-foot{margin:12px 0 0;font-size:13px;color:var(--cu-muted,#656f7d);line-height:1.55}"
].join("");
