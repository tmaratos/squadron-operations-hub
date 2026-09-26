"use client";

import { useState } from "react";

// "Here is what your email seems to be asking for." Every suggestion shows the message it came from and a
// quote from it, so a wrong reading is obvious. Nothing becomes a task until somebody presses Add.

interface Suggestion {
  messageId: string;
  from: string;
  subject: string;
  date: string;
  because: string;
  title: string;
  dueOn: string | null;
  actionable: boolean;
}

export function MailSuggestions() {
  const [state, setState] = useState<"idle" | "loading" | "ready">("idle");
  const [connected, setConnected] = useState(true);
  const [label, setLabel] = useState("Hub");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [read, setRead] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function check() {
    setState("loading");
    setNote(null);
    try {
      const response = await fetch("/api/google/gmail/suggestions");
      const data = (await response.json()) as { connected?: boolean; label?: string; suggestions?: Suggestion[]; read?: number; message?: string };
      setConnected(data.connected !== false);
      if (data.label) setLabel(data.label);
      setSuggestions((data.suggestions ?? []).filter((suggestion) => suggestion.actionable));
      setRead(data.read ?? 0);
      if (data.message) setNote(data.message);
    } catch {
      setNote("Your mail could not be read just now.");
    } finally {
      setState("ready");
    }
  }

  async function add(suggestion: Suggestion) {
    setBusy(suggestion.messageId);
    try {
      const response = await fetch("/api/google/gmail/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: suggestion.title, dueOn: suggestion.dueOn, from: suggestion.from, subject: suggestion.subject })
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message || "It could not be added.");
      setAdded({ ...added, [suggestion.messageId]: data.message ?? "Added." });
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "It could not be added.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="ms" id="mail">
      <style>{msCss}</style>
      <div className="ms-head">
        <div>
          <h2>Turn email into tasks</h2>
          <p>
            Put the label <strong>{label}</strong> on any email in Gmail. The Hub reads only those messages, on its
            own, while you have it open, and brings anything worth doing to you in the corner. Nothing is created
            until you say so.
          </p>
        </div>
      </div>

      {!connected ? (
        <p className="ms-note">
          This needs Gmail reading, which you have not turned on. Connect it under Email below — or skip it entirely and
          forward mail to your own Hub address instead, which needs no permission at all.
        </p>
      ) : null}

      {note ? <p className="ms-note">{note}</p> : null}

      {state === "ready" && connected && !suggestions.length && !note ? (
        <p className="ms-note">
          {read ? "Read " + read + " message" + (read === 1 ? "" : "s") + " — nothing in them needs doing." : "No email carries the " + label + " label yet."}
        </p>
      ) : null}

      {suggestions.length ? (
        <ul className="ms-list">
          {suggestions.map((suggestion) => (
            <li key={suggestion.messageId}>
              <div className="ms-what">
                <strong>{suggestion.title}</strong>
                {suggestion.dueOn ? <span className="ms-due">Due {suggestion.dueOn}</span> : null}
                <small>{suggestion.from} · {suggestion.subject}</small>
                {suggestion.because ? <em>“{suggestion.because}”</em> : null}
              </div>
              {added[suggestion.messageId]
                ? <span className="ms-added">✓ {added[suggestion.messageId]}</span>
                : (
                  <button type="button" className="ms-btn" disabled={busy === suggestion.messageId} onClick={() => add(suggestion)}>
                    {busy === suggestion.messageId ? "Adding…" : "Add it"}
                  </button>
                )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

const msCss = [
  ".ms{border:1px solid var(--cu-border,#e4e6eb);border-radius:12px;padding:16px 18px;background:var(--cu-bg,#fff)}",
  "html[data-theme=dark] .ms{background:#222326;border-color:#3a3d44}",
  ".ms-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}",
  ".ms-head h2{margin:0;font-size:16px}",
  ".ms-head p{margin:4px 0 0;font-size:13.5px;line-height:1.55;color:var(--cu-muted,#656f7d);max-width:64ch}",
  ".ms-btn{border:1px solid var(--cu-border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:14px;font-weight:600;padding:9px 16px;border-radius:8px;cursor:pointer;white-space:nowrap}",
  ".ms-btn--primary{background:#7b68ee;border-color:#7b68ee;color:#fff}.ms-btn:disabled{opacity:.55;cursor:default}",
  ".ms-note{margin:12px 0 0;font-size:13px;line-height:1.55;padding:9px 12px;border-radius:8px;background:rgba(123,104,238,.1)}",
  ".ms-list{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:8px}",
  ".ms-list li{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:11px 13px;border:1px solid var(--cu-border,#e4e6eb);border-radius:10px}",
  "html[data-theme=dark] .ms-list li{border-color:#3a3d44}",
  ".ms-what{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}",
  ".ms-what strong{font-size:14.5px;line-height:1.45}",
  ".ms-what small{font-size:12px;color:var(--cu-muted,#656f7d);overflow:hidden;text-overflow:ellipsis}",
  ".ms-what em{font-style:normal;font-size:12.5px;line-height:1.45;color:var(--cu-muted,#8b93a1)}",
  ".ms-due{align-self:flex-start;font-size:11.5px;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(229,154,0,.16);color:#a06a00}",
  ".ms-added{font-size:13px;font-weight:600;color:#0a7a0a;white-space:nowrap}",
  "html[data-theme=dark] .ms-added{color:#7fdc7f}"
].join("");
