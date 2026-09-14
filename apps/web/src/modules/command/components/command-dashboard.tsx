import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  FileText,
  Folder,
  Users
} from "lucide-react";
import type { AuthenticatedUser } from "@/lib/auth/types";
import { getTaskSummary, listTasks } from "@/lib/operations/tasks";

const workspaces = [
  { title: "Work", detail: "Tasks, owners, due dates, and follow-through", href: "/tasks", icon: ClipboardList, tone: "blue" },
  { title: "Schedule", detail: "Events, deadlines, meetings, and recurring obligations", href: "/calendar", icon: CalendarDays, tone: "orange" },
  { title: "People & programs", detail: "Functional areas, roles, and squadron programs", href: "/staff", icon: Users, tone: "purple" },
  { title: "Knowledge", detail: "Drive files, SOPs, regulations, and templates", href: "/documents", icon: Folder, tone: "green" }
] as const;

export async function CommandDashboard({ user: _user }: { user: AuthenticatedUser }) {
  const [summary, tasks] = await Promise.all([
    getTaskSummary(),
    listTasks({ includeCompleted: false, limit: 100 })
  ]);
  const openTasks = summary.open + summary.inProgress + summary.blocked + summary.awaitingApproval;
  const attentionCount = summary.overdue + summary.blocked + summary.awaitingApproval;
  const upcomingTasks = tasks
    .filter((task) => task.dueOn && task.dueOn >= today())
    .sort((left, right) => (left.dueOn || "").localeCompare(right.dueOn || ""))
    .slice(0, 5);
  const attentionTasks = tasks
    .filter((task) => ["BLOCKED", "AWAITING_APPROVAL"].includes(task.status) || (task.dueOn && task.dueOn < today()))
    .slice(0, 5);
  const unassignedCount = tasks.filter((task) => !task.ownerName).length;
  const overviewMessage = openTasks
    ? String(openTasks) + " active item" + (openTasks === 1 ? "" : "s") + " across the squadron. Here is what is next."
    : "No active work is recorded yet. Start by assigning a real owner and due date.";

  return (
    <div className="home-dashboard">
      <div className="home-primary">
        <section className="welcome-hero command-brief-hero">
          <div className="welcome-hero__shade" />
          <div className="welcome-hero__content">
            <p className="command-brief__eyebrow">TN-170 Operations Hub · Squadron Overview</p>
            <h1>Squadron Overview</h1>
            <p>{overviewMessage}</p>
            <div className="hero-metrics" aria-label="Squadron work summary">
              <HeroMetric icon={ClipboardList} label="Active work" value={openTasks} tone="blue" />
              <HeroMetric icon={CalendarDays} label="Due this week" value={summary.dueThisWeek} tone="purple" />
              <HeroMetric icon={AlertTriangle} label="Needs attention" value={attentionCount} tone="orange" />
              <HeroMetric icon={Users} label="Unassigned" value={unassignedCount} tone="green" />
            </div>
          </div>
        </section>

        <DashboardCard title="Upcoming" description="The next scheduled work and deadlines across the squadron." className="quick-actions-card">
          {upcomingTasks.length ? (
            <div className="home-task-list">
              {upcomingTasks.map((task) => <TaskRow key={task.id} task={task} />)}
            </div>
          ) : (
            <EmptyState text="No upcoming dated work is recorded." />
          )}
          <Link href="/calendar" className="see-all-link">Open the schedule <ArrowRight size={16} /></Link>
        </DashboardCard>

        <DashboardCard title="Needs attention" description="Blocked, overdue, or waiting for approval.">
          {attentionTasks.length ? (
            <div className="home-task-list">
              {attentionTasks.map((task) => <TaskRow key={task.id} task={task} />)}
            </div>
          ) : (
            <EmptyState text="Nothing is blocked, overdue, or awaiting approval." />
          )}
          <Link href="/tasks?view=needs-attention" className="see-all-link">Open attention queue <ArrowRight size={16} /></Link>
        </DashboardCard>
      </div>

      <aside className="home-rail">
        <DashboardCard title="Workspaces" description="A calmer system: one place for each kind of squadron work." className="quick-actions-card">
          <div className="home-quick-actions">
            {workspaces.map((workspace) => <WorkspaceLink key={workspace.href} {...workspace} />)}
          </div>
        </DashboardCard>

        <DashboardCard title="Keeping the squadron current" description="Small habits that make the overview trustworthy." className="announcements-card">
          <div className="announcement-list">
            <Guidance icon={ClipboardList} title="Use the actual owner" text="A task is actionable only when a person owns it and the due date is understood." />
            <Guidance icon={CheckSquare} title="Finish work when it is finished" text="Completion records what happened and drives recurring follow-through." />
            <Guidance icon={FileText} title="Keep authority with the source" text="Use the regulation, master form, or approved SOP behind the work." />
          </div>
        </DashboardCard>

        <DashboardCard title="Quick links" description="Open the detailed workspace when you need it." className="links-card">
          <div className="quick-links-grid">
            <QuickLink href="/tasks" icon={ClipboardList} label="Work board" />
            <QuickLink href="/calendar" icon={CalendarDays} label="Schedule" />
            <QuickLink href="/documents" icon={Folder} label="Knowledge" />
            <QuickLink href="/start-here" icon={Users} label="Start Here" />
          </div>
        </DashboardCard>
      </aside>
    </div>
  );
}

function DashboardCard({ title, description, className = "", children }: { title: string; description: string; className?: string; children: ReactNode }) {
  return <section className={"home-card " + className}><header><div><h2>{title}</h2><p>{description}</p></div></header>{children}</section>;
}

function HeroMetric({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: number; tone: string }) {
  return <article><span className={"hero-metric-icon hero-metric-icon--" + tone}><Icon size={18} /></span><strong>{value}</strong><small>{label}</small></article>;
}

function WorkspaceLink({ title, detail, href, icon: Icon, tone }: { title: string; detail: string; href: string; icon: LucideIcon; tone: string }) {
  return <Link href={href}><Icon className={"tone-" + tone} size={22} /><span><strong>{title}</strong><small>{detail}</small></span><ArrowRight size={16} /></Link>;
}

function TaskRow({ task }: { task: Awaited<ReturnType<typeof listTasks>>[number] }) {
  return <article><span className="task-checkbox" aria-hidden="true" /><strong>{task.title}</strong><span className="task-due">{task.dueOn ? formatDate(task.dueOn) : "No due date"}</span><span className="task-priority">{formatStatus(task.status)}</span><span className="task-area">{task.ownerName || "Unassigned"}</span><ArrowRight size={16} aria-hidden="true" /></article>;
}

function Guidance({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return <article><span className="announcement-icon"><Icon size={18} /></span><div><strong>{title}</strong><p>{text}</p></div></article>;
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return <Link href={href}><Icon size={18} /><span>{label}</span></Link>;
}

function EmptyState({ text }: { text: string }) {
  return <p className="home-empty">{text}</p>;
}

function formatStatus(status: string) {
  return status.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value + "T00:00:00Z"));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
