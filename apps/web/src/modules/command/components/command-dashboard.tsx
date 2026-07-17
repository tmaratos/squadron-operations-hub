import Link from "next/link";
import {
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
  const priorityTasks = [...tasks]
    .sort((left, right) => priorityRank(left) - priorityRank(right))
    .slice(0, 5);
  const deadlines = tasks
    .filter((task) => task.dueOn)
    .sort((left, right) => (left.dueOn ?? "9999").localeCompare(right.dueOn ?? "9999"))
    .slice(0, 4);

  const metrics = [
    { label: "Overdue Items", value: summary.overdue, detail: "Require immediate attention", tone: summary.overdue ? "danger" : "success", progress: Math.min(summary.overdue * 12, 100) },
    { label: "Due This Week", value: summary.dueThisWeek, detail: "Upcoming task deadlines", tone: summary.dueThisWeek ? "warning" : "success", progress: Math.min(summary.dueThisWeek * 10, 100) },
    { label: "Awaiting Approval", value: summary.awaitingApproval, detail: "Ready for leadership review", tone: summary.awaitingApproval ? "warning" : "success", progress: Math.min(summary.awaitingApproval * 18, 100) },
    { label: "Open Tasks", value: summary.open + summary.inProgress + summary.blocked + summary.awaitingApproval, detail: "Across all staff sections", tone: "info", progress: Math.min((summary.open + summary.inProgress) * 5, 100) },
    { label: "Readiness Score", value: `${readinessScore}%`, detail: "Calculated from current task risk", tone: readinessScore >= 85 ? "success" : readinessScore >= 70 ? "warning" : "danger", progress: readinessScore }
  ] as const;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow={new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date())}
        title="Command Dashboard"
        description="A live operational view of deadlines, risks, assignments, approvals, and readiness from Cloudflare D1."
        actions={<Link className="button button--secondary" href="/settings">Configure system</Link>}
      />

      <section className="metric-grid metric-grid--dashboard">
        {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
      </section>

      <div className="dashboard-grid">
        <SectionCard
          title="Priority items"
          description="The work most likely to affect readiness or deadlines."
          action={<Link className="button button--ghost" href="/tasks">View all</Link>}
          className="dashboard-grid__priority"
        >
          {priorityTasks.length ? (
            <div className="priority-table" role="table" aria-label="Priority items">
              <div className="priority-table__header" role="row">
                <span>Item</span><span>Category</span><span>Due</span><span>Status</span><span>Assigned to</span>
              </div>
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
          ) : (
            <div className="empty-state"><strong>No active tasks</strong><span>Create the first suspense item to begin tracking squadron work.</span><Link className="button button--primary" href="/tasks">Create task</Link></div>
          )}
        </SectionCard>

        <SectionCard
          title="Recent activity"
          description="Audited changes across the squadron."
          action={<Link className="button button--ghost" href="/audit">View all</Link>}
          className="dashboard-grid__activity"
        >
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

        <SectionCard
          title="Upcoming deadlines"
          action={<Link className="button button--ghost" href="/calendar">View calendar</Link>}
          className="dashboard-grid__deadlines"
        >
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

        <SectionCard
          title="Functional area status"
          description="Readiness calculated from open, blocked, and overdue tasks."
          action={<Link className="button button--ghost" href="/readiness">View readiness</Link>}
          className="dashboard-grid__areas"
        >
          <div className="area-grid">
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

        <SectionCard title="Notifications" action={<Link className="button button--ghost" href="/notifications">View all</Link>} className="dashboard-grid__notifications">
          <div className="notification-list">
            {summary.overdue ? <article><ShieldAlert size={18} /><div><strong>{summary.overdue} overdue task{summary.overdue === 1 ? "" : "s"} need attention</strong><span>Open the task board and assign a recovery action.</span></div><time>Now</time></article> : null}
            {summary.blocked ? <article><ClipboardCheck size={18} /><div><strong>{summary.blocked} task{summary.blocked === 1 ? " is" : "s are"} blocked</strong><span>Leadership intervention may be required.</span></div><time>Now</time></article> : null}
            {pendingAccess.length ? <article><Users size={18} /><div><strong>{pendingAccess.length} access request{pendingAccess.length === 1 ? "" : "s"} pending</strong><span>Tristan, Mellard, or another approver must review.</span></div><time>Now</time></article> : null}
            {!summary.overdue && !summary.blocked && !pendingAccess.length ? <article><CheckCircle2 size={18} /><div><strong>No urgent system notifications</strong><span>Current operational queues are clear.</span></div><time>Now</time></article> : null}
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
          <Link href="/staff"><Users size={17} /> Manage staff</Link>
          <Link href="/communications"><MessageSquareText size={17} /> Open communications</Link>
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

function formatStatus(status: TaskStatus): string {
  return status.toLowerCase().split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

function formatPriority(priority: OperationalTask["priority"]): string {
  return priority[0] + priority.slice(1).toLowerCase();
}

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

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

function relativeTime(value: string): string {
  const milliseconds = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.round(milliseconds / 60000));
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function formatAuditAction(action: string): string {
  return action.toLowerCase().split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
