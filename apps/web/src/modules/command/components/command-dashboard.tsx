import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import {
  BellRing, CalendarDays, CheckSquare, ContactRound, ExternalLink, FilePlus2,
  FileText, Folder, FolderPlus, Globe2, Megaphone, MoreVertical, Search,
  ShieldCheck, Shirt, SlidersHorizontal, UploadCloud, Users
} from "lucide-react";
import type { AuthenticatedUser } from "@/lib/auth/types";
import { getTaskSummary, listTasks } from "@/lib/operations/tasks";

const recentDocuments = [
  ["FAA Sectional Charts AE Presentation C/Tsgt. Wilkie.pptx", "03. Aerospace Education", "/ Cadet AE Presentations", "Mar 10, 2026", "1:22 PM", "ppt"],
  ["Military Aviation Presentation C.Ssgt. Wilkie (Revised).pptx", "03. Aerospace Education", "/ Cadet AE Presentations", "Aug 31, 2025", "6:47 PM", "ppt"],
  ["Orientation Flight - Puska_Wilkie", "03. Aerospace Education", "/ Orientation Flights", "Mar 10, 2026", "7:46 PM", "folder"],
  ["Cadet Programs SOP v2.1.pdf", "07. Cadet Programs", "/ Standard Operating Procedures", "Mar 8, 2026", "3:15 PM", "pdf"],
  ["Emergency Services Drill Plan - Q1 2026.pdf", "08. Emergency Services", "/ Drill Plans", "Mar 7, 2026", "9:03 AM", "pdf"]
] as const;

const events = [
  { month: "JUL", day: "29", title: "Staff Meeting", date: "Wed, Jul 29, 2026 · 7:00 PM", place: "Anderson County Clerk's Office", tone: "red" },
  { month: "AUG", day: "01", title: "Cadet Drone Operations", date: "Sat, Aug 1, 2026 · 9:00 AM", place: "ORCS Field", tone: "red" },
  { month: "AUG", day: "04", title: "AE Lesson: Radio Communications", date: "Tue, Aug 4, 2026 · 6:00 PM", place: "Squadron Building", tone: "green" }
] as const;

