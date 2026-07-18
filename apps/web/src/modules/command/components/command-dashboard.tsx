import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Cloud,
  FilePlus2,
  FolderOpen,
  Gauge,
  MessageSquareText,
  Plus,
  Radio,
  ShieldAlert,
  Users,
  Wrench
} from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { SectionCard } from "@/components/section-card";
import { StatusPill } from "@/components/status-pill";
import { listPendingAccessRequests } from "@/lib/auth/repository";
import { listAuditEvents } from "@/lib/db/audit";
import { getTaskSummary, listFunctionalAreaReadiness, listTasks } from "@/lib/operations/tasks";
import type { OperationalTask, TaskStatus } from "@/lib/operations/types";
import type { Tone } from "@/lib/types";

export async function CommandDashboard() {
  const [summary, tasks, areas, activity, pendingAccess] = await Promise.all([
    getTaskSummary(),
    listTasks({ includeCompleted: false, limit: 100 }),
    listFunctionalAreaReadiness(),
    listAuditEvents(6),
    listPendingAccessRequests()
  ]);

  const readinessScore = areas.length
    ? Math.round(areas.reduce((total, area) => total + area.score, 0) / areas.length)
    : 100;

  const priorityTasks = [...tasks].sort((a, b) => priorityRank(a) - priorityRank(b)).slice(0, 5);
  const deadlines = tasks.filter((task) => task.dueOn).sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999")).slice(0, 5);

  const metrics = [
    { label: "Overdue Items", value: summary.overdue, detail: "Require immediate attention", tone: summary.overdue ? "danger" : "success", progress: Math.min(summary.overdue * 12, 100) },
    { label: "Due This Week", value: summary.dueThisWeek, detail: "Upcoming deadlines", tone: summary.dueThisWeek ? "warning" : "success", progress: Math.min(summary.dueThisWeek * 10, 100) },
    { label: "Awaiting Approval", value: summary.awaitingApproval, detail: "Items pending your review", tone: summary.awaitingApproval ? "warning" : "success", progress: Math.min(summary.awaitingApproval * 18, 100) },
    { label: "Open Tasks", value: summary.open + summary.inProgress + summary.blocked + summary.awaitingApproval, detail: "Active assignments", tone: "info", progress: Math.min((summary.open + summary.inProgress) * 5, 100) },
    { label: "Readiness Score", value: `${readinessScore}%`, detail: "Overall squadron", tone: readinessScore >= 85 ? "success" : readinessScore >= 70 ? "warning" : "danger", progress: readinessScore }
  ] as const;

  const connectedApps = [
    { name: "Discord", detail: "3 new staff messages", icon: MessageSquareText, href: "/communications" },
    { name: "Drive", detail: "AE lesson plans updated", icon: FolderOpen, href: "/documents" },
    { name: "Calendar", detail: "Next event Tue 1900", icon: CalendarDays, href: "/calendar" },
    { name: "eServices", detail: "Open exact module", icon: Cloud, href: "/settings" },
    { name: "BAND", detail: "2 new posts", icon: Radio, href: "/communications" },
    { name: "Attendance", detail: "92% recorded", icon: Users, href: "/reports" }
  ];

  return (
    <div className="page-stack command-page">
      <header className="command-page__header">
        <div className="command-page__title">
          <h1>Command Dashboard</h1>
          <p>{new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date())}</p>
        </div>
        <div className="command-page__controls">
          <div className="segmented-control">
            <span className="is-active"><Users size={15} /> Commander View</span>
            <Link href="/staff">My Duty Positions</Link>
          </div>
          <Link className="button button--secondary" href="/settings"><Wrench size={15} /> Customize Dashboard</Link>
        </div>
      </header>

      <section className="metric-grid command-metrics">
        {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
      </section>

      <section className="connected-workspace">
        <div className="connected-workspace__head"><h2>Connected Workspace</h2><span>About 15 senior members connected</span></div>
        <div className="connected-workspace__apps">
          {connectedApps.map(({ name, detail, icon: Icon, href }) => (
            <Link className="workspace-app" href={href} key={name}>
              <span className="workspace-app__icon"><Icon size={16} /></span>
              <span className="workspace-app__copy"><strong>{name}</strong><span>{detail}</span></span>
              <span className="workspace-app__dot" />
            </Link>
          ))}
        </div>
      </section>

      <div className="command-layout">
        <div className="command-primary">
          <SectionCard title="Priority Items" action={<Link className="button button--ghost" href="/tasks">View All</Link>} className="command-priority">
            {priorityTasks.length ? (
              <div className="priority-table" role="table" aria-label="Priority items">
                <div className="priority-table__header" role="row"><span>Item</span><span>Category</span><span>Due Date</span><span>Status</span><span>Assigned To</span></div>
                {priorityTasks.map((task) => (
                  <div className="priority-table__row" role="row" key={task.id}>
                    <div><strong>{task.title}</strong><small>{task.description || `${formatPriority(task.priority)} priority`}</small></div>
                    <span className="category-label">{task.functionalAreaName}</span>
                    <div><span>{task.dueOn ? formatDate(task.dueOn) : "No due date"}</span><small className={`text-${dueTone(task)}`}>{dueDetail(task)}</small></div>
                    <StatusPill label={formatStatus(task.status)} tone={toneForStatus(task.status)} />
                    <span>{task.ownerName || "Unassigned"}</span>
                  </div>
                ))}
              </div>
            ) : <div className="empty-state"><strong>No active tasks</strong><span>Create the first suspense item to begin tracking squadron work.</span><Link className="button button--primary" href="/tasks">Create task</Link></div>}
          </SectionCard>

          <SectionCard title="Functional Area Status" action={<Link className="button button--ghost" href="/readiness">View All</Link>}>
            <div className="area-grid command-area-grid">
              {areas.slice(0, 12).map((area) => {
                const tone: Tone = area.score >= 85 ? "success" : area.score >= 70 ? "warning" : "danger";
                return (
                  <article key={area.key}>
                    <div><strong>{area.name}</strong><span>{area.status}{area.openTasks ? `, ${area.openTasks} open` : ""}</span></div>
                    <b>{area.score}%</b>
                    <div className={`progress progress--${tone}`}><span style={{ width: `${area.score}%` }} /></div>
                  </article>
                );
              })}
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Recent Activity" action={<Link className="button button--ghost" href="/audit">View All</Link>} className="command-activity">
          {activity.length ? (
            <div className="activity-list">
              {activity.map((item) => (
                <article key={item.id}>
                  <span className="activity-list__icon activity-list__icon--info"><CheckCircle2 size={17} /></span>
                  <div><strong>{formatAuditAction(item.action)}</strong><span>{item.summary}</span><small>{item.actorName ? `by ${item.actorName}` : "System event"}</small></div>
                  <time>{relativeTime(item.createdAt)}</time>
                </article>
              ))}
            </div>
          ) : <div className="empty-state"><strong>No activity yet</strong><span>Account, task, and document changes will appear here.</span></div>}
        </SectionCard>

        <aside className="command-rail">
          <SectionCard title="Upcoming Deadlines" action={<Link className="button button--ghost" href="/calendar">View Calendar</Link>}>
            {deadlines.length ? (
              <div className="deadline-list">
                {deadlines.map((task) => {
                  const date = new Date(`${task.dueOn}T00:00:00Z`);
                  return (
                    <article key={task.id}>
                      <div className={`date-tile date-tile--${dueTone(task)}`}><span>{date.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase()}</span><strong>{date.getUTCDate()}</strong></div>
                      <div><strong>{task.title}</strong><span>{task.functionalAreaName}</span><small className={`text-${dueTone(task)}`}>{dueDetail(task)}</small></div>
                    </article>
                  );
                })}
              </div>
            ) : <div className="empty-state"><strong>No upcoming deadlines</strong><span>Tasks with due dates will appear here.</span></div>}
          </SectionCard>

          <SectionCard title="Notifications" action={<Link className="button button--ghost" href="/notifications">View All</Link>}>
            <div className="notification-list">
              {summary.overdue ? <article><ShieldAlert size={18} /><div><strong>{summary.overdue} overdue tasks need attention</strong><span>View all overdue assignments.</span></div><time>Now</time></article> : null}
              {summary.blocked ? <article><ClipboardCheck size={18} /><div><strong>{summary.blocked} blocked tasks</strong><span>Leadership intervention may be required.</span></div><time>Now</time></article> : null}
              {pendingAccess.length ? <article><Users size={18} /><div><strong>{pendingAccess.length} access requests pending</strong><span>Review senior member access.</span></div><time>Now</time></article> : null}
              {!summary.overdue && !summary.blocked && !pendingAccess.length ? <article><CheckCircle2 size={18} /><div><strong>No urgent notifications</strong><span>Current operational queues are clear.</span></div><time>Now</time></article> : null}
            </div>
          </SectionCard>

          <SectionCard title="Calendar Preview" action={<Link className="button button--ghost" href="/calendar">View Calendar</Link>}>
            <div className="calendar-preview">
              {[["JUL","21","Staff Meeting","Tue, 1830 – 2030"],["JUL","22","PT Test","Wed, 0800 – 1200"],["JUL","25","Aerospace Activity","Sat, 1300 – 1900"]].map(([month, day, title, detail]) => (
                <article key={`${month}-${day}-${title}`}>
                  <div className="calendar-preview__date"><span>{month}</span><strong>{day}</strong></div>
                  <div className="calendar-preview__copy"><strong>{title}</strong><span>{detail}</span></div>
                  <CalendarDays size={14} />
                </article>
              ))}
            </div>
          </SectionCard>
        </aside>
      </div>

      <section className="quick-actions-bar command-quick-actions">
        <strong>Quick Actions</strong>
        <div>
          <Link href="/tasks"><Plus size={16} /><strong>Create Task</strong><small>Assign to staff</small></Link>
          <Link href="/meetings"><CalendarDays size={16} /><strong>Schedule Meeting</strong><small>Add to calendar</small></Link>
          <Link href="/documents"><FilePlus2 size={16} /><strong>Add Document</strong><small>Upload & share</small></Link>
          <Link href="/inspections"><ShieldAlert size={16} /><strong>Log Incident</strong><small>Safety reporting</small></Link>
          <Link href="/reports"><Gauge size={16} /><strong>Submit Report</strong><small>Official reporting</small></Link>
          <Link href="/tasks"><ClipboardCheck size={16} /><strong>Request Approval</strong><small>Send for review</small></Link>
          <Link href="/communications"><MessageSquareText size={16} /><strong>Message Staff</strong><small>Secure comms</small></Link>
          <Link href="/calendar"><CalendarDays size={16} /><strong>View Calendar</strong><small>Open schedule</small></Link>
        </div>
      </section>
    </div>
  );
}

