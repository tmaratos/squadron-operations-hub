"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Adds someone to the Hub before their first sign-in so tasks can be assigned to them today.
export function AddMember() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [dutyTitle, setDutyTitle] = useState("");
  const [role, setRole] = useState("STAFF_MEMBER");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/admin/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, dutyTitle: dutyTitle || undefined, role })
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(data.message || "That member could not be added.");
      setNote({ ok: true, text: data.message ?? "Member added." });
      setFullName("");
      setEmail("");
      setDutyTitle("");
      router.refresh();
    } catch (caught) {
      setNote({ ok: false, text: caught instanceof Error ? caught.message : "That member could not be added." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="am">
      <style>{amCss}</style>
      <div className="am-head">
        <div>
          <h2>Add a member</h2>
          <p>Add someone now so you can assign them work. They get access the first time they sign in with Google using the same email address.</p>
        </div>
        <button type="button" className="am-btn am-btn--primary" onClick={() => setOpen(!open)}>{open ? "Close" : "+ Add member"}</button>
      </div>

      {open ? (
        <form className="am-form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <label>Full name
            <input value={fullName} maxLength={120} required placeholder="Jane Smith" onChange={(event) => setFullName(event.target.value)} />
          </label>
          <label>Google email address
            <input type="email" value={email} maxLength={200} required placeholder="jane@example.com" onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>Duty title (optional)
            <input value={dutyTitle} maxLength={120} placeholder="Finance Officer" onChange={(event) => setDutyTitle(event.target.value)} />
          </label>
          <label>Access level
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="STAFF_MEMBER">Staff member — normal access</option>
              <option value="ADMINISTRATOR">Administrator — can manage settings</option>
              <option value="READ_ONLY">Read only — can look, not change</option>
            </select>
          </label>
          <div className="am-actions">
            <button type="submit" className="am-btn am-btn--primary" disabled={busy || !fullName.trim() || !email.trim()}>{busy ? "Adding…" : "Add member"}</button>
          </div>
          <p className="am-fine">They must also have access to the TN-170 Shared Drive, which is managed in Google Drive, not here.</p>
        </form>
      ) : null}

      {note ? <p className={"am-note " + (note.ok ? "is-ok" : "is-bad")} role="status">{note.text}</p> : null}
    </section>
  );
}

const amCss = [
  ".am{border:1px solid var(--cu-border,#e4e6eb);border-radius:12px;padding:16px 18px;margin-bottom:16px;background:var(--cu-bg,#fff)}",
  "html[data-theme=dark] .am{background:#222326}",
  ".am-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}",
  ".am-head h2{margin:0;font-size:16px}",
  ".am-head p{margin:4px 0 0;font-size:13px;color:var(--cu-muted,#656f7d);max-width:62ch;line-height:1.5}",
  ".am-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:14px}",
  ".am-form label{display:flex;flex-direction:column;gap:5px;font-size:13px}",
  ".am-form input,.am-form select{font-size:14px;min-height:38px}",
  ".am-actions{display:flex;align-items:flex-end}",
  ".am-btn{border:1px solid var(--cu-border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:14px;font-weight:600;padding:9px 16px;border-radius:8px;cursor:pointer}",
  ".am-btn--primary{background:#7b68ee;border-color:#7b68ee;color:#fff}.am-btn--primary:disabled{opacity:.55;cursor:default}",
  ".am-fine{grid-column:1/-1;margin:0;font-size:12px;color:var(--cu-muted,#656f7d)}",
  ".am-note{margin:12px 0 0;font-size:13px;padding:9px 12px;border-radius:8px}",
  ".am-note.is-ok{background:rgba(12,163,12,.12);color:#0a7a0a}.am-note.is-bad{background:rgba(208,59,59,.12);color:#c03030}",
  "html[data-theme=dark] .am-note.is-ok{color:#7fdc7f}html[data-theme=dark] .am-note.is-bad{color:#f5a9a9}"
].join("");
