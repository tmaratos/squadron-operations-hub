import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, ClipboardCheck, Clock3, FileText, LayoutDashboard, Search, ShieldAlert, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { OffersCard } from "@/components/work/offers-card";
import { InlineAssignee, InlinePriority, inlinePickerCss } from "@/components/work/inline-pickers";
import type { ItemPriority } from "@/lib/work/types";
import type { AuthenticatedUser } from "@/lib/auth/types";
import { loadDashboardItems, type DashboardItem } from "@/lib/work/dashboards";
import { dashboardExperienceCss } from "./dashboard-experience";

/**
 * Member home, not the command-wide dashboard.
 * Keep the same data and inline actions; replace only their presentation.
 */
export async function CommandDashboard({ user }: { user: AuthenticatedUser }) {
  const open = (await loadDashboardItems()).filter((item) => !item.closed);
  const today = isoDay(0);
  const nextWeek = isoDay(7);
  const mine = open.filter((item) => item.assigneeIds.includes(user.id));
  const myLate = mine.filter((item) => item.dueOn && item.dueOn < today);
  const coming = open.filter((item) => item.dueOn && item.dueOn >= today)
    .sort(byDueDate).slice(0, 5);
  const overdue = open.filter((item) => item.dueOn && item.dueOn < today);
  const unassigned = open.filter((item) => !item.assigneeIds.length);
  const mineFirst = [...mine].sort(byDueDate).slice(0, 6);
  const canEdit = user.globalRole !== "READ_ONLY";
  const firstName = user.fullName.trim().split(/\s+/)[0] || "there";

  return (
    <div className="ops-home">
      <style>{inlinePickerCss}</style>
      <style>{dashboardExperienceCss}</style>
      <header className="ops-intro">
        <div>
          <p className="ops-eyebrow">TN-170 · Your workspace</p>
          <h1>Welcome, {firstName}.</h1>
          <p>{mine.length
            ? `You have ${mine.length} active ${mine.length === 1 ? "assignment" : "assignments"}${myLate.length ? `, including ${myLate.length} overdue` : ""}.`
            : "Your assignments and squadron updates are all in one place."}</p>
        </div>
        <div className="ops-intro-actions">
          <Link href="/tasks" className="ops-action ops-action--primary"><ClipboardCheck size={17} /> My work</Link>
          <Link href="/calendar" className="ops-action"><CalendarDays size={17} /> Calendar</Link>
        </div>
      </header>

      <section className="ops-kpis" aria-label="Squadron work at a glance">
        <Metric href="/tasks" icon={ClipboardCheck} count={mine.length} label="Assigned to you" tone="blue" />
        <Metric href="/tasks?due=next7&from=planner" icon={Clock3} count={open.filter((item) => item.dueOn && item.dueOn >= today && item.dueOn <= nextWeek).length} label="Squadron due in 7 days" tone="amber" />
        <Metric href="/tasks?due=overdue&from=planner" icon={ShieldAlert} count={overdue.length} label="Squadron overdue" tone="red" />
        <Metric href="/tasks?owner=none&from=command" icon={Users} count={unassigned.length} label="Without an owner" tone="mint" />
      </section>

      <div className="ops-body">
        <div className="ops-main-col">
          <section className="ops-panel">
            <PanelHead title="Your priorities" description="Open assignments, sorted by their due date." href="/tasks" linkLabel="All my work" />
            {mineFirst.length ? (
              <ul className="ops-tasks">{mineFirst.map((item) => (
                <li className="ops-task" key={item.id}><TaskEntry item={item} canEdit={canEdit} /></li>
              ))}</ul>
            ) : <Empty text="No tasks are assigned to you right now. Check all squadron work or open your department." />}
            <Link href="/tasks?scope=all&from=spaces" className="ops-footlink">Browse all squadron work <ArrowRight size={15} /></Link>
          </section>
          <section className="ops-panel">
            <PanelHead title="Coming up" description="The next dated work across the squadron." href="/calendar" linkLabel="Full calendar" />
            {coming.length ? (
              <ul className="ops-tasks">{coming.map((item) => (
                <li className="ops-task" key={item.id}><TaskEntry item={item} canEdit={canEdit} /></li>
              ))}</ul>
            ) : <Empty text="There are no upcoming tasks with due dates." />}
          </section>
          <OffersCard />
        </div>

        <div className="ops-side-col">
          <section className="ops-panel">
            <PanelHead title="Quick access" description="Common destinations, always in the same place." />
            <nav className="ops-quick-grid" aria-label="Useful destinations">
              <QuickLink href="/spaces" icon={LayoutDashboard} label="Departments & lists" />
              <QuickLink href="/documents" icon={FileText} label="Squadron files" />
              <QuickLink href="/staff" icon={Users} label="People & positions" />
              <QuickLink href="/dashboards" icon={ShieldAlert} label="Command overview" />
              <QuickLink href="/agents" icon={Search} label="AI assistants" />
              <QuickLink href="/calendar" icon={CalendarDays} label="Upcoming events" />
            </nav>
          </section>

          <section className="ops-panel">
            <PanelHead title="Needs attention" description="Squadron-wide work that may require follow-up." href="/dashboards" linkLabel="Command view" />
            {overdue.length ? (
              <ul className="ops-tasks">{[...overdue].sort(byDueDate).slice(0, 4).map((item) => (
                <li className="ops-task" key={item.id}><TaskEntry item={item} canEdit={canEdit} /></li>
              ))}</ul>
            ) : <Empty text="No overdue work is currently recorded." />}
            {unassigned.length > 0 ? (
              <Link href="/tasks?owner=none&from=command" className="ops-footlink">
                <Users size={16} /> {unassigned.length} without an owner <ArrowRight size={15} />
              </Link>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({ href, icon: Icon, count, label, tone }: { href: string; icon: LucideIcon; count: number; label: string; tone: "blue" | "amber" | "red" | "mint" }) {
  return <Link href={href} className={"ops-kpi ops-kpi--" + tone} aria-label={count + " " + label}>
    <span className="ops-kpi-icon"><Icon size={21} aria-hidden="true" /></span>
    <span className="ops-kpi-copy"><strong className="ops-kpi-value">{count}</strong><span className="ops-kpi-label">{label}</span></span>
  </Link>;
}

function PanelHead({ title, description, href, linkLabel }: { title: string; description: string; href?: string; linkLabel?: string }) {
  return <header className="ops-panel-head"><div><h2>{title}</h2><p>{description}</p></div>
    {href && linkLabel ? <Link href={href}>{linkLabel}</Link> : null}
  </header>;
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return <Link className="ops-quick-link" href={href}><Icon size={20} aria-hidden="true" /> {label}</Link>;
}

function Empty({ text }: { text: string }) { return <p className="ops-empty">{text}</p>; }

function TaskEntry({ item, canEdit }: { item: DashboardItem; canEdit: boolean }) {
  const late = Boolean(item.dueOn && item.dueOn < isoDay(0));
  return <>
    <Link className="ops-task-open" href={"/lists/" + encodeURIComponent(item.listId) + "?item=" + encodeURIComponent(item.id)}>
      <span className="ops-task-icon"><CheckCircle2 size={17} aria-hidden="true" /></span>
      <span className="ops-task-info">
        <span className="ops-task-title">{item.title}</span>
        <span className={"ops-task-meta" + (late ? " is-late" : "")}>
          {item.listName} · {dueLabel(item.dueOn)}
        </span>
      </span>
    </Link>
    <span className="ops-inline">
      <InlinePriority itemId={item.id} title={item.title} priority={(item.priority as ItemPriority | null) ?? null} canEdit={canEdit} />
      <InlineAssignee itemId={item.id} title={item.title}
        assignees={item.assigneeIds.map((id, index) => ({ id, fullName: item.assignees[index] ?? "Member" }))}
        canEdit={canEdit} />
    </span>
  </>;
}

function byDueDate(left: DashboardItem, right: DashboardItem) {
  return (left.dueOn ?? "9999-12-31").localeCompare(right.dueOn ?? "9999-12-31");
}
function isoDay(offset: number) { return new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10); }
function dueLabel(date: string | null) {
  if (!date) return "No date set";
  const diff = Math.round((new Date(date + "T12:00:00").getTime() - new Date(isoDay(0) + "T12:00:00").getTime()) / 86400000);
  if (diff < -1) return Math.abs(diff) + " days overdue";
  if (diff === -1) return "1 day overdue";
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  if (diff <= 7) return "Due in " + diff + " days";
  return "Due " + new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
