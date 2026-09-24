"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// The Hub, noticing things while somebody has it open.
//
// A small circle rather than a bar across the corner, because the corner is where the task panel and the
// comment box already are, and a permanent horizontal strip covers them. The circle can be dragged
// anywhere and stays where it was put, so somebody who wants it out of the way can put it out of the way
// rather than asking me to guess where the way is.
//
// Three rules it keeps:
//   Silent when there is nothing. No empty badge, nothing to dismiss. A thing that is always on screen is
//   furniture, and furniture is ignored along with whatever it says next.
//   It never acts on its own. The looking is automatic; the doing is a button somebody presses.
//   Where it sits, and whether it is open, are remembered.

interface Noticed {
  id: string;
  kind: "offer" | "mail" | "agent" | "drive";
  title: string;
  detail: string | null;
  href: string | null;
  actionable: boolean;
}

const ICON: Record<Noticed["kind"], string> = { offer: "✦", mail: "✉", agent: "🤖", drive: "📄" };
const QUIET_MINUTES = 6;
const SIZE = 52;

interface Spot { x: number; y: number }

function within(spot: Spot): Spot {
  if (typeof window === "undefined") return spot;
  return {
    x: Math.min(Math.max(spot.x, 8), Math.max(8, window.innerWidth - SIZE - 8)),
    y: Math.min(Math.max(spot.y, 8), Math.max(8, window.innerHeight - SIZE - 8))
  };
}

export function PulseWidget() {
  const [noticed, setNoticed] = useState<Noticed[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [gone, setGone] = useState<string[]>([]);
  const [spot, setSpot] = useState<Spot | null>(null);
  const dragging = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Clear of the bottom bar on a phone, which is 72px of it plus whatever the device reserves below.
    const fromBottom = window.innerWidth <= 900 ? 96 : 22;
    let start: Spot = { x: window.innerWidth - SIZE - 22, y: window.innerHeight - SIZE - fromBottom };
    try {
      const saved = localStorage.getItem("hub-pulse-spot");
      if (saved) {
        const parsed = JSON.parse(saved) as Spot;
        if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) start = parsed;
      }
    } catch { /* a default corner is fine */ }
    setSpot(within(start));

    // Keep it on screen when the window changes shape, rather than stranded off the edge.
    const onResize = () => setSpot((current) => (current ? within(current) : current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const look = useCallback(async (deep: boolean) => {
    try {
      const response = await fetch("/api/assist/pulse" + (deep ? "?deep=1" : ""));
      if (!response.ok) return;
      const data = (await response.json()) as { noticed?: Noticed[] };
      setNoticed(data.noticed ?? []);
    } catch { /* says nothing rather than complaining */ }
  }, []);

  useEffect(() => {
    look(true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") look(true);
    }, QUIET_MINUTES * 60000);
    return () => window.clearInterval(timer);
  }, [look]);

  useEffect(() => {
    if (!dragging.current) return;
    const move = (event: PointerEvent) => {
      if (!dragging.current) return;
      dragging.current.moved = true;
      setSpot(within({ x: event.clientX - dragging.current.dx, y: event.clientY - dragging.current.dy }));
    };
    const up = () => {
      const moved = dragging.current?.moved;
      dragging.current = null;
      setSpot((current) => {
        if (current) { try { localStorage.setItem("hub-pulse-spot", JSON.stringify(current)); } catch { /* fine */ } }
        return current;
      });
      // A drag is not a click. Without this, putting it down opens it every time.
      if (!moved) setOpen((was) => !was);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  });

  async function act(item: Noticed, accept: boolean) {
    setBusy(item.id);
    try {
      await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: accept ? "accept" : "dismiss", offerId: item.id.replace(/^offer:/, "") })
      });
      setGone((current) => [...current, item.id]);
      await look(false);
      if (accept) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const showing = noticed.filter((item) => !gone.includes(item.id));
  if (!showing.length || !spot) return null;

  // The panel opens towards whichever side and corner there is room in.
  const leftHalf = spot.x < window.innerWidth / 2;
  const topHalf = spot.y < window.innerHeight / 2;

  return (
    <>
      <style>{pwCss}</style>

      <button
        type="button"
        className="pw-ball"
        style={{ left: spot.x, top: spot.y }}
        title="What the Hub noticed — drag to move"
        aria-label={showing.length + " things the Hub noticed"}
        onPointerDown={(event) => {
          event.preventDefault();
          dragging.current = { dx: event.clientX - spot.x, dy: event.clientY - spot.y, moved: false };
          setSpot({ ...spot });
        }}
      >
        <span className="pw-spark" aria-hidden="true">✦</span>
        <span className="pw-count">{showing.length}</span>
      </button>

      {open ? (
        <div
          className="pw-panel"
          style={{
            left: leftHalf ? spot.x : undefined,
            right: leftHalf ? undefined : Math.max(8, window.innerWidth - spot.x - SIZE),
            top: topHalf ? spot.y + SIZE + 8 : undefined,
            bottom: topHalf ? undefined : Math.max(8, window.innerHeight - spot.y + 8)
          }}
        >
          <div className="pw-head">
            <strong>{showing.length === 1 ? "The Hub noticed something" : "The Hub noticed " + showing.length + " things"}</strong>
            <button type="button" className="pw-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
          </div>

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
                    <Link className="pw-yes" href={item.href} onClick={() => setOpen(false)}>Look</Link>
                  ) : null}
                </div>
              </article>
            ))}
            {showing.length > 5 ? <p className="pw-more">and {showing.length - 5} more</p> : null}
          </div>

          <p className="pw-foot">It looks on its own. It never does anything without being told.</p>
        </div>
      ) : null}
    </>
  );
}

const pwCss = [
  ".pw-ball{position:fixed;z-index:130;width:52px;height:52px;border-radius:50%;border:0;cursor:grab;display:grid;place-items:center;background:linear-gradient(135deg,#7b68ee,#9b6bd6);color:#fff;box-shadow:0 8px 24px rgba(9,20,44,.34);touch-action:none;padding:0}",
  ".pw-ball:active{cursor:grabbing}",
  ".pw-ball .pw-spark{font-size:19px;line-height:1}",
  ".pw-count{position:absolute;top:-3px;right:-3px;min-width:19px;height:19px;padding:0 5px;border-radius:999px;background:#e5484d;color:#fff;font-size:11px;font-weight:700;display:grid;place-items:center;border:2px solid var(--cu-bg,#fff)}",
  "html[data-theme=dark] .pw-count{border-color:#1f2024}",
  ".pw-panel{position:fixed;z-index:129;width:min(360px,calc(100vw - 16px));max-width:calc(100vw - 16px);border-radius:12px;overflow:hidden;border:1px solid var(--cu-border,#e4e6eb);background:var(--cu-bg,#fff);box-shadow:0 18px 48px rgba(9,20,44,.32)}",
  "html[data-theme=dark] .pw-panel{background:#1f2024;border-color:#34363b}",
  ".pw-head{display:flex;align-items:center;gap:8px;padding:11px 13px;border-bottom:1px solid var(--cu-border,#eef0f3);font-size:13px}",
  "html[data-theme=dark] .pw-head{border-color:#2c2e33}",
  ".pw-head strong{flex:1;min-width:0}",
  ".pw-close{border:0;background:none;color:inherit;opacity:.5;font-size:19px;line-height:1;cursor:pointer;padding:0 2px}",
  ".pw-close:hover{opacity:1}",
  ".pw-body{display:flex;flex-direction:column;max-height:min(54vh,420px);overflow-y:auto}",
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
  "html[data-theme=dark] .pw-foot{border-color:#2c2e33}"
].join("");
