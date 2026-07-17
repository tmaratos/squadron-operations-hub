import { ArrowRight, Plus } from "lucide-react";
import { MetricCard } from "./metric-card";
import { PageHeader } from "./page-header";
import { SectionCard } from "./section-card";
import { StatusPill } from "./status-pill";
import type { ModuleDefinition } from "@/lib/types";

export function ModulePage({ definition }: { definition: ModuleDefinition }) {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Squadron operations"
        title={definition.title}
        description={definition.description}
        actions={
          <button className="button button--primary" type="button">
            <Plus size={16} /> Quick add
          </button>
        }
      />

      <section className="metric-grid metric-grid--four">
        {definition.stats.map((stat) => (
          <MetricCard key={stat.label} {...stat} />
        ))}
      </section>

      <div className="content-grid content-grid--wide">
        <SectionCard
          title="Current workload"
          description={definition.subtitle}
          action={<button className="button button--ghost">View all</button>}
        >
          <div className="record-list">
            {definition.records.map((record) => (
              <article className="record-row" key={record.id}>
                <div className={`record-row__marker record-row__marker--${record.tone}`} />
                <div className="record-row__content">
                  <strong>{record.primary}</strong>
                  <span>{record.secondary}</span>
                  {record.tertiary ? <small>{record.tertiary}</small> : null}
                </div>
                <StatusPill label={record.status} tone={record.tone} />
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Quick actions" description="Start common workflows without hunting through menus.">
          <div className="action-list">
            {definition.actions.map((action) => (
              <button className="action-card" type="button" key={action.label}>
                <span>
                  <strong>{action.label}</strong>
                  <small>{action.description}</small>
                </span>
                <ArrowRight size={18} />
              </button>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
