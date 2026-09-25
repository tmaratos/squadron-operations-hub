import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Bot,
  CalendarDays,
  ClipboardCheck,
  FileText,
  Grid3x3,
  LayoutDashboard,
  Plug,
  Settings,
  Target,
  Users
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";

// The page somebody reads once, on the day they are given an account.
//
// Written for a squadron member and not for whoever built this: no talk of workspaces, entities, records
// or integrations. Every section is described by the question it answers, because "Command" and "Squadron"
// mean nothing until somebody tells you which one holds the organisation chart.

const sections = [
  { name: "Home", icon: ClipboardCheck, href: "/", answers: "What needs me today?", detail: "Your own work, what is coming up, and anything the Hub wants to tell you." },
  { name: "Spaces", icon: Grid3x3, href: "/spaces", answers: "Where is the squadron's work?", detail: "Departments, the lists inside them, and every task. This is where most of the day happens." },
  { name: "Planner", icon: CalendarDays, href: "/calendar", answers: "When does it happen?", detail: "The calendar, what is due soon, and what is already late." },
  { name: "Goals", icon: Target, href: "/goals", answers: "What are we trying to achieve?", detail: "QCUA, the AEX programme, filling every duty position. Longer than a task and measured, not ticked." },
  { name: "AI", icon: Bot, href: "/agents", answers: "Can something help me with this?", detail: "Assistants the squadron keeps. They suggest; you decide." },
  { name: "Docs", icon: FileText, href: "/documents", answers: "How do we do this?", detail: "The shared drive, CAP regulations, forms and templates." },
  { name: "Command", icon: LayoutDashboard, href: "/dashboards", answers: "How is the squadron doing?", detail: "The command dashboard, readiness, compliance, announcements." },
  { name: "Squadron", icon: Users, href: "/staff", answers: "Who owns this?", detail: "People, positions, committees, who does what, and professional development." },
  { name: "Connect", icon: Plug, href: "/connections", answers: "What is the Hub joined to?", detail: "Your Gmail and Drive, and what the Hub does with them." },
  { name: "Settings", icon: Settings, href: "/settings", answers: "How do I change it?", detail: "Your preferences, and for administrators, who may sign in." }
];

const views = [
  { name: "List", detail: "A straightforward work list, grouped into sections. Best for getting through things." },
  { name: "Board", detail: "The same work as cards in columns, one per section. Best for seeing what is where." },
  { name: "Table", detail: "A spreadsheet. Every field editable in place. Best for tidying a lot at once." },
  { name: "Calendar", detail: "The same work laid out by date. Best for seeing what lands when." }
];

