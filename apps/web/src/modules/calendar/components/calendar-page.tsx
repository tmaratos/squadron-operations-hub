import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, ChevronRight, Clock3 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { loadDashboardItems, type DashboardItem } from "@/lib/work/dashboards";

// The calendar visualizes task due dates. It must never present tasks as meetings.
// Full text is accessible on every screen, even when the month grid is narrow.
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// The squadron is in Oak Ridge. The server's clock is UTC, which put "today" a day ahead every evening.
const ZONE = "America/New_York";
// How many tasks a day shows in the month grid before "+ more" - enough to read, not so many the month
// stops fitting on a screen.
const PER_DAY = 3;

/** Today's date in Eastern time, as YYYY-MM-DD. */
function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(new Date());
}
/** A calendar date as YYYY-MM-DD. Dates here are plain days, so they are built and read in UTC. */
function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
function monthStart(offset: number): Date {
  const [year, month] = todayKey().split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1));
}
function dayLabel(value: string): string {
  return new Date(value + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}
function itemUrl(item: DashboardItem): string {
  return "/lists/" + encodeURIComponent(item.listId) + "?item=" + encodeURIComponent(item.id);
}
function tone(item: DashboardItem, today: string): "done" | "late" | "open" {
  if (item.closed) return "done";
  return item.dueOn && item.dueOn < today ? "late" : "open";
}

export async function CalendarPage({ monthOffset = 0 }: { monthOffset?: number }) {
  await requireUser();
  const items = await loadDashboardItems();
  const start = monthStart(monthOffset);
  const month = start.getUTCMonth();
  const monthLabel = start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const today = todayKey();
  const prefix = dateKey(start).slice(0, 7);
  const byDay = new Map<string, DashboardItem[]>();
  for (const item of items) {
    if (!item.dueOn) continue;
    const row = byDay.get(item.dueOn) ?? [];
    row.push(item);
    byDay.set(item.dueOn, row);
  }
  for (const row of byDay.values()) row.sort((a, b) => Number(a.closed) - Number(b.closed) || a.title.localeCompare(b.title));
  const agenda = [...byDay.entries()].filter(([key]) => key.startsWith(prefix))
    .sort(([a], [b]) => a.localeCompare(b));
  const openInMonth = agenda.flatMap(([, rows]) => rows).filter((item) => !item.closed);
  const overdue = openInMonth.filter((item) => item.dueOn && item.dueOn < today).length;
  const firstCell = new Date(start);
  firstCell.setUTCDate(1 - start.getUTCDay());
  const daysInMonth = new Date(Date.UTC(start.getUTCFullYear(), month + 1, 0)).getUTCDate();
  const count = Math.ceil((start.getUTCDay() + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: count }, (_, index) => {
    const date = new Date(firstCell);
    date.setUTCDate(firstCell.getUTCDate() + index);
    return date;
  });

  return (
    <div className="page-stack calendar-experience">
      <style>{calendarCss}</style>
      <PageHeader
        title="Calendar"
        description="Every task with a due date, by day. Squadron meetings and events show here when they are entered as dated tasks."
        actions={<Link className="button" href="/tasks"><CheckCircle2 size={17} aria-hidden="true" /> My Work</Link>}
      />

      <div className="cx-summary" aria-label="This month at a glance">
        <span className="cx-stat">
          <i className="cx-stat-icon cx-tone-blue"><Clock3 size={20} aria-hidden="true" /></i>
          <span><strong>{openInMonth.length}</strong><small>Open tasks this month</small></span>
        </span>
        <span className="cx-stat">
          <i className="cx-stat-icon cx-tone-green"><CalendarDays size={20} aria-hidden="true" /></i>
          <span><strong>{agenda.length}</strong><small>Days with work</small></span>
        </span>
        <span className="cx-stat">
          <i className="cx-stat-icon cx-tone-red"><AlertTriangle size={20} aria-hidden="true" /></i>
          <span><strong>{overdue}</strong><small>Overdue this month</small></span>
        </span>
      </div>

      <div className="cx-layout">
        <section className="cx-calendar" aria-label={monthLabel + " calendar"}>
          <header className="cx-top">
            <h2>{monthLabel}</h2>
            <nav className="cx-nav" aria-label="Change calendar month">
              <Link href={"/calendar?m=" + Math.max(-24, monthOffset - 1)} aria-label="Previous month" aria-disabled={monthOffset <= -24 ? true : undefined}><ArrowLeft size={19} /></Link>
              <Link className={"cx-today" + (monthOffset === 0 ? " is-here" : "")} href="/calendar" aria-current={monthOffset === 0 ? "page" : undefined}>Today</Link>
              <Link href={"/calendar?m=" + Math.min(24, monthOffset + 1)} aria-label="Next month" aria-disabled={monthOffset >= 24 ? true : undefined}><ArrowRight size={19} /></Link>
            </nav>
          </header>
          <div className="cx-month" aria-label={monthLabel}>
            {DAY_NAMES.map((day) => <div className="cx-weekday" key={day}>{day}</div>)}
            {cells.map((day) => {
              const iso = dateKey(day);
              const rows = byDay.get(iso) ?? [];
              const inMonth = day.getUTCMonth() === month;
              const open = rows.filter((row) => !row.closed).length;
              const late = rows.some((row) => tone(row, today) === "late");
              const className = "cx-day" + (inMonth ? "" : " cx-day--other") + (iso === today ? " cx-day--today" : "") + (inMonth && rows.length ? " cx-day--busy" : "");
              const label = dayLabel(iso) + (rows.length ? ", " + rows.length + " task" + (rows.length === 1 ? "" : "s") : ", no tasks");
              if (!inMonth || !rows.length) {
                return (
                  <span key={iso} className={className} aria-label={label}>
                    <span className="cx-day-num">{day.getUTCDate()}</span>
                  </span>
                );
              }
              return (
                <div key={iso} className={className}>
                  <a href={"#agenda-" + iso} className="cx-day-link" aria-label={label}>
                    <span className="cx-day-num">{day.getUTCDate()}</span>
                    {/* On a phone the titles do not fit; a count does. */}
                    <span className={"cx-day-count" + (late ? " is-late" : "")}>{open ? open + " open" : "Done"}</span>
                  </a>
                  <ul className="cx-chips">
                    {rows.slice(0, PER_DAY).map((item) => (
                      <li key={item.id}>
                        <Link href={itemUrl(item)} className={"cx-chip cx-chip--" + tone(item, today)} title={item.title + " - " + item.listName}>
                          {item.title}
                        </Link>
                      </li>
                    ))}
                    {rows.length > PER_DAY ? (
                      <li><a href={"#agenda-" + iso} className="cx-more">+ {rows.length - PER_DAY} more</a></li>
                    ) : null}
                  </ul>
                </div>
              );
            })}
          </div>
          <p className="cx-help">
            <span className="cx-key cx-key--open" /> Open <span className="cx-key cx-key--late" /> Overdue <span className="cx-key cx-key--done" /> Done
            <span className="cx-help-text">Press a task to open it, or a date to see that day&rsquo;s list.</span>
          </p>
        </section>

        <section className="cx-agenda" aria-labelledby="cx-agenda-title">
          <header className="cx-agenda-head">
            <h2 id="cx-agenda-title">{monthLabel}, day by day</h2>
            <span>{agenda.length ? agenda.length + (agenda.length === 1 ? " day" : " days") : ""}</span>
          </header>
          {agenda.length ? agenda.map(([iso, rows]) => {
            const date = new Date(iso + "T12:00:00Z");
            return (
              <section id={"agenda-" + iso} key={iso} className={"cx-agenda-day" + (iso === today ? " is-today" : "")} aria-label={dayLabel(iso)}>
                <span className="cx-tile" aria-hidden="true">
                  <small>{date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase()}</small>
                  <strong>{date.getUTCDate()}</strong>
                </span>
                <div className="cx-agenda-body">
                  <h3>{iso === today ? "Today · " : ""}{date.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })}<span>{rows.length} task{rows.length === 1 ? "" : "s"}</span></h3>
                  <ul>{rows.map((item) => {
                    const state = tone(item, today);
                    return (
                      <li key={item.id}>
                        <Link href={itemUrl(item)} className={"cx-task cx-task--" + state}>
                          <span className="cx-task-info">
                            <strong>{item.title}</strong>
                            <small>{item.listName}{item.assignees.length ? " · " + item.assignees.join(", ") : ""}</small>
                          </span>
                          <span className={"cx-state cx-state--" + state}>{state === "done" ? "Done" : state === "late" ? "Overdue" : "Open"}</span>
                          <ChevronRight size={16} className="cx-task-arrow" aria-hidden="true" />
                        </Link>
                      </li>
                    );
                  })}</ul>
                </div>
              </section>
            );
          }) : <p className="cx-empty">No tasks are due this month. Give a task a due date and it appears here by itself.</p>}
        </section>
      </div>
    </div>
  );
}

