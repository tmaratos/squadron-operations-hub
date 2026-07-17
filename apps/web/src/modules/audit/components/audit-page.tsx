import { History, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { listAuditEvents } from "@/lib/db/audit";

export async function AuditPage() {
  const events = await listAuditEvents();
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Immutable operational history" title="Audit Log" description="Security, access, document, and administrative actions recorded by the application." />
      <SectionCard title="Recent events" description="The newest 200 events are shown. Audit records cannot be edited through the web interface.">
        {events.length ? (
          <div className="audit-event-list">
            {events.map((event) => (
              <article key={event.id}>
                <span className="audit-event-icon"><History size={17} /></span>
                <div><strong>{event.summary}</strong><span>{event.action.replaceAll("_", " ")} · {event.entityType}</span><small>{event.actorName ? `by ${event.actorName}` : "System event"}</small></div>
                <time>{formatDate(event.createdAt)}</time>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state"><ShieldCheck size={26} /><strong>No audit events yet</strong><span>Approvals, sign-ins, role changes, and Drive actions will appear here.</span></div>
        )}
      </SectionCard>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
