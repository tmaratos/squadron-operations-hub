"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// "I noticed this. Want me to?" Each offer says why it is being offered, so it reads as the Hub paying
// attention rather than guessing. Nothing happens without a press, and no is remembered.

interface Offer {
  id: string;
  kind: string;
  title: string;
  because: string;
  listId: string;
  listName: string;
  create?: { title: string; dueOn: string | null };
  itemIds?: string[];
}

export function OffersCard() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; href?: string } | null>(null);

  useEffect(() => {
    fetch("/api/offers")
      .then((response) => response.json() as Promise<{ offers?: Offer[] }>)
      .then((data) => setOffers(data.offers ?? []))
      .catch(() => undefined);
  }, []);

  async function respond(offer: Offer, action: "accept" | "dismiss") {
    setBusy(offer.id);
    setNote(null);
    try {
      const response = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: offer.id,
          action,
          ...(action === "accept" && offer.create ? { listId: offer.listId, title: offer.create.title } : {})
        })
      });
      const data = (await response.json()) as { offers?: Offer[]; message?: string; created?: { id: string; listId: string } };
      setOffers(data.offers ?? []);
      if (data.message) {
        setNote({
          text: data.message,
          href: data.created ? "/lists/" + data.created.listId + "?item=" + data.created.id : undefined
        });
      }
    } catch {
      setNote({ text: "That could not be done just now." });
    } finally {
      setBusy(null);
    }
  }

  if (!offers.length && !note) return null;

  return (
    <section className="of">
      <style>{ofCss}</style>
      <header>
        <h2>✨ Want me to?</h2>
        <p>Things the Hub noticed. Nothing happens unless you say so.</p>
      </header>

      {offers.map((offer) => (
        <article key={offer.id} className="of-row">
          <div className="of-what">
            <strong>{offer.title}</strong>
            <small>{offer.because}</small>
          </div>
          <div className="of-actions">
            {offer.create ? (
              <button type="button" className="of-btn of-btn--primary" disabled={busy === offer.id} onClick={() => respond(offer, "accept")}>
                {busy === offer.id ? "Doing it…" : "Yes, do it"}
              </button>
            ) : (
              <Link className="of-btn of-btn--primary" href={"/lists/" + offer.listId}>Open the list</Link>
            )}
            <button type="button" className="of-btn" disabled={busy === offer.id} onClick={() => respond(offer, "dismiss")}>Not now</button>
          </div>
        </article>
      ))}

      {note ? (
        <p className="of-note" role="status">
          {note.text} {note.href ? <Link href={note.href}>Open it →</Link> : null}
        </p>
      ) : null}
    </section>
  );
}

const ofCss = [
  ".of{border:1px solid rgba(123,104,238,.35);border-radius:12px;padding:15px 17px;background:rgba(123,104,238,.07)}",
  "html[data-theme=dark] .of{background:rgba(123,104,238,.12)}",
  ".of header h2{margin:0;font-size:16px}",
  ".of header p{margin:3px 0 0;font-size:13px;color:var(--cu-muted,#656f7d)}",
  ".of-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:11px;padding:11px 13px;border-radius:10px;background:var(--cu-bg,#fff)}",
  "html[data-theme=dark] .of-row{background:#222326}",
  ".of-what{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}",
  ".of-what strong{font-size:14.5px;line-height:1.45}",
  ".of-what small{font-size:12.5px;color:var(--cu-muted,#656f7d);line-height:1.5}",
  ".of-actions{display:flex;gap:7px;flex-wrap:wrap}",
  ".of-btn{border:1px solid var(--cu-border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:13.5px;font-weight:600;padding:8px 14px;border-radius:8px;cursor:pointer;white-space:nowrap;text-decoration:none;display:inline-flex;align-items:center}",
  ".of-btn--primary{background:#7b68ee;border-color:#7b68ee;color:#fff}.of-btn:disabled{opacity:.55;cursor:default}",
  ".of-note{margin:11px 0 0;font-size:13px}",
  ".of-note a{color:#7b68ee;font-weight:600}"
].join("");
