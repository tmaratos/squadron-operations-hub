"use client";

import { useEffect, useState } from "react";

// Sending one message to the members who need it. Pick people, write it, send. The default is quiet: it
// waits for their usual daily email. "Send it now" is there for the times that cannot wait.

interface Person { userId: string | null; fullName: string; capid: string | null; email: string }

export function AlertComposer() {
  const [people, setPeople] = useState<Person[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || people.length) return;
    fetch("/api/directory")
      .then((response) => response.json() as Promise<{ people?: Person[] }>)
      .then((data) => setPeople((data.people ?? []).filter((person) => person.userId)))
      .catch(() => setNote({ ok: false, text: "The member list could not be read." }));
  }, [open, people.length]);

  async function send() {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: chosen, subject, body, urgent })
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message || "That alert could not be sent.");
      setNote({ ok: true, text: data.message ?? "Sent." });
      setSubject("");
      setBody("");
      setChosen([]);
      setUrgent(false);
    } catch (caught) {
      setNote({ ok: false, text: caught instanceof Error ? caught.message : "That alert could not be sent." });
    } finally {
      setBusy(false);
    }
  }

  const everyone = people.map((person) => person.userId as string);
  const allChosen = chosen.length > 0 && chosen.length === everyone.length;

  return (
    <section className="ac2">
      <style>{acCss}</style>
      <div className="ac2-head">
        <div>
          <h2>Send an alert</h2>
          <p>One message to the members you choose. It lands in the Hub for them, and in their email.</p>
        </div>
        <button type="button" className="ac2-btn ac2-btn--primary" onClick={() => setOpen(!open)}>{open ? "Close" : "Write an alert"}</button>
      </div>

      {open ? (
        <form className="ac2-form" onSubmit={(event) => { event.preventDefault(); send(); }}>
          <div className="ac2-people">
            <div className="ac2-people-head">
              <span>Who needs this? <strong>{chosen.length}</strong> chosen</span>
              <button type="button" className="ac2-link" onClick={() => setChosen(allChosen ? [] : everyone)}>
                {allChosen ? "Clear all" : "Everyone (" + everyone.length + ")"}
              </button>
            </div>
            <div className="ac2-list">
              {people.map((person) => (
                <label key={person.userId} className={"ac2-person" + (chosen.includes(person.userId as string) ? " is-on" : "")}>
                  <input
                    type="checkbox"
                    checked={chosen.includes(person.userId as string)}
                    onChange={(event) => setChosen(event.target.checked
                      ? [...chosen, person.userId as string]
                      : chosen.filter((id) => id !== person.userId))}
                  />
                  <span>{person.fullName}</span>
                </label>
              ))}
              {!people.length ? <p className="ac2-empty">Loading the member list…</p> : null}
            </div>
          </div>

          <label className="ac2-field">
            <span>Subject</span>
            <input value={subject} maxLength={200} placeholder="Meeting moved to Thursday" onChange={(event) => setSubject(event.target.value)} />
          </label>
          <label className="ac2-field">
            <span>Message</span>
            <textarea value={body} rows={5} maxLength={5000} placeholder="Say what changed, and what they need to do about it." onChange={(event) => setBody(event.target.value)} />
          </label>

          <label className="ac2-urgent">
            <input type="checkbox" checked={urgent} onChange={(event) => setUrgent(event.target.checked)} />
            <span><strong>Send the email now</strong><small>Otherwise it goes out with their usual end-of-day email. Use this for things that cannot wait.</small></span>
          </label>

          <div className="ac2-actions">
            <button type="submit" className="ac2-btn ac2-btn--primary" disabled={busy || !chosen.length || subject.trim().length < 3 || body.trim().length < 3}>
              {busy ? "Sending…" : "Send to " + chosen.length + " member" + (chosen.length === 1 ? "" : "s")}
            </button>
          </div>
        </form>
      ) : null}

      {note ? <p className={"ac2-note " + (note.ok ? "is-ok" : "is-bad")} role="status">{note.text}</p> : null}
    </section>
  );
}

const acCss = [
  ".ac2{border:1px solid var(--cu-border,#e4e6eb);border-radius:12px;padding:16px 18px;background:var(--cu-bg,#fff)}",
  "html[data-theme=dark] .ac2{background:#222326;border-color:#3a3d44}",
  ".ac2-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}",
  ".ac2-head h2{margin:0;font-size:16px}.ac2-head p{margin:4px 0 0;font-size:13.5px;line-height:1.5;color:var(--cu-muted,#656f7d);max-width:60ch}",
  ".ac2-form{margin-top:14px;display:grid;gap:12px}",
  ".ac2-people-head{display:flex;justify-content:space-between;align-items:center;font-size:13.5px;margin-bottom:6px;gap:12px}",
  ".ac2-link{border:0;background:none;color:#7b68ee;font:inherit;font-size:13px;font-weight:600;cursor:pointer;padding:0}",
  ".ac2-list{display:flex;flex-wrap:wrap;gap:6px;max-height:190px;overflow:auto;padding:8px;border:1px solid var(--cu-border,#e4e6eb);border-radius:10px}",
  "html[data-theme=dark] .ac2-list{border-color:#3a3d44}",
  ".ac2-person{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--cu-border,#e4e6eb);border-radius:999px;font-size:13px;cursor:pointer}",
  ".ac2-person.is-on{background:rgba(123,104,238,.13);border-color:#7b68ee}",
  ".ac2-person input{width:15px;height:15px;accent-color:#7b68ee}",
  ".ac2-field{display:flex;flex-direction:column;gap:5px;font-size:13.5px}",
  ".ac2-field input,.ac2-field textarea{font:inherit;font-size:14px;padding:9px 10px;border-radius:8px;border:1px solid var(--cu-border,#d5d8de);width:100%;box-sizing:border-box;resize:vertical}",
  ".ac2-urgent{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid var(--cu-border,#e4e6eb);border-radius:10px;cursor:pointer}",
  ".ac2-urgent input{width:18px;height:18px;margin-top:1px;accent-color:#d03b3b}",
  ".ac2-urgent span{display:flex;flex-direction:column;gap:2px}",
  ".ac2-urgent strong{font-size:14px}.ac2-urgent small{font-size:12.5px;color:var(--cu-muted,#656f7d);line-height:1.45}",
  ".ac2-actions{display:flex;justify-content:flex-end}",
  ".ac2-btn{border:1px solid var(--cu-border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:14px;font-weight:600;padding:9px 16px;border-radius:8px;cursor:pointer}",
  ".ac2-btn--primary{background:#7b68ee;border-color:#7b68ee;color:#fff}.ac2-btn:disabled{opacity:.55;cursor:default}",
  ".ac2-empty{margin:4px;font-size:13px;color:var(--cu-muted,#656f7d)}",
  ".ac2-note{margin:12px 0 0;font-size:13px;padding:9px 12px;border-radius:8px}",
  ".ac2-note.is-ok{background:rgba(12,163,12,.12);color:#0a7a0a}.ac2-note.is-bad{background:rgba(208,59,59,.12);color:#c03030}",
  "html[data-theme=dark] .ac2-note.is-ok{color:#7fdc7f}html[data-theme=dark] .ac2-note.is-bad{color:#f5a9a9}"
].join("");
