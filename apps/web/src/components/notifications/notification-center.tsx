"use client";

import Link from "next/link";
import { useState } from "react";
import type { NotificationPrefs, NotificationRecord } from "@/lib/notify/notifications";

type EmailChoice = "FOLLOW" | "ALWAYS" | "NEVER";

const EMAIL_CHOICES: Array<{ value: EmailChoice; label: string; detail: string }> = [
  { value: "FOLLOW", label: "Whatever the squadron is doing", detail: "The usual. If command switches email off for everybody, yours goes quiet too." },
  { value: "ALWAYS", label: "Always email me", detail: "You keep getting the daily summary even when the squadron has email switched off." },
  { value: "NEVER", label: "Never email me", detail: "Nothing by email. Everything still appears on this page." }
];

// What the Hub told you, and one switch.
//
// There used to be five checkboxes and two dropdowns here. Nobody in a squadron wants to design their own
// notification policy; they want to know what is due. So the Hub decides sensibly - the work you are
// responsible for, once a day at 6pm - and the only question left is whether you want the email at all.
// Anything that cannot wait is sent by a person as an alert, so nothing urgent depends on a setting.

const KIND_LABEL: Record<string, { icon: string; label: string; tone: string }> = {
  ASSIGNED: { icon: "◍", label: "Given to you", tone: "accent" },
  COMMENT: { icon: "💬", label: "Comment", tone: "info" },
  DUE_SOON: { icon: "◷", label: "Coming up", tone: "warning" },
  OVERDUE: { icon: "!", label: "Overdue", tone: "danger" },
  STATUS: { icon: "✓", label: "Status changed", tone: "success" },
  MENTION: { icon: "@", label: "Mentioned you", tone: "accent" },
  ANNOUNCEMENT: { icon: "📣", label: "Squadron alert", tone: "accent" }
};