const calendarCss = String.raw`
.calendar-experience{max-width:1500px;margin:0 auto}
.cx-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.cx-stat{display:flex;align-items:center;gap:14px;min-width:0;padding:18px 20px;border:1px solid var(--border);border-radius:16px;background:var(--surface);box-shadow:var(--shadow)}
.cx-stat-icon{flex:none;display:grid;place-items:center;width:46px;height:46px;border-radius:50%}
.cx-stat>span{display:grid;gap:3px;min-width:0}
.cx-stat strong{font-size:28px;line-height:1;font-weight:800;letter-spacing:-.03em;color:var(--text);font-variant-numeric:tabular-nums}
.cx-stat small{font-size:13.5px;font-weight:600;color:var(--muted-strong)}
.cx-tone-blue{color:#2563eb;background:#e8f0ff}.cx-tone-green{color:#16a34a;background:#e6f7ec}.cx-tone-red{color:#dc3545;background:#fdecee}
html[data-theme=dark] .cx-tone-blue{background:rgba(37,99,235,.22);color:#8db4ff}
html[data-theme=dark] .cx-tone-green{background:rgba(22,163,74,.2);color:#6fdc98}
html[data-theme=dark] .cx-tone-red{background:rgba(220,53,69,.18);color:#ff8a96}

.cx-layout{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(320px,1fr);gap:16px;align-items:start}
.cx-calendar,.cx-agenda{min-width:0;border:1px solid var(--border);border-radius:18px;background:var(--surface);overflow:hidden;box-shadow:var(--shadow)}
.cx-top,.cx-agenda-head{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:18px 20px;border-bottom:1px solid var(--border-soft)}
.cx-top h2,.cx-agenda-head h2{margin:0;color:var(--text);font-size:20px;font-weight:800;letter-spacing:-.02em}
.cx-agenda-head>span{font-size:13px;color:var(--muted)}
.cx-nav{display:flex;align-items:center;gap:8px}
.cx-nav a{min-width:42px;min-height:42px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--border);border-radius:10px;color:var(--text);text-decoration:none;background:var(--surface)}
.cx-nav a:hover{background:var(--surface-alt);border-color:#b9cdf3}
.cx-nav .cx-today{padding:0 14px;font-size:14px;font-weight:700;color:var(--accent)}
.cx-nav .cx-today.is-here{background:var(--cu-active);border-color:#2563eb}

.cx-month{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:1px;background:var(--border-soft)}
.cx-weekday{background:var(--surface-alt);padding:10px 2px;text-align:center;color:var(--muted);font-size:12px;font-weight:750;letter-spacing:.06em;text-transform:uppercase}
.cx-day{display:flex;flex-direction:column;gap:4px;min-height:118px;min-width:0;padding:6px;background:var(--surface);color:var(--text)}
.cx-day--other{background:var(--surface-alt)}.cx-day--other .cx-day-num{opacity:.4}
.cx-day-link{display:flex;align-items:center;justify-content:space-between;gap:4px;color:inherit;text-decoration:none;border-radius:8px}
.cx-day-link:hover .cx-day-num{background:var(--surface-high)}
.cx-day-num{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;font-weight:700;font-size:13.5px}
.cx-day--today .cx-day-num,.cx-day--today .cx-day-link:hover .cx-day-num{background:#2563eb;color:#fff}
.cx-day-count{display:none;font-size:11px;font-weight:750;color:var(--accent);white-space:nowrap}
.cx-day-count.is-late{color:#c2273d}
.cx-chips{list-style:none;margin:0;padding:0;display:grid;gap:3px;min-width:0}
.cx-chip{display:block;padding:4px 7px;border-radius:7px;border-left:3px solid;font-size:12px;font-weight:600;line-height:1.3;color:var(--text);text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cx-chip--open{border-left-color:#2563eb;background:#e8f0ff}
.cx-chip--late{border-left-color:#dc3545;background:#fdecee;color:#9f1d2c}
.cx-chip--done{border-left-color:#94a3b8;background:var(--surface-alt);color:var(--muted);text-decoration:line-through}
html[data-theme=dark] .cx-chip--open{background:rgba(37,99,235,.2)}
html[data-theme=dark] .cx-chip--late{background:rgba(220,53,69,.18);color:#ffb3bb}
.cx-chip:hover{outline:2px solid currentColor;outline-offset:-2px}
.cx-more{display:block;padding:2px 7px;font-size:12px;font-weight:700;color:var(--accent);text-decoration:none}
.cx-help{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0;padding:14px 20px;color:var(--muted-strong);font-size:13px}
.cx-key{display:inline-block;width:12px;height:12px;border-radius:3px;margin-left:8px}
.cx-key:first-child{margin-left:0}
.cx-key--open{background:#2563eb}.cx-key--late{background:#dc3545}.cx-key--done{background:#94a3b8}
.cx-help-text{margin-left:auto}

.cx-agenda-day{display:flex;gap:14px;padding:16px 18px;border-bottom:1px solid var(--border-soft);scroll-margin-top:20px}
.cx-agenda-day:last-child{border-bottom:0}
.cx-agenda-day:target{background:var(--cu-active)}
.cx-tile{flex:none;width:54px;height:58px;border-radius:12px;display:grid;place-content:center;text-align:center;background:#fdecee;border:1px solid #f9d4d9}
.cx-tile small{font-size:11px;font-weight:800;letter-spacing:.06em;color:#dc3545;line-height:1}
.cx-tile strong{font-size:22px;font-weight:800;line-height:1.1;color:var(--text)}
.cx-agenda-day.is-today .cx-tile{background:#2563eb;border-color:#2563eb}
.cx-agenda-day.is-today .cx-tile small,.cx-agenda-day.is-today .cx-tile strong{color:#fff}
html[data-theme=dark] .cx-tile{background:rgba(220,53,69,.12);border-color:rgba(220,53,69,.3)}
.cx-agenda-body{flex:1;min-width:0}
.cx-agenda-body h3{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin:2px 0 6px;font-size:15px;font-weight:750;color:var(--text)}
.cx-agenda-body h3 span{font-size:12.5px;font-weight:600;color:var(--muted)}
.cx-agenda-body ul{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.cx-task{display:flex;align-items:center;gap:10px;min-width:0;padding:9px 8px;border-radius:10px;text-decoration:none;color:var(--text)}
.cx-task:hover{background:var(--surface-alt)}
.cx-task-info{display:grid;gap:3px;min-width:0;flex:1}
.cx-task-info strong{font-size:14px;font-weight:620;line-height:1.35;overflow-wrap:anywhere}
.cx-task-info small{font-size:12.5px;line-height:1.4;color:var(--muted)}
.cx-task--done .cx-task-info strong{text-decoration:line-through;opacity:.65}
.cx-state{flex:none;font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:999px}
.cx-state--open{color:#1d4ed8;background:#e6efff}.cx-state--late{color:#b4232f;background:#fdecee}.cx-state--done{color:#475569;background:#eef1f5}
html[data-theme=dark] .cx-state--open{color:#9cc0ff;background:rgba(37,99,235,.24)}
html[data-theme=dark] .cx-state--late{color:#ff9aa4;background:rgba(220,53,69,.18)}
html[data-theme=dark] .cx-state--done{color:#c3cedd;background:rgba(148,163,184,.16)}
.cx-task-arrow{color:var(--muted);flex:none}
.cx-empty{padding:28px 20px;margin:0;color:var(--muted-strong);font-size:14px;line-height:1.6}

@media(max-width:1200px){.cx-layout{grid-template-columns:minmax(0,1fr)}}
@media(max-width:700px){
  .calendar-experience .page-header__actions{display:none}
  .cx-summary{gap:8px}
  .cx-stat{flex-direction:column;align-items:flex-start;gap:8px;padding:12px}
  .cx-stat-icon{width:36px;height:36px}
  .cx-stat strong{font-size:22px}
  .cx-stat small{font-size:12px;line-height:1.3}
  .cx-top,.cx-agenda-head{padding:14px 12px}
  .cx-top h2,.cx-agenda-head h2{font-size:17px}
  .cx-weekday{font-size:10px;padding:8px 0;letter-spacing:0}
  .cx-day{min-height:58px;padding:4px 2px;align-items:center}
  .cx-day-link{flex-direction:column;gap:2px;width:100%;align-items:center}
  .cx-day-count{display:block;font-size:9.5px}
  .cx-chips{display:none}
  .cx-help-text{margin-left:0;flex-basis:100%}
  .cx-agenda-day{padding:14px 12px;gap:10px}
  .cx-tile{width:48px;height:52px}
  .cx-task{min-height:56px}
}
`;
