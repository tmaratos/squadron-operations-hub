import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  FilePlus2,
  ListPlus,
  Sparkles,
  UserSearch,
  Users
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AskAssistantButton } from "@/components/ask-assistant-button";
import { OffersCard } from "@/components/work/offers-card";
import { InlineAssignee, InlinePriority, inlinePickerCss } from "@/components/work/inline-pickers";
import type { ItemPriority } from "@/lib/work/types";
import type { AuthenticatedUser } from "@/lib/auth/types";
import { loadDashboardItems, type DashboardItem } from "@/lib/work/dashboards";
import { listPersonnelMembers } from "@/lib/operations/personnel";
import { dashboardExperienceCss } from "./dashboard-experience";

// The squadron meets in Oak Ridge, so "today" and "good morning" are Eastern time whatever the server's clock says.
const ZONE = "America/New_York";

/**
 * Member home, not the command-wide dashboard.
 *
 * Every number on it is counted from the squadron's own records. Where the design called for something the
 * Hub does not hold - a readiness score, the weather - it shows something the Hub does know instead, rather
 * than a figure nobody can stand behind.
 */
export async function CommandDashboard({ user }: { user: AuthenticatedUser }) {
  // The same people the Members page counts, so the two pages agree. This used to read the CAPID-linked
  // roster instead, which held only the senior members pasted from eServices and showed no cadets at all.
  const [items, roster] = await Promise.all([loadDashboardItems(), listPersonnelMembers().catch(() => [])]);
  const open = items.filter((item) => !item.closed);
  const today = isoDay(0);
  const nextWeek = isoDay(7);
  const mine = open.filter((item) => item.assigneeIds.includes(user.id));
  const myLate = mine.filter((item) => item.dueOn && item.dueOn < today);
  const coming = open.filter((item) => item.dueOn && item.dueOn >= today).sort(byDueDate);
  const thisWeek = coming.filter((item) => (item.dueOn as string) <= nextWeek);
  const overdue = open.filter((item) => item.dueOn && item.dueOn < today).sort(byDueDate);
  const unassigned = open.filter((item) => !item.assigneeIds.length);
  const mineFirst = [...mine].sort(byDueDate).slice(0, 5);
  const canEdit = user.globalRole !== "READ_ONLY";
  const firstName = user.fullName.trim().split(/\s+/)[0] || "there";
  const cadets = roster.filter((member) => member.memberType === "CADET").length;
  const seniors = roster.length - cadets;
  const firstList = open[0]?.listId;

  return (
    <div className="hub-home">
      <style>{inlinePickerCss}</style>
      <style>{dashboardExperienceCss}</style>

      <section className="hub-hero" aria-label="Welcome">
        <HeroScene />
        <div className="hub-hero-copy">
          <h1>{greeting()}, {firstName}.</h1>
          <p>
            {mine.length
              ? `You have ${mine.length} open ${mine.length === 1 ? "assignment" : "assignments"}${myLate.length ? `, ${myLate.length} overdue` : ""}. Here's what's happening with TN-170 today.`
              : "Here's what's happening with TN-170 today."}
          </p>
        </div>
        <div className="hub-hero-side">
          <strong>{longDate()}</strong>
          <span>Oak Ridge, TN</span>
          <em>&ldquo;Volunteers Serving America&rsquo;s Communities&rdquo;</em>
        </div>
      </section>

      <section className="hub-stats" aria-label="At a glance">
        <Stat
          href="/tasks"
          icon={ClipboardList}
          tone="red"
          value={mine.length}
          label="My assigned tasks"
          note={myLate.length ? `${myLate.length} overdue` : "None overdue"}
          noteTone={myLate.length ? "bad" : "good"}
        />
        <Stat
          href="/tasks?due=next7&from=planner"
          icon={CalendarDays}
          tone="blue"
          value={thisWeek.length}
          label="Due in the next 7 days"
          note={thisWeek[0] ? `Next: ${thisWeek[0].title}` : "Nothing dated this week"}
        />
        <Stat
          href="/staff"
          icon={Users}
          tone="green"
          value={roster.length}
          label="Squadron members"
          note={roster.length ? `${cadets} cadets · ${seniors} senior members` : "Load the roster on Members"}
        />
        <Stat
          href="/tasks?due=overdue&from=planner"
          icon={AlertTriangle}
          tone="amber"
          value={overdue.length}
          label="Items need attention"
          note={unassigned.length ? `Overdue · ${unassigned.length} more without an owner` : "Overdue across the squadron"}
        />
      </section>

      <div className="hub-row">
        <section className="hub-card">
          <CardHead title="My priorities" href="/tasks" link="View all" />
          {mineFirst.length ? (
            <ul className="hub-tasks">
              {mineFirst.map((item) => <li key={item.id}><TaskRow item={item} canEdit={canEdit} /></li>)}
            </ul>
          ) : (
            <Empty text="Nothing is assigned to you right now." href="/tasks?scope=all&from=spaces" link="See all squadron work" />
          )}
        </section>

        <section className="hub-card">
          <CardHead title="Upcoming" href="/calendar" link="View calendar" />
          {coming.length ? (
            <ul className="hub-events">
              {coming.slice(0, 4).map((item) => (
                <li key={item.id}>
                  <Link className="hub-event" href={itemHref(item)}>
                    <span className="hub-date" aria-hidden="true">
                      <small>{monthShort(item.dueOn as string)}</small>
                      <strong>{dayNumber(item.dueOn as string)}</strong>
                    </span>
                    <span className="hub-event-copy">
                      <strong>{item.title}</strong>
                      <span>{item.listName}</span>
                    </span>
                    <span className="hub-tag">{relative(item.dueOn as string)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="Nothing dated is coming up." href="/calendar" link="Open the calendar" />
          )}
        </section>

        <section className="hub-card hub-card--actions">
          <CardHead title="Quick actions" />
          <nav className="hub-actions" aria-label="Quick actions">
            <Link href={firstList ? "/lists/" + firstList : "/spaces"} className="hub-action"><span className="hub-action-icon hub-tone-blue"><ListPlus size={20} /></span>Create task</Link>
            <Link href="/calendar" className="hub-action"><span className="hub-action-icon hub-tone-red"><CalendarDays size={20} /></span>Calendar</Link>
            <Link href="/documents" className="hub-action"><span className="hub-action-icon hub-tone-indigo"><FilePlus2 size={20} /></span>Upload document</Link>
            <Link href="/staff" className="hub-action"><span className="hub-action-icon hub-tone-green"><UserSearch size={20} /></span>Find a member</Link>
            <Link href="/dashboards" className="hub-action"><span className="hub-action-icon hub-tone-teal"><BarChart3 size={20} /></span>Run report</Link>
            <AskAssistantButton className="hub-action"><span className="hub-action-icon hub-tone-violet"><Sparkles size={20} /></span>Ask AI assistant</AskAssistantButton>
          </nav>
        </section>
      </div>

      <div className="hub-row hub-row--wide">
        <section className="hub-card">
          <CardHead title="Needs attention" href="/dashboards" link="Command view" />
          {overdue.length ? (
            <ul className="hub-tasks">
              {overdue.slice(0, 4).map((item) => <li key={item.id}><TaskRow item={item} canEdit={canEdit} /></li>)}
            </ul>
          ) : (
            <Empty text="No overdue work is recorded." />
          )}
          {unassigned.length ? (
            <Link href="/tasks?owner=none&from=command" className="hub-foot">
              <Users size={16} aria-hidden="true" /> {unassigned.length} open {unassigned.length === 1 ? "item has" : "items have"} no owner <ChevronRight size={15} aria-hidden="true" />
            </Link>
          ) : null}
        </section>

        <section className="hub-card">
          <CardHead title="Squadron snapshot" href="/staff" link="Members" />
          {roster.length ? (
            <div className="hub-snapshot">
              <ul className="hub-snap-list">
                <li><span className="hub-snap-icon hub-tone-green"><Users size={18} /></span><strong>{roster.length}</strong><span>Total members</span></li>
                <li><span className="hub-snap-icon hub-tone-blue"><Users size={18} /></span><strong>{cadets}</strong><span>Cadets</span></li>
                <li><span className="hub-snap-icon hub-tone-teal"><Users size={18} /></span><strong>{seniors}</strong><span>Senior members</span></li>
                <li><span className="hub-snap-icon hub-tone-indigo"><CircleCheck size={18} /></span><strong>{open.length}</strong><span>Open work items</span></li>
              </ul>
              <Donut cadets={cadets} seniors={seniors} />
            </div>
          ) : (
            <Empty text="The roster has not been loaded yet." href="/staff" link="Load it on Members" />
          )}
        </section>
      </div>

      <OffersCard />
    </div>
  );
}

function Stat({ href, icon: Icon, tone, value, label, note, noteTone }: {
  href: string;
  icon: LucideIcon;
  tone: "red" | "blue" | "green" | "amber";
  value: number;
  label: string;
  note: string;
  noteTone?: "good" | "bad";
}) {
  return (
    <Link href={href} className="hub-stat" aria-label={`${value} ${label}`}>
      <span className={"hub-stat-icon hub-tone-" + tone}><Icon size={22} aria-hidden="true" /></span>
      <span className="hub-stat-copy">
        <strong>{value}</strong>
        <span>{label}</span>
        <small className={noteTone ? "is-" + noteTone : undefined}>{note}</small>
      </span>
    </Link>
  );
}

function CardHead({ title, href, link }: { title: string; href?: string; link?: string }) {
  return (
    <header className="hub-card-head">
      <h2>{title}</h2>
      {href && link ? <Link href={href}>{link} <ChevronRight size={14} aria-hidden="true" /></Link> : null}
    </header>
  );
}

function Empty({ text, href, link }: { text: string; href?: string; link?: string }) {
  return (
    <p className="hub-empty">
      {text}
      {href && link ? <> <Link href={href}>{link}</Link></> : null}
    </p>
  );
}

function TaskRow({ item, canEdit }: { item: DashboardItem; canEdit: boolean }) {
  const late = Boolean(item.dueOn && item.dueOn < isoDay(0));
  return (
    <div className="hub-task">
      <Link className="hub-task-open" href={itemHref(item)}>
        <span className={"hub-task-dot" + (late ? " is-late" : "")} aria-hidden="true" />
        <span className="hub-task-copy">
          <strong>{item.title}</strong>
          <span className={late ? "is-late" : undefined}>{item.listName} · {dueLabel(item.dueOn)}</span>
        </span>
      </Link>
      <span className="hub-task-tools">
        <InlinePriority itemId={item.id} title={item.title} priority={(item.priority as ItemPriority | null) ?? null} canEdit={canEdit} />
        <InlineAssignee
          itemId={item.id}
          title={item.title}
          assignees={item.assigneeIds.map((id, index) => ({ id, fullName: item.assignees[index] ?? "Member" }))}
          canEdit={canEdit}
        />
      </span>
    </div>
  );
}

/** Cadets against senior members, as a ring. */
function Donut({ cadets, seniors }: { cadets: number; seniors: number }) {
  const total = cadets + seniors || 1;
  const share = Math.round((cadets / total) * 100);
  const circumference = 2 * Math.PI * 42;
  return (
    <figure className="hub-donut" aria-label={`${share}% cadets, ${100 - share}% senior members`}>
      <div className="hub-donut-ring">
        <svg viewBox="0 0 100 100" width="132" height="132" aria-hidden="true">
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--hub-donut-b)" strokeWidth="12" />
          <circle
            cx="50" cy="50" r="42" fill="none" stroke="var(--hub-donut-a)" strokeWidth="12" strokeLinecap="round"
            strokeDasharray={`${(share / 100) * circumference} ${circumference}`} transform="rotate(-90 50 50)"
          />
        </svg>
        <figcaption>
          <strong>{share}%</strong>
          <span>Cadets</span>
        </figcaption>
      </div>
      <ul className="hub-legend">
        <li><i className="is-a" />Cadets {share}%</li>
        <li><i className="is-b" />Senior members {100 - share}%</li>
      </ul>
    </figure>
  );
}

/** A sunset over the ridges east of Oak Ridge, with an aircraft crossing it. Drawn here, so it is ours. */
function HeroScene() {
  return (
    <svg className="hub-hero-art" viewBox="0 0 1200 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="hubSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d2148" />
          <stop offset=".45" stopColor="#3a3f73" />
          <stop offset=".72" stopColor="#c0645a" />
          <stop offset="1" stopColor="#f2a65a" />
        </linearGradient>
        <radialGradient id="hubSun" cx="0.72" cy="0.78" r="0.35">
          <stop offset="0" stopColor="#ffd38a" stopOpacity=".95" />
          <stop offset=".35" stopColor="#ffb065" stopOpacity=".45" />
          <stop offset="1" stopColor="#ffb065" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hubShade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#081730" stopOpacity=".78" />
          <stop offset=".55" stopColor="#081730" stopOpacity=".2" />
          <stop offset="1" stopColor="#081730" stopOpacity=".35" />
        </linearGradient>
      </defs>
      <rect width="1200" height="300" fill="url(#hubSky)" />
      <rect width="1200" height="300" fill="url(#hubSun)" />
      <path d="M0 214 C120 190 210 205 300 186 S470 160 560 182 S720 205 820 176 S1010 150 1200 178 V300 H0Z" fill="#5b4a6e" opacity=".65" />
      <path d="M0 236 C90 222 180 230 270 212 S430 196 520 214 S690 236 790 210 S980 196 1080 214 S1160 220 1200 212 V300 H0Z" fill="#3b3557" opacity=".85" />
      <path d="M0 262 C110 248 200 256 320 240 S520 232 640 250 S860 262 980 244 S1140 240 1200 248 V300 H0Z" fill="#221f3b" />
      <path d="M0 284 C160 272 300 280 460 268 S760 282 900 270 S1120 276 1200 272 V300 H0Z" fill="#141429" />
      <g transform="translate(790 92) rotate(-6)" fill="#0d1328">
        <path d="M0 9 L64 6 L74 0 L80 1 L76 8 L98 9 L102 12 L76 13 L80 20 L74 21 L64 15 L0 13 L-6 11Z" />
        <path d="M30 9 L18 -12 L26 -12 L46 8Z" />
        <path d="M30 13 L18 34 L26 34 L46 14Z" />
      </g>
      <rect width="1200" height="300" fill="url(#hubShade)" />
    </svg>
  );
}

function itemHref(item: DashboardItem) {
  return "/lists/" + encodeURIComponent(item.listId) + "?item=" + encodeURIComponent(item.id);
}
function byDueDate(left: DashboardItem, right: DashboardItem) {
  return (left.dueOn ?? "9999-12-31").localeCompare(right.dueOn ?? "9999-12-31");
}
/** A calendar day in Eastern time, `offset` days from today. */
function isoDay(offset: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(new Date(Date.now() + offset * 86400000));
}
function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
function longDate() {
  return new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "long", month: "short", day: "numeric", year: "numeric" }).format(new Date());
}
function noon(date: string) { return new Date(date + "T12:00:00Z"); }
function monthShort(date: string) { return noon(date).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase(); }
function dayNumber(date: string) { return String(noon(date).getUTCDate()); }
function daysFromToday(date: string) { return Math.round((noon(date).getTime() - noon(isoDay(0)).getTime()) / 86400000); }
function relative(date: string) {
  const diff = daysFromToday(date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return "In " + diff + " days";
}
function dueLabel(date: string | null) {
  if (!date) return "No date set";
  const diff = daysFromToday(date);
  if (diff < -1) return Math.abs(diff) + " days overdue";
  if (diff === -1) return "1 day overdue";
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  if (diff <= 7) return "Due in " + diff + " days";
  return "Due " + noon(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
