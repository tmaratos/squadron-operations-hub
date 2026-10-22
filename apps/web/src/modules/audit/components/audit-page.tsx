import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { listAuditEvents } from "@/lib/db/audit";
import { AuditExplorer } from "./audit-explorer";

export async function AuditPage() {
  const events = await listAuditEvents();
  return (
    <div className="page-stack audit-experience">
      <PageHeader eyebrow="Security and operations" title="Activity history"
        description="Find recorded security, account, document, and administrative actions. Records cannot be changed here." />
      <SectionCard title="Recent recorded actions"
        description="The newest 200 events are available for searching and filtering. Search operates only on the events displayed, not the entire database.">
        <AuditExplorer events={events.map(({ id, summary, actorName, action, entityType, createdAt }) =>
          ({ id, summary, actorName, action, entityType, createdAt }))} />
      </SectionCard>
    </div>
  );
}