export default function StartHerePage() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="TN-170 Operations Hub"
        title="Start here"
        description="This exists so nobody has to keep squadron deadlines, ownership or procedures in their head. You do not need to learn all of it. You need to know what is yours and where to find the rest."
      />

      <section className="content-grid content-grid--wide">
        <SectionCard title="How the Hub is arranged" description="Four words, and then everything else follows.">
          <p className="sh-lead">
            The whole app is the <strong>Workspace</strong>. Inside it are <strong>Departments</strong> — Command,
            Finance, Logistics, Cadet Programs and the rest. Inside a department are <strong>Lists</strong>. Inside a
            list are <strong>Tasks</strong>. That is the entire structure.
          </p>
          <p className="sh-lead">
            Down the left edge are the parts of the app. Press one and its menu opens beside it. Each is below, with
            the question it answers.
          </p>
        </SectionCard>

        <SectionCard title="Your first five minutes" description="In this order.">
          <div className="action-list">
            <Link className="action-card" href="/"><span><strong>1. Look at Home</strong><small>What is assigned to you and what is due.</small></span><ArrowRight size={18} /></Link>
            <Link className="action-card" href="/spaces"><span><strong>2. Find your department</strong><small>Open the one matching your duty position and read its lists.</small></span><ArrowRight size={18} /></Link>
            <Link className="action-card" href="/staff"><span><strong>3. Check your position is right</strong><small>If the chart has you wrong, say so — work is routed by it.</small></span><ArrowRight size={18} /></Link>
          </div>
        </SectionCard>
      </section>

      <SectionCard title="Where things live" description="Ten parts, each answering one question.">
        <div className="action-list">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <Link className="action-card" href={section.href} key={section.href}>
                <Icon size={20} />
                <span>
                  <strong>{section.name} — {section.answers}</strong>
                  <small>{section.detail}</small>
                </span>
                <ArrowRight size={18} />
              </Link>
            );
          })}
        </div>
      </SectionCard>

      <section className="content-grid content-grid--equal">
        <SectionCard title="The four ways to look at a list" description="Same tasks, different questions. Switch with the tabs at the top of any list.">
          <div className="record-list">
            {views.map((view) => (
              <article className="record-row" key={view.name}>
                <div className="record-row__marker record-row__marker--info" />
                <div className="record-row__content"><strong>{view.name}</strong><span>{view.detail}</span></div>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Things worth knowing on day one" description="Small, and they save a lot of asking.">
          <div className="record-list">
            <article className="record-row">
              <div className="record-row__marker record-row__marker--success" />
              <div className="record-row__content">
                <strong>Assign without opening a task</strong>
                <span>Press the person icon in the Assignee column of any row. Same for priority.</span>
              </div>
            </article>
            <article className="record-row">
              <div className="record-row__marker record-row__marker--info" />
              <div className="record-row__content">
                <strong>Follow work that is not yours</strong>
                <span>Open a task and press Follow. You get its deadline reminders without being given the job.</span>
              </div>
            </article>
            <article className="record-row">
              <div className="record-row__marker record-row__marker--info" />
              <div className="record-row__content">
                <strong>Ask somebody a question on the task</strong>
                <span>Type @ in a comment and pick a name. They get it in the six o&rsquo;clock email.</span>
              </div>
            </article>
            <article className="record-row">
              <div className="record-row__marker record-row__marker--warning" />
              <div className="record-row__content">
                <strong>The circle in the corner</strong>
                <span>The Hub noticed something. It only ever suggests — nothing happens unless you press a button. Drag it anywhere.</span>
              </div>
            </article>
          </div>
        </SectionCard>
      </section>

      <SectionCard title="What keeps this worth trusting" description="Three habits. The Hub is only as good as what is in it.">
        <div className="record-list">
          <article className="record-row">
            <div className="record-row__marker record-row__marker--warning" />
            <div className="record-row__content">
              <strong>Give work an owner and a date</strong>
              <span>A task with neither is a note. Dated work with nobody on it now emails whoever holds that department&rsquo;s position, so it will find you anyway.</span>
            </div>
            <Bell size={18} />
          </article>
          <article className="record-row">
            <div className="record-row__marker record-row__marker--success" />
            <div className="record-row__content">
              <strong>Close it when it is actually done</strong>
              <span>Completion is the record of what happened, and it is what the recurring items and the awards count.</span>
            </div>
            <ClipboardCheck size={18} />
          </article>
          <article className="record-row">
            <div className="record-row__marker record-row__marker--info" />
            <div className="record-row__content">
              <strong>Never edit a master document</strong>
              <span>Regulations and CAP forms in the reference library are the authority. Make a working copy and change that.</span>
            </div>
            <FileText size={18} />
          </article>
        </div>
      </SectionCard>

      <SectionCard title="If something is wrong" description="It is beta. Being told is the point.">
        <div className="record-list">
          <article className="record-row">
            <div className="record-row__marker record-row__marker--info" />
            <div className="record-row__content">
              <strong>Say so in the ops-hub-beta channel</strong>
              <span>Confusing counts as wrong. So does &ldquo;this should be somewhere else&rdquo;. Do not assume it is already known.</span>
            </div>
          </article>
          <article className="record-row">
            <div className="record-row__marker record-row__marker--warning" />
            <div className="record-row__content">
              <strong>The Hub records work; it does not run the squadron</strong>
              <span>It will never appoint somebody, approve anything, or replace command direction. Ask before changing ownership or policy.</span>
            </div>
          </article>
        </div>
      </SectionCard>

      <style>{shCss}</style>
    </div>
  );
}

const shCss = [
  ".sh-lead{margin:0 0 10px;font-size:13px;line-height:1.6;color:var(--muted-strong)}",
  ".sh-lead:last-child{margin-bottom:0}",
  ".sh-lead strong{color:var(--text,inherit)}"
].join("");
