import type { CSSProperties } from "react";

type Tone = "danger" | "warning" | "success" | "info";

const toneColors: Record<Tone, string> = {
  danger: "var(--danger)",
  warning: "var(--warning)",
  success: "var(--success)",
  info: "var(--accent)"
};

export function StatCard({
  label,
  value,
  tone
}: {
  label: string;
  value: string | number;
  tone: Tone;
}) {
  const style: CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: 18
  };

  return (
    <article style={style}>
      <strong style={{ display: "block", fontSize: 30, color: toneColors[tone] }}>
        {value}
      </strong>
      <span style={{ color: "var(--muted)" }}>{label}</span>
    </article>
  );
}
