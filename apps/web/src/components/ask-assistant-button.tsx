"use client";

import type { ReactNode } from "react";

/** Opens the assistant panel from anywhere, including pages drawn on the server. */
export function AskAssistantButton({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new CustomEvent("hub:ask"))}>
      {children}
    </button>
  );
}
