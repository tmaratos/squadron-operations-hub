"use client";

import Link from "next/link";
import { useState } from "react";
import type { NotificationPrefs, NotificationRecord } from "@/lib/notify/notifications";

// What the Hub told you, and what you want to be told about. Both on one page, because the first question
// anyone asks after seeing a notice is "how do I stop getting these" or "why didn't I get one".

const KIND_LABEL: Record<string, { icon: string; label: string; tone: string }> = {
  ASSIGNED: { icon: "◍", label: "Given to you", tone: "accent" },
  COMMENT: { icon: "💬", label: "Comment", tone: "info" },
  DUE_SOON: { icon: "◷", label: "Coming up", tone: "warning" },
  OVERDUE: { icon: "!", label: "Overdue", tone: "danger" },
  STATUS: { icon: "✓", label: "Status changed", tone: "success" },
  MENTION: { icon: "@", label: "Mentioned you", tone: "accent" },
  ANNOUNCEMENT: { icon: "📣", label: "Squadron alert", tone: "accent" }
};

const CHOICES: Array<{ key: keyof NotificationPrefs; label: string; detail: string }> = [
  { key: "onAssigned", label: "Work given to me", detail: "Someone assigns a task to you." },
  { key: "onDueSoon", label: "Deadlines coming up", detail: "A task of yours is due soon." },
  { key: "onOverdue", label: "Anything of mine that is late", detail: "A task of yours passed its due date." },
  { key: "onComment", label: "Comments on my tasks", detail: "Someone writes on a task you own or raised." },
  { key: "onStatus", label: "Status changes on my tasks", detail: "Off by default — this one is chatty." }
];

