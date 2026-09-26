"use client";
import { Dictate } from "@/components/dictate";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";

type Step = Record<string, unknown>;
type Applied = { ok: boolean; label: string; href?: string };
type Message = { id: string; role: "user" | "assistant" | "system"; content: string; steps: Step[] | null; applied: Applied[] | null; createdAt: string };
type Conversation = { id: string; title: string; updatedAt: string; expiresAt: string };
type Payload = {
  available?: boolean;
  source?: string;
  retentionDays?: number;
  conversations?: Conversation[];
  messages?: Message[];
  message?: string;
  reply?: string;
  steps?: Step[];
  descriptions?: string[];
  applied?: Applied[];
  conversationId?: string;
  autonomy?: Autonomy;
  autoBuilt?: boolean;
};

type Autonomy = "SUGGEST" | "CONFIRM" | "BUILD";

const AUTONOMY_CHOICES: Array<{ value: Autonomy; label: string; hint: string }> = [
  { value: "SUGGEST", label: "Show me first", hint: "Writes the plan. Nothing happens until you press Build." },
  { value: "CONFIRM", label: "Ask once", hint: "You approve the whole plan in one click." },
  { value: "BUILD", label: "Just build it", hint: "Ordinary additions happen straight away. Anything harder to undo still asks." }
];

const EXAMPLES = [
  "Set up an Aerospace Education department with a Cadet Lessons list",
  "Add a Presenter person field and a Presentation date to Cadet Lessons",
  "Add a dashboard card showing everything overdue",
  "When a task is marked Plan submitted, set its priority to high"
];

