import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Clock3 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { loadDashboardItems, type DashboardItem } from "@/lib/work/dashboards";

// The calendar visualizes task due dates. It must never present tasks as meetings.
// Full text is accessible on every screen, even when the month grid is narrow.
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateKey(date: Date): string {
  const y = date.getFullYear();
  return [y, String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
function monthStart(offset: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset, 1);
}
function dayLabel(value: string): string {
  return new Date(value + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}
function itemUrl(item: DashboardItem): string {
  return "/lists/" + encodeURIComponent(item.listId) + "?item=" + encodeURIComponent(item.id);
}

export async function CalendarPage({ monthOffset = 0 }: { monthOffset?: number }) {
  await requireUser();
  const items = await loadDashboardItems();
  const start = monthStart(monthOffset);
  const month = start.getMonth();
  const monthLabel = start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const today = dateKey(new Date());
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
  firstCell.setDate(1 - start.getDay());
  const count = Math.ceil((start.getDay() + new Date(start.getFullYear(), month + 1, 0).getDate()) / 7) * 7;
  const cells = Array.from({ length: count }, (_, index) => {
    const date = new Date(firstCell);
    date.setDate(firstCell.getDate() + index);
    return date;
  });

  return (
    <div className="page-stack calendar-experience">
      <style>{calendarCss}</style>
      <PageHeader eyebrow="Schedule" title="Task Calendar"
        description="See every task with a due date. Squadron meetings and events are not included unless they also appear as dated tasks." />
      <div className="cx-summary" aria-label="Monthly task summary">
        <span><Clock3 size={18} aria-hidden="true" /><strong>{openInMonth.length}</strong> open tasks this month</span>
        <span><CalendarDays size={18} aria-hidden="true" /><strong>{agenda.length}</strong> dates with work</span>
        <span><CheckCircle2 size={18} aria-hidden="true" /><strong>{overdue}</strong> overdue in this month</span>
      </div>
      <div className="cx-layout">
        <section className="cx-calendar" aria-label={monthLabel + " calendar"}>
          <header className="cx-top">
            <div>
              <span className="cx-eyebrow">Month view</span>
              <h2>{monthLabel}</h2>
            </div>
            <nav className="cx-nav" aria-label="Change calendar month">
              <Link href={"/calendar?m=" + Math.max(-24, monthOffset - 1)} aria-label="Previous month" aria-disabled={monthOffset <= -24 ? true : undefined}><ArrowLeft size={19} /></Link>
              {monthOffset !== 0 ? <Link className="cx-today" href="/calendar">Today</Link> : null}
              <Link href={"/calendar?m=" + Math.min(24, monthOffset + 1)} aria-label="Next month" aria-disabled={monthOffset >= 24 ? true : undefined}><ArrowRight size={19} /></Link>
            </nav>
          </header>
          <div className="cx-month" aria-label={monthLabel}>
            {DAY_NAMES.map((day) => <div className="cx-weekday" key={day}>{day}</div>)}
            {cells.map((day) => {
              const iso = dateKey(day);
              const rows = byDay.get(iso) ?? [];
              const inMonth = day.getMonth() === month;
              const open = rows.filter((row) => !row.closed).length;
              const className = "cx-day" + (inMonth ? "" : " cx-day--other") + (iso === today ? " cx-day--today" : "");
              const label = dayLabel(iso) + (rows.length ? ", " + rows.length + " task" + (rows.length === 1 ? "" : "s") : ", no tasks");
              return inMonth && rows.length ? (
                <a key={iso} href={"#agenda-" + iso} className={className} aria-label={label}>
                  <span className="cx-day-num">{day.getDate()}</span>
                  <span className="cx-day-count">{open ? open + " open" : "Done"}</span>
                </a>
              ) : (
                <span key={iso} className={className} aria-label={label}>
                  <span className="cx-day-num">{day.getDate()}</span>
                </span>
              );
            })}
          </div>
          <p className="cx-help">Select a date with work to jump to its tasks below. Completed tasks remain visible in the agenda.</p>
        </section>
        <section className="cx-agenda" aria-labelledby="cx-agenda-title">
          <header className="cx-agenda-head">
            <div><span className="cx-eyebrow">All dated tasks</span><h2 id="cx-agenda-title">{monthLabel} agenda</h2></div>
            <Link href="/tasks">My work <ArrowRight size={16} /></Link>
          </header>
          {agenda.length ? agenda.map(([iso, rows]) => (
            <section id={"agenda-" + iso} key={iso} className="cx-agenda-day" aria-label={dayLabel(iso)}>
              <header className="cx-agenda-day-head">
                <h3>{dayLabel(iso)}</h3>
                <span>{rows.length} task{rows.length === 1 ? "" : "s"}</span>
              </header>
              <ul>{rows.map((item) => (
                <li key={item.id}>
                  <Link href={itemUrl(item)} className={"cx-task" + (item.closed ? " cx-task--done" : "")}>
                    <span className="cx-task-status" aria-hidden="true">{item.closed ? <CheckCircle2 size={18} /> : <Clock3 size={18} />}</span>
                    <span className="cx-task-info">
                      <strong>{item.title}</strong>
                      <small>{item.listName} · {item.closed ? "Completed" : iso < today ? "Overdue" : "Open"}{item.assignees.length ? " · " + item.assignees.join(", ") : ""}</small>
                    </span>
                    <ArrowRight size={16} className="cx-task-arrow" aria-hidden="true" />
                  </Link>
                </li>
              ))}</ul>
            </section>
          )) : <p className="cx-empty">No tasks are due this month. Add a due date to a task and it will appear here automatically.</p>}
        </section>
      </div>
    </div>
  );
}

const calendarCss = [
  ".calendar-experience{max-width:1560px;margin:0 auto}",
  ".cx-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}",
  ".cx-summary>span{display:flex;gap:10px;align-items:center;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:13px 16px;color:var(--muted-strong);font-size:13px}",
  ".cx-summary svg{color:var(--accent);flex:none}.cx-summary strong{color:var(--text);font-size:22px;font-variant-numeric:tabular-nums}",
  ".cx-layout{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(350px,1fr);gap:16px;align-items:start}",
  ".cx-calendar,.cx-agenda{min-width:0;border:1px solid var(--border);border-radius:19px;background:var(--surface);overflow:hidden;box-shadow:var(--shadow)}",
  ".cx-top,.cx-agenda-head{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:21px 22px 18px;border-bottom:1px solid var(--border-soft)}",
  ".cx-eyebrow{display:block;margin-bottom:5px;color:var(--accent);font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase}",
  ".cx-top h2,.cx-agenda-head h2{margin:0;color:var(--text);font-size:20px;letter-spacing:-.03em}",
  ".cx-nav{display:flex;align-items:center;gap:8px}.cx-nav a{min-width:39px;min-height:39px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--border);border-radius:10px;color:var(--text);text-decoration:none}",
  ".cx-nav a:hover{background:var(--surface-high)}.cx-nav .cx-today{font-size:12px;font-weight:700;color:var(--accent);padding:0 11px}",
  ".cx-month{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:1px;background:var(--border-soft);border-bottom:1px solid var(--border-soft)}",
  ".cx-weekday{background:var(--surface-alt);padding:12px 2px;text-align:center;color:var(--muted-strong);font-size:12px;font-weight:700}",
  ".cx-day{display:flex;align-items:flex-start;justify-content:space-between;flex-direction:column;gap:8px;min-height:82px;min-width:0;padding:9px 8px;background:var(--surface);color:var(--text);text-decoration:none}",
  "a.cx-day:hover{background:var(--surface-high);outline:2px solid var(--accent);outline-offset:-2px}",
  ".cx-day--other{opacity:.38}.cx-day--today .cx-day-num{background:#2459bd;color:white}",
  ".cx-day-num{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;font-weight:700;font-size:13px}",
  ".cx-day-count{color:var(--accent);font-size:11px;font-weight:750;white-space:nowrap}",
  ".cx-help{margin:0;padding:15px 21px;color:var(--muted-strong);font-size:12px;line-height:1.5}",
  ".cx-agenda-head>a{display:flex;align-items:center;gap:5px;color:var(--accent);font-size:12px;font-weight:700;text-decoration:none}",
  ".cx-agenda-day{scroll-margin-top:20px;border-bottom:1px solid var(--border-soft)}",
  ".cx-agenda-day:target{background:var(--surface-high)}",
  ".cx-agenda-day-head{display:flex;align-items:center;justify-content:space-between;gap:7px;padding:17px 19px 9px}",
  ".cx-agenda-day-head h3{font-size:13px;margin:0;color:var(--text);font-weight:800}",
  ".cx-agenda-day-head>span{color:var(--muted-strong);font-size:12px}",
  ".cx-agenda-day ul{list-style:none;margin:0;padding:0 10px 11px}",
  ".cx-task{display:flex;align-items:center;gap:11px;min-width:0;padding:12px 9px;border-radius:11px;text-decoration:none;color:var(--text)}",
  ".cx-task:hover{background:var(--surface-high)}.cx-task-status{color:var(--accent);flex:none}",
  ".cx-task-info{display:grid;gap:4px;min-width:0;flex:1}.cx-task-info strong{font-size:13px;line-height:1.35;overflow-wrap:anywhere}",
  ".cx-task-info small{font-size:11.5px;line-height:1.5;color:var(--muted-strong)}",
  ".cx-task--done .cx-task-info strong{text-decoration:line-through;opacity:.7}.cx-task-arrow{color:var(--muted-strong);flex:none}",
  ".cx-empty{padding:25px;margin:0;color:var(--muted-strong);font-size:13px;line-height:1.6}",
  "@media(max-width:1200px){.cx-layout{grid-template-columns:minmax(0,1fr)}.cx-day{min-height:70px}}",
  "@media(max-width:600px){.cx-summary{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.cx-summary>span{flex-direction:column;align-items:flex-start;padding:10px 8px;gap:5px;font-size:10.5px;line-height:1.35}.cx-summary strong{font-size:21px}",
  ".cx-top,.cx-agenda-head{padding:15px 12px}.cx-calendar,.cx-agenda{border-radius:14px}.cx-top h2,.cx-agenda-head h2{font-size:17px}",
  ".cx-weekday{font-size:10px;padding:9px 0}.cx-day{min-height:58px;padding:5px 1px;gap:2px;align-items:center}",
  ".cx-day-num{width:27px;height:27px;font-size:12px}.cx-day-count{font-size:9px;letter-spacing:-.02em}",
  ".cx-help{padding:12px 13px}.cx-agenda-day-head{padding:15px 12px 8px}.cx-agenda-day ul{padding:0 6px 9px}",
  ".cx-task{min-height:60px}.cx-task-info strong{font-size:13.5px}.cx-task-info small{font-size:11.5px}}",
  "@media(prefers-reduced-motion:reduce){.cx-day{scroll-behavior:auto}}"
].join("\n");
