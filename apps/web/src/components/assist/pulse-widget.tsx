"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// The Hub, noticing things while somebody has it open.
//
// Three rules it follows, because an assistant that interrupts is worse than one that waits:
//
//   It is silent when there is nothing. No empty state, no "all clear" badge, nothing to dismiss. A widget
//   that is always visible is furniture, and furniture gets ignored along with whatever it says next.
//
//   It never acts on its own. Everything here is a suggestion with a button; the looking is automatic, the
//   doing is not.
//
//   It stays shut once shut. Minimising is remembered, so somebody who does not want it does not fight it
//   on every page.

interface Noticed {
  id: string;
  kind: "offer" | "mail" | "agent" | "drive";
  title: string;
  detail: string | null;
  href: string | null;
  actionable: boolean;
}

const ICON: Record<Noticed["kind"], string> = { offer: "✦", mail: "✉", agent: "🤖", drive: "📄" };

// A gentle cadence: often enough to feel alive, rare enough that nobody's laptop notices.
const QUIET_MINUTES = 6;

export function PulseWidget() {
  const [noticed, setNoticed] = useState<Noticed[]>([]);
  const [open, setOpen] = useState(false);
  const [minimised, setMinimised] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [gone, setGone] = useState<string[]>([]);
  const router = useRouter();

  useEffect(() => {
    try { setMinimised(localStorage.getItem("hub-pulse-open") !== "1"); } catch { /* fine without it */ }
  }, []);

  const look = useCallback(async (deep: boolean) => {
    try {
      const response = await fetch("/api/assist/pulse" + (deep ? "?deep=1" : ""));
      if (!response.ok) return;
      const data = (await response.json()) as { noticed?: Noticed[] };
      setNoticed(data.noticed ?? []);
    } catch {
      // A widget that cannot reach the server says nothing rather than complaining.
    }
  }, []);

  useEffect(() => {
    look(true);
    const timer = window.setInterval(() => {
      // Only while somebody is actually here. A background tab does not need watching.
      if (document.visibilityState === "visible") look(true);
    }, QUIET_MINUTES * 60000);
    return () => window.clearInterval(timer);
  }, [look]);

  async function act(item: Noticed, accept: boolean) {
    const offerId = item.id.replace(/^offer:/, "");
    setBusy(item.id);
    try {
      await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: accept ? "accept" : "dismiss", offerId })
      });
      setGone((current) => [...current, item.id]);
      await look(false);
      if (accept) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const showing = noticed.filter((item) => !gone.includes(item.id));
  if (!showing.length) return null; // silent when there is nothing to say

  return (
    <div className={"pw" + (open && !minimised ? " is-open" : "")}>
      <style>{pwCss}</style>

      <button
        type="button"
        className="pw-tab"
        onClick={() => {
          const next = !(open && !minimised);
          setOpen(next);
          setMinimised(!next);
          try { localStorage.setItem("hub-pulse-open", next ? "1" : "0"); } catch { /* fine */ }
        }}
        aria-expanded={open && !minimised}
      >
        <span className="pw-spark" aria-hidden="true">✦</span>
        <span>{showing.length === 1 ? "The Hub noticed something" : "The Hub noticed " + showing.length + " things"}</span>
        <span className="pw-chev" aria-hidden="true">{open && !minimised ? "▾" : "▴"}</span>
      </button>

      {open && !minimised ? (
        <div className="pw-body">
          {showing.slice(0, 5).map((item) => (
            <article key={item.id} className="pw-item">
              <span className="pw-icon" aria-hidden="true">{ICON[item.kind]}</span>
              <div className="pw-text">
                <strong>{item.title}</strong>
                {item.detail ? <span>{item.detail}</span> : null}
              </div>
              <div className="pw-do">
                {item.actionable ? (
                  <>
                    <button type="button" className="pw-yes" disabled={busy === item.id} onClick={() => act(item, true)}>
                      {busy === item.id ? "…" : "Do it"}
                    </button>
                    <button type="button" className="pw-no" disabled={busy === item.id} onClick={() => act(item, false)}>Not now</button>
                  </>
                ) : item.href ? (
                  <Link className="pw-yes" href={item.href}>Look</Link>
                ) : null}
              </div>
            </article>
          ))}
          {showing.length > 5 ? <p className="pw-more">and {showing.length - 5} more</p> : null}
          <p className="pw-foot">It looks on its own. It never does anything without being told.</p>
        </div>
      ) : null}
    </div>
  );
}

const pwCss = [
  ".pw{position:fixed;right:18px;bottom:18px;z-index:120;width:min(380px,calc(100vw - 36px));display:flex;flex-direction:column;align-items:stretch;border-radius:12px;overflow:hidden;box-shadow:0 16px 44px rgba(9,20,44,.3);border:1px solid var(--cu-border,#e4e6eb);background:var(--cu-bg,#fff)}",
  "html[data-theme=dark] .pw{background:#1f2024;border-color:#34363b}",
  ".pw-tab{display:flex;align-items:center;gap:9px;width:100%;border:0;background:linear-gradient(135deg,#7b68ee,#9b6bd6);color:#fff;font:inherit;font-size:13px;font-weight:600;padding:10px 13px;cursor:pointer;text-align:left}",
  ".pw-spark{font-size:14px}",
  ".pw-tab span:nth-child(2){flex:1;min-width:0}",
  ".pw-chev{opacity:.85;font-size:11px}",
  ".pw-body{display:flex;flex-direction:column;max-height:min(58vh,460px);overflow-y:auto}",
  ".pw-item{display:flex;gap:10px;align-items:flex-start;padding:11px 13px;border-bottom:1px solid var(--cu-border,#eef0f3)}",
  "html[data-theme=dark] .pw-item{border-color:#2c2e33}",
  ".pw-icon{flex:none;width:24px;height:24px;display:grid;place-items:center;border-radius:7px;background:rgba(123,104,238,.14);font-size:12px}",
  ".pw-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}",
  ".pw-text strong{font-size:13px;line-height:1.35}",
  ".pw-text span{font-size:11.5px;opacity:.65;line-height:1.4}",
  ".pw-do{display:flex;flex-direction:column;gap:4px;flex:none}",
  ".pw-yes{border:0;background:#7b68ee;color:#fff;font:inherit;font-size:11.5px;font-weight:600;padding:4px 9px;border-radius:6px;cursor:pointer;text-decoration:none;text-align:center;white-space:nowrap}",
  ".pw-no{border:0;background:none;color:var(--cu-muted,#656f7d);font:inherit;font-size:11.5px;font-weight:600;padding:2px 9px;border-radius:6px;cursor:pointer;white-space:nowrap}",
  ".pw-no:hover{color:var(--cu-text,#292d34)}",
  ".pw-more{margin:0;padding:8px 13px;font-size:11.5px;opacity:.6}",
  ".pw-foot{margin:0;padding:9px 13px;font-size:11px;opacity:.5;border-top:1px solid var(--cu-border,#eef0f3)}",
  "@media (max-width:760px){.pw{right:10px;left:10px;bottom:76px;width:auto}}"
].join("");