export function AssistantPanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [retentionDays, setRetentionDays] = useState(60);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<{ steps: Step[]; descriptions: string[]; picked: boolean[] } | null>(null);
  const [autonomy, setAutonomyState] = useState<Autonomy>("CONFIRM");
  const feedRef = useRef<HTMLDivElement>(null);

  async function load(conversation?: string | null) {
    const query = conversation ? "?conversation=" + encodeURIComponent(conversation) : "";
    const response = await fetch("/api/ai/assistant" + query);
    const data = (await response.json().catch(() => ({}))) as Payload;
    setAvailable(Boolean(data.available));
    if (data.retentionDays) setRetentionDays(data.retentionDays);
    if (data.autonomy) setAutonomyState(data.autonomy);
    setConversations(data.conversations ?? []);
    if (conversation) setMessages(data.messages ?? []);
  }

  useEffect(() => {
    if (open) load(conversationId).catch(() => setAvailable(false));
  }, [open]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [messages, pending, busy]);

  async function ask() {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setNote("");
    setPrompt("");
    setMessages((current) => [...current, { id: "local-" + Date.now(), role: "user", content: text, steps: null, applied: null, createdAt: new Date().toISOString() }]);
    try {
      const response = await fetch("/api/ai/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "plan", prompt: text, conversationId }) });
      const data = (await response.json().catch(() => ({}))) as Payload;
      if (!response.ok) throw new Error(data.message || "The assistant could not answer.");
      if (data.conversationId) setConversationId(data.conversationId);
      setMessages((current) => [...current, { id: "reply-" + Date.now(), role: "assistant", content: data.reply ?? "", steps: data.steps ?? null, applied: null, createdAt: new Date().toISOString() }]);
      if (data.autoBuilt && data.applied?.length) {
        setMessages((current) => [...current, { id: "built-" + Date.now(), role: "system", content: "Built it.", steps: null, applied: data.applied ?? [], createdAt: new Date().toISOString() }]);
      }
      if (data.steps?.length) setPending({ steps: data.steps, descriptions: data.descriptions ?? [], picked: data.steps.map(() => true) });
      load().catch(() => undefined);
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "The assistant could not answer.");
    } finally {
      setBusy(false);
    }
  }

  async function doIt() {
    if (!pending || busy) return;
    const steps = pending.steps.filter((_, index) => pending.picked[index]);
    if (!steps.length) return;
    setBusy(true);
    setNote("");
    try {
      const response = await fetch("/api/ai/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply", steps, conversationId }) });
      const data = (await response.json().catch(() => ({}))) as Payload;
      if (!response.ok) throw new Error(data.message || "That could not be done.");
      setMessages((current) => [...current, { id: "done-" + Date.now(), role: "system", content: "Done.", steps: null, applied: data.applied ?? [], createdAt: new Date().toISOString() }]);
      setPending(null);
      router.refresh();
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "That could not be done.");
    } finally {
      setBusy(false);
    }
  }

  async function openConversation(id: string) {
    setConversationId(id);
    setPending(null);
    setNote("");
    await load(id);
  }

  async function removeConversation(id: string) {
    const response = await fetch("/api/ai/assistant?conversation=" + encodeURIComponent(id), { method: "DELETE" });
    const data = (await response.json().catch(() => ({}))) as Payload;
    setConversations(data.conversations ?? []);
    if (conversationId === id) {
      setConversationId(null);
      setMessages([]);
    }
    setNote(data.message ?? "");
  }

  return (
    <>
      <style>{apCss}</style>
      <button type="button" className="ap-open" onClick={() => setOpen(true)} aria-label="Ask the Hub to do something"><span aria-hidden="true">✨</span><span className="ap-open-text">Ask</span></button>
      {open ? (
        <div className="ap-overlay" onMouseDown={() => setOpen(false)}>
          <aside className="ap" onMouseDown={(event) => event.stopPropagation()} aria-label="Ask the Hub">
            <header className="ap-top">
              <strong>✨ Ask the Hub</strong>
              <button type="button" className="ap-icon" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </header>

            {available === false ? (
              <p className="ap-empty">The assistant isn't switched on yet. You can connect your own AI account in My connections.</p>
            ) : (
              <div className="ap-body">
                <div className="ap-side">
                  <button type="button" className="ap-new" onClick={() => { setConversationId(null); setMessages([]); setPending(null); setNote(""); }}>+ New conversation</button>
                  <label className="ap-autonomy">
                    <span>How much it does on its own</span>
                    <select
                      value={autonomy}
                      onChange={async (event) => {
                        const level = event.target.value as Autonomy;
                        setAutonomyState(level);
                        await fetch("/api/ai/assistant", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "autonomy", level })
                        }).catch(() => undefined);
                      }}
                    >
                      {AUTONOMY_CHOICES.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                    </select>
                    <small>{AUTONOMY_CHOICES.find((choice) => choice.value === autonomy)?.hint}</small>
                  </label>
                  <p className="ap-side-note">Saved for {retentionDays} days. Deleting a conversation never undoes work.</p>
                  {conversations.map((conversation) => (
                    <div key={conversation.id} className={"ap-conv" + (conversation.id === conversationId ? " is-active" : "")}>
                      <button type="button" className="ap-conv-open" onClick={() => openConversation(conversation.id)} title={conversation.title}>
                        <span>{conversation.title}</span>
                        <small>{new Date(conversation.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small>
                      </button>
                      <ConfirmButton className="ap-icon" ariaLabel={"Delete " + conversation.title} question="Delete?" onConfirm={() => removeConversation(conversation.id)}>✕</ConfirmButton>
                    </div>
                  ))}
                </div>

                <div className="ap-main">
                  <div className="ap-feed" ref={feedRef}>
                    {messages.length === 0 ? (
                      <div className="ap-intro">
                        <p>Tell the Hub what you need in plain English. It will show you what it plans to do, and nothing happens until you press <strong>Do it</strong>.</p>
                        {EXAMPLES.map((example) => (
                          <button key={example} type="button" className="ap-example" onClick={() => setPrompt(example)}>{example}</button>
                        ))}
                      </div>
                    ) : null}
                    {messages.map((message) => (
                      <div key={message.id} className={"ap-msg ap-msg--" + message.role}>
                        {message.content ? <p>{message.content}</p> : null}
                        {message.applied?.length ? (
                          <ul className="ap-results">
                            {message.applied.map((result, index) => (
                              <li key={index} className={result.ok ? "is-ok" : "is-bad"}>
                                <span>{result.ok ? "✓" : "!"}</span>
                                {result.href ? <a href={result.href}>{result.label}</a> : <span>{result.label}</span>}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ))}
                    {busy ? <p className="ap-working">Working. This can take up to a minute.</p> : null}
                  </div>

                  {pending ? (
                    <div className="ap-plan">
                      <strong>Here is what I will do. Uncheck anything you don't want:</strong>
                      {pending.descriptions.map((description, index) => (
                        <label key={index} className="ap-step">
                          <input type="checkbox" checked={pending.picked[index]} onChange={(event) => setPending({ ...pending, picked: pending.picked.map((value, position) => (position === index ? event.target.checked : value)) })} />
                          <span>{description}</span>
                        </label>
                      ))}
                      <div className="ap-plan-actions">
                        <button type="button" className="ap-ghost" onClick={() => setPending(null)}>Cancel</button>
                        <button type="button" className="ap-primary" disabled={busy || !pending.picked.some(Boolean)} onClick={doIt}>Do it</button>
                      </div>
                    </div>
                  ) : null}

                  {note ? <p className="ap-note" role="status">{note}</p> : null}

                  <form className="ap-compose" onSubmit={(event) => { event.preventDefault(); ask(); }}>
                    <textarea
                      rows={2}
                      value={prompt}
                      placeholder="What do you need? For example: create a task to book the van for the October parade"
                      aria-label="Ask the Hub"
                      onChange={(event) => setPrompt(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); ask(); } }}
                    />
                    <Dictate onText={(text) => setPrompt((current) => (current ? current + " " + text : text))} label="Say it" compact />
                    <button type="submit" className="ap-primary" disabled={busy || !prompt.trim()}>{busy ? "Working…" : "Ask"}</button>
                  </form>
                </div>
              </div>
            )}
          </aside>
        </div>
      ) : null}
    </>
  );
}

const apCss = [
  ".ap-autonomy{display:flex;flex-direction:column;gap:4px;margin:10px 0;font-size:12px}",
  ".ap-autonomy select{font:inherit;font-size:13px;min-height:32px;border-radius:7px;padding:0 6px}",
  ".ap-autonomy small{font-size:11px;line-height:1.4;color:var(--cu-muted,#8b93a1)}",
  ".ap-open{display:inline-flex;align-items:center;height:30px;padding:0 12px;border:1px solid rgba(123,104,238,.5);border-radius:8px;background:rgba(123,104,238,.12);color:#7b68ee;font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}",
  ".ap-open:hover{background:rgba(123,104,238,.2)}",
  ".ap-overlay{position:fixed;inset:0;z-index:115;background:rgba(0,0,0,.4);display:flex;justify-content:flex-end}",
  ".ap{width:min(940px,100%);height:100%;display:flex;flex-direction:column;background:var(--cu-bg,#fff);color:var(--cu-text,#292d34);box-shadow:-12px 0 32px rgba(0,0,0,.35)}",
  ".ap-top{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--cu-border,#e4e6eb)}",
  ".ap-icon{border:0;background:none;color:var(--cu-muted,#656f7d);font-size:14px;cursor:pointer;padding:4px 6px;border-radius:6px}.ap-icon:hover{color:#e5484d}",
  ".ap-empty{padding:24px;color:var(--cu-muted,#656f7d)}",
  ".ap-body{flex:1;min-height:0;display:grid;grid-template-columns:240px minmax(0,1fr)}",
  ".ap-side{border-right:1px solid var(--cu-border,#e4e6eb);padding:12px;overflow-y:auto;display:flex;flex-direction:column;gap:6px}",
  ".ap-new{border:1px dashed var(--cu-border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:13px;padding:8px;border-radius:8px;cursor:pointer}",
  ".ap-new:hover{border-color:#7b68ee;color:#7b68ee}",
  ".ap-side-note{margin:2px 0 8px;font-size:11px;color:var(--cu-muted,#656f7d);line-height:1.4}",
  ".ap-conv{display:flex;align-items:center;gap:4px;border-radius:8px}",
  ".ap-conv.is-active{background:rgba(123,104,238,.14)}",
  ".ap-conv-open{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;border:0;background:none;color:inherit;font:inherit;font-size:13px;text-align:left;padding:8px;cursor:pointer}",
  ".ap-conv-open span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ap-conv-open small{font-size:11px;color:var(--cu-muted,#656f7d)}",
  ".ap-main{display:flex;flex-direction:column;min-height:0}",
  ".ap-feed{flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:12px}",
  ".ap-intro{display:flex;flex-direction:column;gap:8px;color:var(--cu-muted,#656f7d);font-size:14px;line-height:1.55}",
  ".ap-example{border:1px solid var(--cu-border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:13px;text-align:left;padding:10px 12px;border-radius:8px;cursor:pointer}",
  ".ap-example:hover{border-color:#7b68ee;color:#7b68ee}",
  ".ap-msg{max-width:80%;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.55}",
  ".ap-msg p{margin:0}",
  ".ap-msg--user{align-self:flex-end;background:#7b68ee;color:#fff}",
  ".ap-msg--assistant{align-self:flex-start;background:var(--cu-hover,rgba(15,23,42,.06))}",
  ".ap-msg--system{align-self:stretch;max-width:100%;background:rgba(12,163,12,.1);border:1px solid rgba(12,163,12,.3)}",
  ".ap-results{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:4px;font-size:13px}",
  ".ap-results li{display:flex;gap:8px}.ap-results .is-bad{color:#d03b3b}.ap-results a{color:#7b68ee}",
  ".ap-working{align-self:flex-start;font-size:13px;color:var(--cu-muted,#656f7d)}",
  ".ap-plan{margin:0 20px;padding:12px 14px;border:1px solid rgba(123,104,238,.4);border-radius:10px;background:rgba(123,104,238,.06);display:flex;flex-direction:column;gap:8px;font-size:14px}",
  ".ap-step{display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.5}",
  ".ap-plan-actions{display:flex;justify-content:flex-end;gap:8px}",
  ".ap-note{margin:8px 20px 0;font-size:13px;color:#b87700}",
  ".ap-compose{display:flex;gap:8px;align-items:flex-end;padding:12px 20px 16px;border-top:1px solid var(--cu-border,#e4e6eb)}",
  ".ap-compose textarea{flex:1;resize:none;font:inherit;font-size:14px;padding:10px;border-radius:8px}",
  ".ap-primary{border:0;background:#7b68ee;color:#fff;font:inherit;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px;cursor:pointer}",
  ".ap-primary:disabled{opacity:.5;cursor:default}",
  ".ap-ghost{border:1px solid var(--cu-border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:14px;padding:9px 16px;border-radius:8px;cursor:pointer}",
  "@media (max-width:760px){",
  ".ap-body{grid-template-columns:minmax(0,1fr)}",
  ".ap-side{display:none}",
  ".ap-open{flex:0 0 auto;width:36px;height:34px;padding:0;justify-content:center;font-size:15px}",
  ".ap-open-text{display:none}",
  ".ap{width:100%}",
  ".ap-msg{max-width:92%}",
  ".ap-compose{padding:10px 12px calc(12px + env(safe-area-inset-bottom))}",
  ".ap-compose textarea{font-size:16px}",
  ".ap-plan{margin:0 12px}",
  ".ap-feed{padding:12px}",
  "}"
].join("");
