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
  {
    title: "Work",
    detail: "Tasks, owners, due dates, and follow-through",
    href: "/tasks",
    icon: ClipboardList,
    tone: "blue"
  },
  {
    title: "Schedule",
    detail: "Events, deadlines, meetings, and recurring obligations",
    href: "/calendar",
    icon: CalendarDays,
    tone: "orange"
  },
  {
    title: "People & programs",
    detail: "Functional areas, roles, and squadron programs",
    href: "/staff",
    icon: Users,
    tone: "purple"
  },
  {
    title: "Knowledge",
    detail: "Drive files, SOPs, regulations, and templates",
    href: "/documents",
    icon: Folder,
    tone: "green"
  }
] as const;

export async function CommandDashboard({ user }: { user: AuthenticatedUser }) {
  const [summary, tasks] = await Promise.all([
    getTaskSummary(),
    listTasks({ includeCompleted: false, limit: 12 })
  ]);
  const openTasks = summary.open + summary.inProgress + summary.blocked + summary.awaitingApproval;
  const attentionCount = summary.overdue + summary.blocked + summary.awaitingApproval;
  const attentionTasks = tasks
    .filter((task) => ["BLOCKED", "AWAITING_APPROVAL"].includes(task.status) || (task.dueOn && task.dueOn < today()))
    .slice(0, 4);
  const workQueue = tasks
    .filter((task) => !["BLOCKED", "AWAITING_APPROVAL"].includes(task.status))
    .slice(0, 4);
  const attentionMessage = attentionCount
    ? String(attentionCount) + " item" + (attentionCount === 1 ? "" : "s") + " require attention. Start with the queue below."
    : "The attention queue is clear. Choose a workspace to keep the squadron moving.";

  return (
    <div className="home-dashboard">
      <div className="home-primary">
        <section className="welcome-hero command-brief-hero">
          <div className="welcome-hero__shade" />
          <div className="welcome-hero__content">
            <p className="command-brief__eyebrow">TN-170 Operations Hub · Command Brief</p>
            <h1>Good day, {firstName(user.name)}.</h1>
            <p>{attentionMessage}</p>
            <div className="hero-metrics" aria-label="Operational work summary">
              <HeroMetric icon={ClipboardList} label="Open work" value={openTasks} tone="blue" />
              <HeroMetric icon={AlertTriangle} label="Needs attention" value={attentionCount} tone="orange" />
              <HeroMetric icon={CheckSquare} label="Completed" value={summary.completed} tone="green" />
            </div>
          </div>
        </section>

        <DashboardCard title="Start in a workspace" description="One place for each kind of squadron work—without ClickUp’s clutter." className="quick-actions-card">
          <div className="home-quick-actions">
            {workspaces.map((workspace) => (
              <WorkspaceLink key={workspace.href} {...workspace} />
            ))}
          </div>
        </DashboardCard>

        <DashboardCard title="Attention queue" description="Blocked, overdue, or waiting for approval.">
          {attentionTasks.length ? (
            <div className="home-task-list">
              {attentionTasks.map((task) => <TaskRow key={task.id} task={task} />)}
            </div>
          ) : (
            <EmptyState text="Nothing is blocked, overdue, or awaiting approval." />
          )}
          <Link href="/tasks?view=needs-attention" className="see-all-link">Open attention queue <ArrowRight size={16} /></Link>
        </DashboardCard>

        <DashboardCard title="My work queue" description="The next active items across the squadron.">
          {workQueue.length ? (
            <div className="home-task-list">
              {workQueue.map((task) => <TaskRow key={task.id} task={task} />)}
            </div>
          ) : (
            <EmptyState text="No active work is assigned yet. Create the first task in Work." />
          )}
          <Link href="/tasks" className="see-all-link">Open all work <ArrowRight size={16} /></Link>
        </DashboardCard>
      </div>

      <aside className="home-rail">
        <DashboardCard title="How this hub works" description="A simple operating system for the squadron." className="announcements-card">
          <div className="announcement-list">
            <Guidance icon={ClipboardList} title="Work" text="Create a task once; keep the owner, due date, and status in one place." />
            <Guidance icon={CalendarDays} title="Schedule" text="Put meetings, events, and regulatory deadlines on the calendar." />
            <Guidance icon={FileText} title="Knowledge" text="Attach the regulation, SOP, form, or Drive file to the work it supports." />
          </div>
        </DashboardCard>

        <DashboardCard title="Quick links" description="Common squadron references." className="links-card">
          <div className="quick-links-grid">
            <QuickLink href="/tasks" icon={ClipboardList} label="Task board" />
            <QuickLink href="/calendar" icon={CalendarDays} label="Calendar" />
            <QuickLink href="/documents" icon={Folder} label="Documents" />
            <QuickLink href="/staff" icon={Users} label="People & programs" />
          </div>
        </DashboardCard>
      </aside>
    </div>
  );
}

function DashboardCard({ title, description, className = "", children }: { title: string; description: string; className?: string; children: ReactNode }) {
  return (
    <section className={"home-card " + className}>
      <header>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function HeroMetric({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: number; tone: string }) {
  return (
    <article>
      <span className={"hero-metric-icon hero-metric-icon--" + tone}><Icon size={18} /></span>
      <strong>{value}</strong>
      <small>{label}</small>
    </article>
  );
}

function WorkspaceLink({ title, detail, href, icon: Icon, tone }: { title: string; detail: string; href: string; icon: LucideIcon; tone: string }) {
  return (
    <Link href={href}>
      <Icon className={"tone-" + tone} size={22} />
      <span><strong>{title}</strong><small>{detail}</small></span>
      <ArrowRight size={16} />
    </Link>
  );
}

function TaskRow({ task }: { task: Awaited<ReturnType<typeof listTasks>>[number] }) {
  return (
    <article>
      <span className="task-checkbox" aria-hidden="true" />
      <strong>{task.title}</strong>
      <span className="task-due">{task.dueOn ? formatDate(task.dueOn) : "No due date"}</span>
      <span className="task-priority">{formatStatus(task.status)}</span>
      <span className="task-area">{task.assigneeName || "Unassigned"}</span>
      <ArrowRight size={16} aria-hidden="true" />
    </article>
  );
}

function Guidance({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <article>
      <span className="announcement-icon"><Icon size={18} /></span>
      <div><strong>{title}</strong><p>{text}</p></div>
    </article>
  );
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return <Link href={href}><Icon size={18} /><span>{label}</span></Link>;
}

function EmptyState({ text }: { text: string }) {
  return <p className="home-empty">{text}</p>;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "Member";
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
