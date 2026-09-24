"use client";

import { useEffect, useRef, useState } from "react";

// Asking "are you sure?" inside the page, rather than through window.confirm.
//
// A browser dialog can be switched off - by the member ticking "prevent this page from creating more
// dialogs", by an embedded browser, by a pop-up blocker - and when it is, confirm() returns false without
// showing anything. Every destructive button in the Hub then does nothing at all, silently, and the member
// concludes the feature is broken. Which is exactly what happened with deleting a conversation.
//
// This asks in the page itself, so it cannot be suppressed, and it reads better anyway: the question
// appears where the button was, and goes away on its own if it is ignored.

export function ConfirmButton({
  className = "",
  confirmClassName,
  onConfirm,
  disabled,
  title,
  ariaLabel,
  question = "Sure?",
  children
}: {
  className?: string;
  confirmClassName?: string;
  onConfirm: () => void;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  question?: string;
  children: React.ReactNode;
}) {
  const [asking, setAsking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!asking) return;
    // An unanswered question puts itself away, so a stray click does not leave a trap on the page.
    timer.current = setTimeout(() => setAsking(false), 6000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [asking]);

  if (asking) {
    return (
      <span className="cb" role="group" aria-label={question}>
        <style>{cbCss}</style>
        <span className="cb-q">{question}</span>
        <button
          type="button"
          className={confirmClassName ?? "cb-yes"}
          onClick={() => { setAsking(false); onConfirm(); }}
        >
          Yes
        </button>
        <button type="button" className="cb-no" onClick={() => setAsking(false)}>No</button>
      </span>
    );
  }

  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      onClick={() => setAsking(true)}
    >
      {children}
    </button>
  );
}

const cbCss = [
  ".cb{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}",
  ".cb-q{font-size:12.5px;font-weight:600;color:#c03030}",
  "html[data-theme=dark] .cb-q{color:#f5a9a9}",
  ".cb-yes{border:0;background:#d03b3b;color:#fff;font:inherit;font-size:12.5px;font-weight:700;padding:5px 11px;border-radius:7px;cursor:pointer}",
  ".cb-no{border:1px solid var(--cu-border,#e4e6eb);background:none;color:inherit;font:inherit;font-size:12.5px;font-weight:600;padding:4px 10px;border-radius:7px;cursor:pointer}"
].join("");
