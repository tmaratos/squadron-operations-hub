import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatusPill } from "@/components/status-pill";
import { functionalAreaStatus } from "@/lib/mock-data";

export default function ReadinessPage() {
  const overall = Math.round(functionalAreaStatus.reduce((sum, area) => sum + area.score, 0) / functionalAreaStatus.length);
  const atRisk = functionalAreaStatus.filter((area) => area.status !== "On Track").length;

  return (
    <div className="page-stack readiness-experience">
      <PageHeader eyebrow="Command assurance" title="Readiness preview" description="An illustrative view of how functional-area readiness can be presented when linked to verified live records." />
      <aside className="demo-disclosure" role="note">
        <AlertTriangle size={20} aria-hidden="true" />
        <div>
          <strong>Demonstration data — not verified squadron readiness</strong>
          <span>The scores, findings and evidence percentages below currently come from sample data. Do not use them for reporting, inspections or operational decisions. For actual records, review </span>
          <Link href="/compliance">Compliance</Link><span>, </span><Link href="/staff">Personnel</Link>
          <span> and </span><Link href="/tasks">Tasks</Link><span>.</span>
        </div>
      </aside>
      <section className="metric-grid metric-grid--four">
        <MetricCard label="Sample readiness" value={`${overall}%`} detail="Illustrative score only" tone="success" />
        <MetricCard label="Sample areas at risk" value={atRisk} detail="Illustrative count only" tone="warning" />
        <MetricCard label="Sample findings" value={7} detail="Illustrative count only" tone="danger" />
        <MetricCard label="Sample evidence" value="91%" detail="Illustrative percentage only" tone="success" />
      </section>
      <SectionCard title="Illustrative functional-area scores" description="This preview uses sample readiness scores and does not currently compute verified metrics from CAPWATCH, tasks or evidence.">
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
      <nav aria-label="Go to live operational records" style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        <Link className="button button--primary" href="/compliance">View real compliance requirements <ArrowRight size={16} /></Link>
        <Link className="button" href="/staff">View personnel <ArrowRight size={16} /></Link>
      </nav>
    </div>
  );
}