export async function CommandDashboard({ user }: { user: AuthenticatedUser }) {
  const [summary, tasks] = await Promise.all([
    getTaskSummary(),
    listTasks({ includeCompleted: false, limit: 12 })
  ]);
  const visibleTasks = tasks.slice(0, 3);
  const openTasks = summary.open + summary.inProgress + summary.blocked + summary.awaitingApproval;

  return (
    <div className="home-dashboard">
      <div className="home-primary">
        <section className="welcome-hero">
          <div className="welcome-hero__shade" />
          <div className="welcome-hero__content">
            <h1>Good morning, {firstName(user.fullName)}! <span>👋</span></h1>
            <p>Here&apos;s what&apos;s happening with TN-170 today.</p>
            <div className="hero-metrics">
              <HeroMetric icon={FileText} value="128" label="Documents" detail="Updated this week" tone="blue" />
              <HeroMetric icon={Users} value="23" label="Active Personnel" detail="2 new this month" tone="green" />
              <HeroMetric icon={CalendarDays} value="5" label="Upcoming Events" detail="Next: Staff Meeting" tone="orange" />
              <HeroMetric icon={CheckSquare} value={String(openTasks)} label="Tasks Assigned" detail={`${summary.dueThisWeek} due this week`} tone="purple" />
            </div>
          </div>
        </section>

        <DashboardCard title="Recent Documents" icon={<FileText size={20} />} action="View All" href="/documents" className="documents-card">
          <div className="documents-head"><span>Name</span><span>Location</span><span>Updated</span><span>By</span><span /></div>
          <div className="documents-list">
            {recentDocuments.map(([name, location, folder, date, time, type]) => (
              <article key={name}>
                <span className={`document-type document-type--${type}`}>{type === "folder" ? <Folder size={17} /> : type.toUpperCase()}</span>
                <Link href="/documents"><strong>{name}</strong></Link>
                <span><b>{location}</b><small>{folder}</small></span>
                <span><b>{date}</b><small>{time}</small></span>
                <span className="mini-avatar">{initials(user.fullName)}</span>
                <button aria-label={`More actions for ${name}`}><MoreVertical size={17} /></button>
              </article>
            ))}
          </div>
        </DashboardCard>

        <DashboardCard title="Quick Actions" icon={<SlidersHorizontal size={20} />} className="quick-actions-card">
          <div className="home-quick-actions">
            <QuickAction icon={UploadCloud} label="Upload Document" href="/documents" tone="blue" />
            <QuickAction icon={FolderPlus} label="Create Folder" href="/documents" tone="green" />
            <QuickAction icon={FilePlus2} label="New Form" href="/documents" tone="purple" />
            <QuickAction icon={CalendarDays} label="Add Event" href="/calendar" tone="orange" />
            <QuickAction icon={Search} label="Search Everything" href="/documents" tone="cyan" />
            <QuickAction icon={ContactRound} label="Contacts Directory" href="/staff" tone="orange" />
          </div>
        </DashboardCard>

        <DashboardCard title="My Tasks" icon={<CheckSquare size={20} />} action="View All Tasks" href="/tasks" className="tasks-card">
          <div className="task-tabs"><b>All ({openTasks})</b><span>Due This Week ({summary.dueThisWeek})</span><span>Overdue ({summary.overdue})</span><span>Completed</span></div>
          <div className="home-task-list">
            {visibleTasks.length ? visibleTasks.map((task) => (
              <article key={task.id}>
                <span className="task-checkbox" />
                <strong>{task.title}</strong>
                <span className="task-due"><CalendarDays size={13} /> {task.dueOn ? formatDate(task.dueOn) : "No due date"}</span>
                <span className={`task-priority task-priority--${task.priority.toLowerCase()}`}>● {formatPriority(task.priority)}</span>
                <span className="task-area">{task.functionalAreaName}</span>
                <MoreVertical size={16} />
              </article>
            )) : <div className="home-empty">No active tasks. Your queue is clear.</div>}
          </div>
        </DashboardCard>
      </div>

      <aside className="home-rail">
        <DashboardCard title="Upcoming Events" action="View Calendar" href="/calendar" className="events-card">
          <div className="event-list">
            {events.map((event) => (
              <article key={event.title}>
                <div className={`event-date event-date--${event.tone}`}><span>{event.month}</span><strong>{event.day}</strong></div>
                <div><strong>{event.title}</strong><span><CalendarDays size={12} />{event.date}</span><span>⌖ {event.place}</span></div>
              </article>
            ))}
          </div>
          <Link className="card-footer-link" href="/calendar">View full calendar <ExternalLink size={14} /></Link>
        </DashboardCard>

        <DashboardCard title="Hub Announcements" action="View All" href="/notifications" className="announcements-card">
          <div className="announcement-list">
            <Announcement icon={Megaphone} title="New Cadet Program Updates" detail="Check out the latest changes to the Cadet Program guidelines and requirements." date="Mar 12, 2026" tag="Education" tone="blue" />
            <Announcement icon={ShieldCheck} title="Squadron Safety Brief" detail="Monthly safety brief is now available." date="Mar 10, 2026" tag="Safety" tone="green" />
            <Announcement icon={BellRing} title="IT Systems Maintenance" detail="Scheduled maintenance on network systems." date="Mar 8, 2026" tag="IT / Systems" tone="blue" />
          </div>
          <Link className="card-footer-link" href="/notifications">View all announcements <ExternalLink size={14} /></Link>
        </DashboardCard>

        <DashboardCard title="Quick Links" action="Edit" href="/settings" className="links-card">
          <div className="quick-links-grid">
            <QuickLink icon={Globe2} label="National CAP Website" />
            <QuickLink icon={FileText} label="CAPR 60-1" />
            <QuickLink icon={FileText} label="Ops Tracker (Excel)" tone="green" />
            <QuickLink icon={Folder} label="TN-170 Shared Drive" tone="drive" />
            <QuickLink icon={Shirt} label="Uniform Guide" tone="purple" />
            <QuickLink icon={FileText} label="Form 60-1 (Activity Report)" />
          </div>
        </DashboardCard>
      </aside>
    </div>
  );
}

function DashboardCard({ title, icon, action, href = "#", className = "", children }: { title: string; icon?: ReactNode; action?: string; href?: string; className?: string; children: ReactNode }) {
  return <section className={`home-card ${className}`}><header><h2>{icon}{title}</h2>{action ? <Link href={href}>{action}<span>→</span></Link> : null}</header>{children}</section>;
}

function HeroMetric({ icon: Icon, value, label, detail, tone }: { icon: ComponentType<{ size?: number }>; value: string; label: string; detail: string; tone: string }) {
  return <article><span className={`hero-metric-icon hero-metric-icon--${tone}`}><Icon size={28} /></span><div><b>{value}</b><strong>{label}</strong><small>{detail}</small></div></article>;
}

function QuickAction({ icon: Icon, label, href, tone }: { icon: ComponentType<{ size?: number; className?: string }>; label: string; href: string; tone: string }) {
  return <Link href={href}><Icon className={`tone-${tone}`} size={22} /><strong>{label}</strong></Link>;
}

function Announcement({ icon: Icon, title, detail, date, tag, tone }: { icon: ComponentType<{ size?: number }>; title: string; detail: string; date: string; tag: string; tone: string }) {
  return <article><span className={`announcement-icon announcement-icon--${tone}`}><Icon size={23} /></span><div><strong>{title}</strong><p>{detail}</p><small>{date}</small></div><em className={`announcement-tag announcement-tag--${tone}`}>{tag}</em></article>;
}

function QuickLink({ icon: Icon, label, tone = "blue" }: { icon: ComponentType<{ size?: number; className?: string }>; label: string; tone?: string }) {
  return <Link href="/documents"><Icon className={`tone-${tone}`} size={20} /><span>{label}</span></Link>;
}

function firstName(name: string) { return name.trim().split(/\s+/)[0] || "Member"; }
function initials(name: string) { return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function formatPriority(value: string) { return value[0] + value.slice(1).toLowerCase(); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
