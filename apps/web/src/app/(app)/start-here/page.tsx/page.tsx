import Link from "next/link";
import { ArrowRight, BookOpenCheck, CalendarDays, CheckCircle2, ClipboardCheck, Folder, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";

const workspaces = [
  { title: "Work", description: "Tasks, owners, due dates, and follow-through.", href: "/tasks", icon: ClipboardCheck },
  { title: "Schedule", description: "Meetings, events, deadlines, and recurring obligations.", href: "/calendar", icon: CalendarDays },
  { title: "People & Programs", description: "Roles, functional areas, and squadron programs.", href: "/staff", icon: Users },
  { title: "Knowledge", description: "Regulations, SOPs, templates, and working documents.", href: "/documents", icon: Folder }
];

export default function StartHerePage() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="TN-170 Operations Hub"
        title="Start Here"
        description="This hub exists so no one has to keep squadron deadlines, ownership, or procedures in their head. You only need to know what is yours and where to find it."
      />

      <section className="content-grid content-grid--wide">
        <SectionCard title="The 60-second check" description="A quick command picture before you open anything else.">
          <div className="action-list">
            <Link className="action-card" href="/"><span><strong>1. Review the Squadron Overview</strong><small>Start with items needing attention, approval, or a decision.</small></span><ArrowRight size={18} /></Link>
            <Link className="action-card" href="/tasks"><span><strong>2. Check the work queue</strong><small>See your active, overdue, blocked, and unassigned work.</small></span><ArrowRight size={18} /></Link>
            <Link className="action-card" href="/calendar"><span><strong>3. Look ahead</strong><small>Confirm the next seven days of events and deadlines.</small></span><ArrowRight size={18} /></Link>
          </div>
        </SectionCard>

        <SectionCard title="The rules that keep this reliable" description="Simple boundaries prevent bad data and missed follow-through.">
          <div className="record-list">
            <article className="record-row"><div className="record-row__marker record-row__marker--warning" /><div className="record-row__content"><strong>Use the real owner and due date</strong><span>A task is not actionable until someone owns it and its date is understood.</span></div><ShieldCheck size={18} /></article>
            <article className="record-row"><div className="record-row__marker record-row__marker--success" /><div className="record-row__content"><strong>Close work when it is actually complete</strong><span>Completion is the record of what happened and drives recurring follow-up.</span></div><CheckCircle2 size={18} /></article>
            <article className="record-row"><div className="record-row__marker record-row__marker--info" /><div className="record-row__content"><strong>Keep authority with the source</strong><span>Use the regulation, master form, or approved SOP; make working copies instead of changing masters.</span></div><BookOpenCheck size={18} /></article>
          </div>
        </SectionCard>
      </section>

      <SectionCard title="Where things live" description="Four workspaces, each with one job.">
        <div className="action-list">
          {workspaces.map((workspace) => {
            const Icon = workspace.icon;
            return <Link className="action-card" href={workspace.href} key={workspace.href}><Icon size={20} /><span><strong>{workspace.title}</strong><small>{workspace.description}</small></span><ArrowRight size={18} /></Link>;
          })}
        </div>
      </SectionCard>

      <SectionCard title="If you are new here" description="A short path to confidence without needing to learn the whole system.">
        <div className="record-list">
          <article className="record-row"><div className="record-row__marker record-row__marker--info" /><div className="record-row__content"><strong>Read this page once</strong><span>Then use the Squadron Overview as your daily starting point.</span></div></article>
          <article className="record-row"><div className="record-row__marker record-row__marker--warning" /><div className="record-row__content"><strong>Open your function</strong><span>Find the tasks, documents, and current work connected to your role.</span></div></article>
          <article className="record-row"><div className="record-row__marker record-row__marker--success" /><div className="record-row__content"><strong>Ask before changing ownership or policy</strong><span>The Hub records work; it does not appoint people or replace command direction.</span></div></article>
        </div>
      </SectionCard>
    </div>
  );
}
