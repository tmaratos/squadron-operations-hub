import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ArrowRight, CalendarDays, ClipboardList, Users } from "lucide-react";
import { OffersCard } from "@/components/work/offers-card";
import type { AuthenticatedUser } from "@/lib/auth/types";
import { loadDashboardItems, type DashboardItem } from "@/lib/work/dashboards";

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

    </div>
  );
}

function DashboardCard({ title, description, className = "", children }: { title: string; description: string; className?: string; children: ReactNode }) {
  return <section className={"home-card " + className}><header><div><h2>{title}</h2><p>{description}</p></div></header>{children}</section>;
}

function HeroMetric({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: number; tone: string }) {
  return <article><span className={"hero-metric-icon hero-metric-icon--" + tone}><Icon size={18} /></span><strong>{value}</strong><small>{label}</small></article>;
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