export function NotificationCenter({
  initialNotifications,
  initialPrefs,
  emailAddress
}: {
  initialNotifications: NotificationRecord[];
  initialPrefs: NotificationPrefs;
  emailAddress: string;
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const unread = notifications.filter((notice) => !notice.readAt).length;

  async function markAllRead() {
    setNotifications(notifications.map((notice) => ({ ...notice, readAt: notice.readAt ?? new Date().toISOString() })));
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read" })
    }).catch(() => undefined);
  }

  async function sendTest() {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test" })
      });
      const data = (await response.json()) as { message?: string };
      setNote(data.message ?? (response.ok ? "Sent." : "It could not be sent."));
    } catch {
      setNote("It could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  async function savePrefs(next: NotificationPrefs) {
    const previous = prefs;
    setPrefs(next);
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prefs", prefs: next })
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message || "That change could not be saved.");
      setNote(data.message ?? "Saved.");
    } catch (caught) {
      setPrefs(previous);
      setNote(caught instanceof Error ? caught.message : "That change could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="nc">
      <style>{ncCss}</style>

      <section className="nc-card">
        <header className="nc-head">
          <div>
            <h2>Recent</h2>
            <p>{unread ? unread + " you have not read yet." : "You are up to date."}</p>
          </div>
          {unread ? <button type="button" className="nc-btn" onClick={markAllRead}>Mark all read</button> : null}
        </header>

        {notifications.length ? (
          <ul className="nc-list">
            {notifications.map((notice) => {
              const kind = KIND_LABEL[notice.kind] ?? { icon: "•", label: notice.kind, tone: "info" };
              const inner = (
                <>
                  <span className={"nc-icon nc-icon--" + kind.tone} aria-hidden="true">{kind.icon}</span>
                  <span className="nc-text">
                    <strong>{notice.title}</strong>
                    {notice.body ? <small>{notice.body}</small> : null}
                    <em>{kind.label} · {timeAgo(notice.createdAt)}</em>
                  </span>
                  {notice.readAt ? null : <span className="nc-dot" aria-label="Unread" />}
                </>
              );
              return (
                <li key={notice.id} className={"nc-row" + (notice.readAt ? "" : " is-unread")}>
                  {notice.itemId && notice.listId
                    ? <Link href={"/lists/" + notice.listId + "?item=" + notice.itemId}>{inner}</Link>
                    : <span className="nc-plain">{inner}</span>}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="nc-empty">Nothing yet. When someone gives you work, or a deadline of yours gets close, it shows up here.</p>
        )}
      </section>

      <section className="nc-card">
        <header className="nc-head">
          <div>
            <h2>What to tell me</h2>
            <p>These apply to both this page and your email.</p>
          </div>
        </header>

        <div className="nc-choices">
          {CHOICES.map((choice) => (
            <label key={String(choice.key)} className="nc-choice">
              <input
                type="checkbox"
                checked={Boolean(prefs[choice.key])}
                disabled={busy}
                onChange={(event) => savePrefs({ ...prefs, [choice.key]: event.target.checked })}
              />
              <span><strong>{choice.label}</strong><small>{choice.detail}</small></span>
            </label>
          ))}
        </div>

        <div className="nc-sub">
          <label className="nc-choice nc-choice--wide">
            <input
              type="checkbox"
              checked={prefs.emailEnabled}
              disabled={busy}
              onChange={(event) => savePrefs({ ...prefs, emailEnabled: event.target.checked })}
            />
            <span><strong>Email me as well</strong><small>Sent to {emailAddress}. Turn this off and everything still appears here.</small></span>
          </label>

          {prefs.emailEnabled ? (
            <>
              <label className="nc-field">
                <span>How often</span>
                <select
                  value={prefs.cadence === "IMMEDIATE" ? "IMMEDIATE" : prefs.digestWhen}
                  disabled={busy}
                  onChange={(event) => {
                    const value = event.target.value;
                    savePrefs(value === "IMMEDIATE"
                      ? { ...prefs, cadence: "IMMEDIATE" }
                      : { ...prefs, cadence: "DAILY", digestWhen: value as NotificationPrefs["digestWhen"] });
                  }}
                >
                  <option value="EVENING">Once a day, end of day (6pm)</option>
                  <option value="MORNING">Once a day, morning (6am)</option>
                  <option value="IMMEDIATE">As things happen</option>
                </select>
              </label>
              <label className="nc-field">
                <span>Warn me before a deadline</span>
                <select value={prefs.leadDays} disabled={busy} onChange={(event) => savePrefs({ ...prefs, leadDays: Number(event.target.value) })}>
                  <option value={1}>1 day before</option>
                  <option value={3}>3 days before</option>
                  <option value={7}>A week before</option>
                  <option value={14}>Two weeks before</option>
                </select>
              </label>
            </>
          ) : null}
        </div>

        {prefs.emailEnabled ? (
          <div className="nc-test">
            <button type="button" className="nc-btn" disabled={busy} onClick={sendTest}>{busy ? "Sending…" : "Send me a test email"}</button>
            <small>Proves the Hub can reach you, without waiting for real work to turn up.</small>
          </div>
        ) : null}

        {note ? <p className="nc-note" role="status">{note}</p> : null}
      </section>
    </div>
  );
}

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return minutes + (minutes === 1 ? " minute ago" : " minutes ago");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + (hours === 1 ? " hour ago" : " hours ago");
  const days = Math.round(hours / 24);
  if (days < 30) return days + (days === 1 ? " day ago" : " days ago");
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const ncCss = [
  ".nc{display:grid;gap:16px}",
  ".nc-card{border:1px solid var(--cu-border,#e4e6eb);border-radius:12px;background:var(--cu-bg,#fff);padding:16px 18px}",
  "html[data-theme=dark] .nc-card{background:#222326;border-color:#3a3d44}",
  ".nc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}",
  ".nc-head h2{margin:0;font-size:16px}.nc-head p{margin:4px 0 0;font-size:13.5px;color:var(--cu-muted,#656f7d)}",
  ".nc-btn{border:1px solid var(--cu-border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:13.5px;font-weight:600;padding:8px 14px;border-radius:8px;cursor:pointer}",
  ".nc-list{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column}",
  ".nc-row{border-top:1px solid var(--cu-border,#eef0f3)}",
  "html[data-theme=dark] .nc-row{border-color:#33363c}",
  ".nc-row a,.nc-plain{display:flex;align-items:flex-start;gap:12px;padding:12px 6px;text-decoration:none;color:inherit}",
  ".nc-row a:hover{background:rgba(123,104,238,.07);border-radius:8px}",
  ".nc-row.is-unread strong{font-weight:700}",
  ".nc-icon{flex:0 0 auto;width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;color:#fff;background:#7b68ee}",
  ".nc-icon--danger{background:#d03b3b}.nc-icon--warning{background:#e59a00}.nc-icon--info{background:#2a78d6}.nc-icon--success{background:#0ca30c}",
  ".nc-text{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}",
  ".nc-text strong{font-size:14px;line-height:1.4}",
  ".nc-text small{font-size:13px;color:var(--cu-muted,#656f7d);line-height:1.45;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}",
  ".nc-text em{font-style:normal;font-size:11.5px;color:var(--cu-muted,#8b93a1)}",
  ".nc-dot{flex:0 0 auto;width:9px;height:9px;border-radius:50%;background:#7b68ee;margin-top:11px}",
  ".nc-empty{margin:14px 0 0;font-size:13.5px;line-height:1.55;color:var(--cu-muted,#656f7d)}",
  ".nc-choices{display:grid;gap:8px;margin-top:14px}",
  ".nc-choice{display:flex;gap:11px;align-items:flex-start;padding:10px 12px;border:1px solid var(--cu-border,#e4e6eb);border-radius:10px;cursor:pointer}",
  "html[data-theme=dark] .nc-choice{border-color:#3a3d44}",
  ".nc-choice input{width:18px;height:18px;margin-top:1px;flex:0 0 auto;accent-color:#7b68ee}",
  ".nc-choice span{display:flex;flex-direction:column;gap:2px}",
  ".nc-choice strong{font-size:14px}.nc-choice small{font-size:12.5px;color:var(--cu-muted,#656f7d);line-height:1.45}",
  ".nc-sub{margin-top:14px;padding-top:14px;border-top:1px solid var(--cu-border,#eef0f3);display:grid;gap:10px}",
  "html[data-theme=dark] .nc-sub{border-color:#33363c}",
  ".nc-field{display:flex;flex-direction:column;gap:5px;font-size:13.5px;max-width:340px}",
  ".nc-field select{font:inherit;font-size:14px;min-height:38px;border-radius:8px;padding:0 8px}",
  ".nc-test{margin-top:4px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}",
  ".nc-test small{font-size:12.5px;color:var(--cu-muted,#656f7d)}",
  ".nc-note{margin:12px 0 0;font-size:13px;padding:9px 12px;border-radius:8px;background:rgba(123,104,238,.12)}",
  "@media (max-width:760px){.nc-card{padding:14px}.nc-field{max-width:none}}"
].join("");
