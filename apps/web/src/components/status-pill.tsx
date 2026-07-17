import type { Tone } from "@/lib/types";

export function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  return <span className={`status-pill status-pill--${tone}`}>{label}</span>;
}
