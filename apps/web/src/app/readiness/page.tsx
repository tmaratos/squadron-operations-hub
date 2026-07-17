import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatusPill } from "@/components/status-pill";
import { functionalAreaStatus } from "@/lib/mock-data";

export default function ReadinessPage() {
  const overall = Math.round(functionalAreaStatus.reduce((sum, area) => sum + area.score, 0) / functionalAreaStatus.length);
  const atRisk = functionalAreaStatus.filter((area) => area.status !== "On Track").length;

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Command assurance" title="Squadron Readiness" description="A consolidated view of staffing, compliance, evidence, open risk, and functional-area performance." />
      <section className="metric-grid metric-grid--four">
        <MetricCard label="Overall Readiness" value={`${overall}%`} detail="Across all functional areas" tone="success" />
        <MetricCard label="Areas At Risk" value={atRisk} detail="Need command attention" tone="warning" />
        <MetricCard label="Open Findings" value={7} detail="2 high priority" tone="danger" />
        <MetricCard label="Evidence Coverage" value="91%" detail="Current inspection cycle" tone="success" />
      </section>
      <SectionCard title="Functional-area readiness" description="Score each area using its open tasks, evidence, staffing, deadlines, and findings.">
        <div className="readiness-list">
          {functionalAreaStatus.map((area) => (
            <article key={area.key}>
              <div className="readiness-list__heading"><div><strong>{area.name}</strong><span>{area.status}</span></div><StatusPill label={`${area.score}%`} tone={area.tone} /></div>
              <div className={`progress progress--${area.tone}`}><span style={{ width: `${area.score}%` }} /></div>
              <div className="readiness-list__details"><span>Tasks: {area.score < 80 ? "Action required" : "On track"}</span><span>Evidence: {Math.min(100, area.score + 4)}%</span><span>Staffing: {area.score < 75 ? "Vacancy" : "Covered"}</span></div>
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
