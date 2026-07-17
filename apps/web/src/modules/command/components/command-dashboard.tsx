import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FilePlus2,
  MessageSquareText,
  Plus,
  ShieldAlert,
  Users
} from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { StatusPill } from "@/components/status-pill";
import {
  activityItems,
  dashboardMetrics,
  deadlines,
  functionalAreaStatus,
  priorityItems
} from "@/lib/mock-data";

export function CommandDashboard() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Friday, July 17, 2026"
        title="Command Dashboard"
        description="One operational view of deadlines, risks, assignments, approvals, and readiness."
        actions={
          <button className="button button--secondary" type="button">
            Customize dashboard
          </button>
        }
      />

      <section className="metric-grid metric-grid--dashboard">
        {dashboardMetrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <div className="dashboard-grid">
        <SectionCard
          title="Priority items"
          description="The work most likely to affect readiness or deadlines."
          action={<Link className="button button--ghost" href="/tasks">View all</Link>}
          className="dashboard-grid__priority"
        >
          <div className="priority-table" role="table" aria-label="Priority items">
            <div className="priority-table__header" role="row">
              <span>Item</span><span>Category</span><span>Due</span><span>Status</span><span>Assigned to</span>
            </div>
            {priorityItems.map((item) => (
              <div className="priority-table__row" role="row" key={item.id}>
                <div><strong>{item.title}</strong><small>{item.subtitle}</small></div>
                <span className="category-label">{item.category}</span>
                <div><span>{item.due}</span><small className={`text-${item.tone}`}>{item.dueDetail}</small></div>
                <StatusPill label={item.status} tone={item.tone} />
                <span>{item.assignedTo}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Recent activity"
          description="Changes across the squadron."
          action={<button className="button button--ghost">View all</button>}
          className="dashboard-grid__activity"
        >
          <div className="activity-list">
            {activityItems.map((item) => (
              <article key={item.id}>
                <span className={`activity-list__icon activity-list__icon--${item.tone}`}><CheckCircle2 size={17} /></span>
                <div><strong>{item.title}</strong><span>{item.detail}</span><small>by {item.actor}</small></div>
                <time>{item.timestamp}</time>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Upcoming deadlines"
          action={<Link className="button button--ghost" href="/calendar">View calendar</Link>}
          className="dashboard-grid__deadlines"
        >
          <div className="deadline-list">
            {deadlines.map((deadline) => (
              <article key={`${deadline.month}-${deadline.day}-${deadline.title}`}>
                <div className={`date-tile date-tile--${deadline.tone}`}><span>{deadline.month}</span><strong>{deadline.day}</strong></div>
                <div><strong>{deadline.title}</strong><span>{deadline.cadence}</span><small className={`text-${deadline.tone}`}>{deadline.timing}</small></div>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Functional area status"
          description="Readiness by staff section."
          action={<Link className="button button--ghost" href="/readiness">View readiness</Link>}
          className="dashboard-grid__areas"
        >
          <div className="area-grid">
            {functionalAreaStatus.map((area) => (
              <article key={area.key}>
                <div><strong>{area.name}</strong><span>{area.status}</span></div>
                <b>{area.score}%</b>
                <div className={`progress progress--${area.tone}`}><span style={{ width: `${area.score}%` }} /></div>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Notifications" action={<Link className="button button--ghost" href="/notifications">View all</Link>} className="dashboard-grid__notifications">
          <div className="notification-list">
            <article><ShieldAlert size={18} /><div><strong>CPPT for 2 members expires this month</strong><span>Review training records</span></div><time>1h</time></article>
            <article><ClipboardCheck size={18} /><div><strong>6 overdue tasks need attention</strong><span>Open the escalation queue</span></div><time>2h</time></article>
            <article><FilePlus2 size={18} /><div><strong>Rocket motor inventory is low</strong><span>View logistics inventory</span></div><time>5h</time></article>
          </div>
        </SectionCard>
      </div>

      <section className="quick-actions-bar">
        <strong>Quick actions</strong>
        <div>
          <Link href="/tasks"><Plus size={17} /> Create task</Link>
          <Link href="/meetings"><CalendarDays size={17} /> Schedule meeting</Link>
          <Link href="/documents"><FilePlus2 size={17} /> Add document</Link>
          <Link href="/inspections"><ShieldAlert size={17} /> Log finding</Link>
          <Link href="/staff"><Users size={17} /> Message staff</Link>
          <Link href="/communications"><MessageSquareText size={17} /> Open Discord</Link>
        </div>
      </section>
    </div>
  );
}