export function NotificationCenter({
  initialNotifications,
  initialPrefs,
  addressesOn,
  initialChoice = "FOLLOW",
  squadronQuiet = false
}: {
  initialNotifications: NotificationRecord[];
  initialPrefs: NotificationPrefs;
  /** How many addresses this member has switched on, which the list below this card is where they change. */
  addressesOn: number;
  /** The member's own answer, which overrides the squadron-wide setting in both directions. */
  initialChoice?: EmailChoice;
  /** Whether the squadron has email switched off, so a member on FOLLOW can be told why it is quiet. */
  squadronQuiet?: boolean;
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [choice, setChoice] = useState<EmailChoice>(initialChoice);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const unread = notifications.filter((notice) => !notice.readAt).length;

  async function chooseEmail(next: EmailChoice) {
    if (next === choice || busy) return;
    const before = choice;
    setChoice(next);
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "emailChoice", choice: next })
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setChoice(before);
        setNote(data.message ?? "That could not be saved.");
        return;
      }
      setNote(data.message ?? "Saved.");
    } catch {
      setChoice(before);
      setNote("That did not reach the Hub. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function markAllRead() {
    setNotifications(notifications.map((notice) => ({ ...notice, readAt: notice.readAt ?? new Date().toISOString() })));
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read" })
    }).catch(() => undefined);
  }

  async function clear(ids?: string[]) {
    const before = notifications;
    // Gone from the page at once. A clear that waits for a round trip feels broken, and the list is put back
    // if the request fails rather than leaving somebody believing something was removed when it was not.
    setNotifications(ids ? notifications.filter((notice) => !ids.includes(notice.id)) : []);
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear", ...(ids ? { ids } : {}) })
      });
      if (!response.ok) throw new Error("failed");
    } catch {
      setNotifications(before);
      setNote("Those could not be cleared. Nothing was removed.");
    }
  }

  async function setEmail(on: boolean) {
    const previous = prefs;
    const next: NotificationPrefs = { ...prefs, emailEnabled: on };
    setPrefs(next);
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prefs", prefs: next })
      });
      if (!response.ok) throw new Error("That change could not be saved.");
      setNote(on ? "Turned on. Your next summary is at 6pm." : "Turned off. Everything still appears on this page.");
    } catch {
      setPrefs(previous);
      setNote("That change could not be saved.");
    } finally {
      setBusy(false);
    }
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

  return (
    <div className="nc">
      <style>{ncCss}</style>

      <section className="nc-card nc-explain">
        <h2>How this works</h2>
        <p>
          When someone gives you a job, it appears on this page straight away. <strong>Once a day at 6pm</strong> we
          email you everything that needs you — new jobs, anything due soon, anything late. One email, not one per job.
        </p>
        {/* Three answers rather than a checkbox, because the squadron can now switch email off for everybody
            and a member needs to be able to disagree with that in either direction. */}
        <div className="nc-choices" role="radiogroup" aria-label="Email me">
          {EMAIL_CHOICES.map((option) => (
            <label key={option.value} className={"nc-switch" + (choice === option.value ? " is-on" : "")}>
              <input
                type="radio"
                name="email-choice"
                checked={choice === option.value}
                disabled={busy}
                onChange={() => chooseEmail(option.value)}
              />
              <span>
                <strong>{option.label}</strong>
                <small>{option.detail}</small>
              </span>
            </label>
          ))}
        </div>
        {choice !== "NEVER" ? (
          <p className="nc-goes">
            Goes to {addressesOn === 1 ? "the address" : "the " + addressesOn + " addresses"} you have switched on below.
          </p>
        ) : null}
        {squadronQuiet && choice === "FOLLOW" ? (
          <p className="nc-quiet">
            Command has email switched off for the whole squadron at the moment, so nothing is being sent to
            you. Choose <strong>Always email me</strong> if you would rather keep getting it.
          </p>
        ) : null}
        {choice !== "NEVER" ? (
          <button type="button" className="nc-test-link" disabled={busy} onClick={sendTest}>
            {busy ? "Sending…" : "Send me one now to check it works"}
          </button>
        ) : null}
        {note ? <p className="nc-note" role="status">{note}</p> : null}
      </section>

      <section className="nc-card">
        <header className="nc-head">
          <div>
            <h2>Recent</h2>
            <p>{unread ? unread + " you have not read yet." : "You are up to date."}</p>
          </div>
          <div className="nc-head-actions">
            {unread ? <button type="button" className="nc-btn" onClick={markAllRead}>Mark all read</button> : null}
            {notifications.length ? <button type="button" className="nc-btn" onClick={() => clear()}>Clear all</button> : null}
          </div>
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
                  <button
                    type="button"
                    className="nc-clear"
                    aria-label={"Clear: " + notice.title}
                    title="Clear this one"
                    onClick={() => clear([notice.id])}
                  >
                    &times;
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="nc-empty">Nothing yet. When someone gives you work, or a deadline of yours gets close, it shows up here.</p>
        )}
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
  ".nc-explain h2{margin:0 0 6px;font-size:17px}",
  ".nc-explain>p{margin:0;font-size:14.5px;line-height:1.6;max-width:70ch}",
  ".nc-switch{display:flex;gap:11px;align-items:flex-start;margin-top:14px;padding:12px 13px;border:1px solid var(--cu-border,#e4e6eb);border-radius:10px;cursor:pointer}",
  "html[data-theme=dark] .nc-switch{border-color:#3a3d44}",
  ".nc-switch input{width:20px;height:20px;margin-top:1px;flex:0 0 auto;accent-color:#7b68ee}",
  ".nc-switch span{display:flex;flex-direction:column;gap:3px}",
  ".nc-switch strong{font-size:15px}",
  ".nc-switch small{font-size:13px;color:var(--cu-muted,#656f7d);line-height:1.5}",
  ".nc-choices{display:grid;gap:8px;margin-top:14px}",
  ".nc-choices .nc-switch{margin-top:0}",
  ".nc-switch.is-on{border-color:#7b68ee;background:rgba(123,104,238,.07)}",
  ".nc-goes{margin:10px 0 0;font-size:13px;color:var(--cu-muted,#656f7d)}",
  ".nc-quiet{margin:10px 0 0;font-size:13px;line-height:1.55;padding:10px 12px;border-radius:9px;background:rgba(229,154,0,.13)}",
  ".nc-test-link{margin-top:10px;border:0;background:none;padding:0;color:#7b68ee;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;text-decoration:underline}",
  ".nc-test-link:disabled{opacity:.6;cursor:default}",
  ".nc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}",
  ".nc-head h2{margin:0;font-size:16px}.nc-head p{margin:4px 0 0;font-size:13.5px;color:var(--cu-muted,#656f7d)}",
  ".nc-btn{border:1px solid var(--cu-border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:13.5px;font-weight:600;padding:8px 14px;border-radius:8px;cursor:pointer}",
  ".nc-list{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column}",
  ".nc-row{border-top:1px solid var(--cu-border,#eef0f3);display:flex;align-items:stretch;gap:0}",
  ".nc-row > a,.nc-row > .nc-plain{flex:1;min-width:0}",
  ".nc-clear{flex:0 0 auto;align-self:center;border:0;background:none;color:inherit;opacity:.35;font-size:19px;line-height:1;padding:6px 12px;cursor:pointer;border-radius:7px}",
  ".nc-clear:hover{opacity:1;color:#d03b3b}",
  ".nc-head-actions{display:flex;gap:8px;flex-wrap:wrap}",
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
  ".nc-note{margin:11px 0 0;font-size:13px;padding:9px 12px;border-radius:8px;background:rgba(123,104,238,.12)}",
  "@media (max-width:760px){.nc-card{padding:14px}}"
].join("");