function priorityRank(task: OperationalTask): number {
  const statusRank: Record<TaskStatus, number> = { BLOCKED: 0, AWAITING_APPROVAL: 1, IN_PROGRESS: 2, OPEN: 3, COMPLETED: 4, CANCELLED: 5 };
  const priorityRankMap = { CRITICAL: 0, HIGH: 10, NORMAL: 20, LOW: 30 } as const;
  const overdueAdjustment = task.dueOn && task.dueOn < today() ? -100 : 0;
  return overdueAdjustment + statusRank[task.status] * 10 + priorityRankMap[task.priority];
}
function toneForStatus(status: TaskStatus): Tone {
  if (status === "COMPLETED") return "success";
  if (status === "BLOCKED" || status === "CANCELLED") return "danger";
  if (status === "AWAITING_APPROVAL") return "warning";
  if (status === "IN_PROGRESS") return "info";
  return "neutral";
}
function formatStatus(status: TaskStatus): string { return status.toLowerCase().split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" "); }
function formatPriority(priority: OperationalTask["priority"]): string { return priority[0] + priority.slice(1).toLowerCase(); }
function dueTone(task: OperationalTask): Tone {
  if (!task.dueOn) return "neutral";
  if (task.dueOn < today()) return "danger";
  const inSevenDays = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  if (task.dueOn <= inSevenDays) return "warning";
  return "neutral";
}
function dueDetail(task: OperationalTask): string {
  if (!task.dueOn) return "No deadline";
  const due = new Date(`${task.dueOn}T00:00:00Z`).getTime();
  const current = new Date(`${today()}T00:00:00Z`).getTime();
  const difference = Math.round((due - current) / 86400000);
  if (difference < 0) return `${Math.abs(difference)} day${Math.abs(difference) === 1 ? "" : "s"} overdue`;
  if (difference === 0) return "Due today";
  if (difference === 1) return "Due tomorrow";
  return `${difference} days`;
}
function formatDate(date: string): string { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)); }
function relativeTime(value: string): string {
  const milliseconds = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.round(milliseconds / 60000));
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}
function formatAuditAction(action: string): string { return action.toLowerCase().split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" "); }
function today(): string { return new Date().toISOString().slice(0, 10); }
