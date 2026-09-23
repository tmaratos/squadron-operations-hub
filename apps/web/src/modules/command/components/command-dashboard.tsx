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
import { OffersCard } from "@/components/work/offers-card";
import type { AuthenticatedUser } from "@/lib/auth/types";
import { loadDashboardItems, type DashboardItem } from "@/lib/work/dashboards";

const workspaces = [
  { title: "Work", detail: "Tasks, owners, due dates, and follow-through", href: "/lists", icon: ClipboardList, tone: "blue" },
  { title: "Schedule", detail: "Events, deadlines, meetings, and recurring obligations", href: "/calendar", icon: CalendarDays, tone: "orange" },
  { title: "People & programs", detail: "Functional areas, roles, and squadron programs", href: "/staff", icon: Users, tone: "purple" },
  { title: "Knowledge", detail: "Drive files, SOPs, regulations, and templates", href: "/documents", icon: Folder, tone: "green" }
] as const;

export async function CommandDashboard({ user: _user }: { user: AuthenticatedUser }) {
  const items = await loadDashboardItems();
  const open = items.filter((item) => !item.closed);
  const todayIso = today();
  const weekIso = addDays(7);

  const dueThisWeek = open.filter((item) => item.dueOn && item.dueOn >= todayIso && item.dueOn <= weekIso);
  const overdue = open.filter((item) => item.dueOn && item.dueOn < todayIso);
  const unassigned = open.filter((item) => item.assignees.length === 0);

  const upcoming = open
    .filter((item) => item.dueOn && item.dueOn >= todayIso)
    .sort((left, right) => (left.dueOn || "").localeCompare(right.dueOn || ""))
    .slice(0, 6);
  const attention = [...overdue]
    .sort((left, right) => (left.dueOn || "").localeCompare(right.dueOn || ""))
    .slice(0, 6);

  const overviewMessage = open.length
    ? String(open.length) + " open item" + (open.length === 1 ? "" : "s") + " across the squadron. Here is what is next."
    : "No open work is recorded yet. Start by assigning a real owner and due date.";

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
              <HeroMetric icon={ClipboardList} label="Open work" value={open.length} tone="blue" />
              <HeroMetric icon={CalendarDays} label="Due this week" value={dueThisWeek.length} tone="purple" />
              <HeroMetric icon={AlertTriangle} label="Overdue" value={overdue.length} tone="orange" />
              <HeroMetric icon={Users} label="Unassigned" value={unassigned.length} tone="green" />
            </div>
          </div>
        </section>

        <OffersCard />

        <DashboardCard title="Coming up" description="The next work with a date on it, soonest first." className="quick-actions-card">
          {upcoming.length ? (
            <div className="home-task-list">
              {upcoming.map((item) => <TaskRow key={item.id} item={item} />)}
            </div>
          ) : (
            <EmptyState text="Nothing with a due date is coming up." />
          )}
          <Link href="/calendar" className="see-all-link">Open the schedule <ArrowRight size={16} /></Link>
        </DashboardCard>

        <DashboardCard title="Overdue" description="Past its due date and still open.">
          {attention.length ? (
            <div className="home-task-list">
              {attention.map((item) => <TaskRow key={item.id} item={item} />)}
            </div>
          ) : (
            <EmptyState text="Nothing is overdue." />
          )}
          <Link href="/dashboards" className="see-all-link">Open the command dashboard <ArrowRight size={16} /></Link>
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
            <QuickLink href="/lists" icon={ClipboardList} label="Work board" />
            <QuickLink href="/dashboards" icon={CheckSquare} label="Command" />
            <QuickLink href="/calendar" icon={CalendarDays} label="Schedule" />
            <QuickLink href="/documents" icon={Folder} label="Knowledge" />
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

function TaskRow({ item }: { item: DashboardItem }) {
  return (
    <Link className="home-task-row" href={"/lists/" + item.listId + "?item=" + item.id}>
      <span className="task-checkbox" aria-hidden="true" />
      <strong>{item.title}</strong>
      <span className="task-due">{dueLabel(item.dueOn)}</span>
      <span className="task-priority">{item.statusName || "No status"}</span>
      <span className="task-area">{item.assignees[0] || "Unassigned"}</span>
      <ArrowRight size={16} aria-hidden="true" />
    </Link>
  );
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

// Plain language beats a date nobody has to decode: "3 days late" reads faster than "Sep 13".
function dueLabel(dueOn: string | null): string {
  if (!dueOn) return "No due date";
  const days = Math.round((new Date(dueOn + "T12:00:00").getTime() - new Date(today() + "T12:00:00").getTime()) / 86400000);
  if (days < -1) return Math.abs(days) + " days late";
  if (days === -1) return "1 day late";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days <= 7) return "In " + days + " days";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(dueOn + "T12:00:00"));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}
