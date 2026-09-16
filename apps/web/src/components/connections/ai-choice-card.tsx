"use client";

import { useState } from "react";
import type { ProviderDefinition } from "@/lib/connections";

// Which AI answers when a member asks the Hub for help. The squadron's own server is free and the default;
// anyone who has connected their own account can switch to it, and they pay for that themselves.
export function AiChoiceCard({
  providers,
  connected,
  squadronAvailable,
  initialChoice
}: {
  providers: ProviderDefinition[];
  connected: string[];
  squadronAvailable: boolean;
  initialChoice: string;
}) {
  const [choice, setChoice] = useState(initialChoice);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const options = [
    { id: "squadron-server", name: "The squadron's own AI", detail: squadronAvailable ? "Free, private, and runs on the squadron server. Nothing leaves the squadron." : "Not switched on yet. Ask your administrator." , usable: squadronAvailable },
    ...providers
      .filter((provider) => provider.category === "ai" && connected.includes(provider.id))
      .map((provider) => ({ id: provider.id, name: provider.name, detail: "Your own account. You are billed by " + provider.name.split(" (")[0] + ".", usable: true }))
  ];

  async function pick(next: string) {
    const previous = choice;
    setChoice(next);
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/ai/provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choice: next })
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message || "That choice could not be saved.");
      setNote(data.message ?? "Saved.");
    } catch (caught) {
      setChoice(previous);
      setNote(caught instanceof Error ? caught.message : "That choice could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ac" aria-labelledby="ac-title">
      <style>{acCss}</style>
      <div className="ac-head">
        <span className="ac-logo" aria-hidden="true">✦</span>
        <div>
          <h2 id="ac-title">Which AI the Hub uses for you</h2>
          <p>This is the assistant that answers when you use Ask. Everyone starts on the squadron&apos;s own AI, which costs nothing.</p>
        </div>
      </div>

      <div className="ac-options" role="radiogroup" aria-labelledby="ac-title">
        {options.map((option) => (
          <label key={option.id} className={"ac-option" + (choice === option.id ? " is-on" : "") + (option.usable ? "" : " is-off")}>
            <input
              type="radio"
              name="ai-choice"
              value={option.id}
              checked={choice === option.id}
              disabled={busy || !option.usable}
              onChange={() => pick(option.id)}
            />
            <span className="ac-option-text">
              <strong>{option.name}</strong>
              <small>{option.detail}</small>
            </span>
            {choice === option.id ? <span className="ac-on">In use</span> : null}
          </label>
        ))}
      </div>

      {options.length === 1 ? (
        <p className="ac-fine">Connect an AI account below to see it here as a choice.</p>
      ) : null}
      {note ? <p className="ac-note" role="status">{note}</p> : null}
    </section>
  );
}

const acCss = [
  ".ac{border:1px solid var(--cu-border,#e4e6eb);border-radius:12px;padding:16px 18px;background:var(--cu-bg,#fff)}",
  "html[data-theme=dark] .ac{background:#222326;border-color:#3a3d44}",
  ".ac-head{display:flex;gap:12px;align-items:flex-start}",
  ".ac-logo{flex:0 0 auto;width:34px;height:34px;border-radius:9px;background:#7b68ee;color:#fff;font-size:17px;display:flex;align-items:center;justify-content:center}",
  ".ac-head h2{margin:0;font-size:16px}",
  ".ac-head p{margin:4px 0 0;font-size:13.5px;line-height:1.5;color:var(--cu-muted,#656f7d);max-width:64ch}",
  ".ac-options{display:grid;gap:8px;margin-top:14px}",
  ".ac-option{display:flex;align-items:center;gap:11px;padding:11px 13px;border:1px solid var(--cu-border,#e4e6eb);border-radius:10px;cursor:pointer}",
  ".ac-option.is-on{border-color:#7b68ee;background:rgba(123,104,238,.08)}",
  ".ac-option.is-off{opacity:.55;cursor:default}",
  ".ac-option input{width:18px;height:18px;flex:0 0 auto;accent-color:#7b68ee}",
  ".ac-option-text{display:flex;flex-direction:column;min-width:0;flex:1}",
  ".ac-option-text strong{font-size:14px}",
  ".ac-option-text small{font-size:12.5px;line-height:1.45;color:var(--cu-muted,#656f7d)}",
  ".ac-on{flex:0 0 auto;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:999px;background:#7b68ee;color:#fff}",
  ".ac-note{margin:11px 0 0;font-size:13px;padding:9px 12px;border-radius:8px;background:rgba(123,104,238,.12)}",
  ".ac-fine{margin:10px 0 0;font-size:12.5px;color:var(--cu-muted,#656f7d)}"
].join("");
