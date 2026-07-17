import type { Tone } from "@/lib/types";

export function MetricCard({
  label,
  value,
  detail,
  tone,
  progress
}: {
  label: string;
  value: string | number;
  detail: string;
  tone: Tone;
  progress?: number;
}) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__value">{value}</div>
      <div className="metric-card__label">{label}</div>
      <div className="metric-card__detail">{detail}</div>
      {typeof progress === "number" ? (
        <div className="metric-card__track" aria-label={`${progress}%`}>
          <span style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </article>
  );
}
