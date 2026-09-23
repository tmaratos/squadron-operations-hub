import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { loadDashboardItems } from "@/lib/work/dashboards";

// Everything with a date on it, on a month. This is the whole calendar: squadron work already carries due
// dates, so there is nothing extra to keep up to date here - it is the same work, laid out by day.

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthStart(offset: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset, 1);
}

function isoDay(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export async function CalendarPage({ monthOffset = 0 }: { monthOffset?: number }) {
  await requireUser();
  const items = await loadDashboardItems();
  const start = monthStart(monthOffset);
  const monthLabel = start.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const todayIso = isoDay(new Date());

  const byDay = new Map<string, typeof items>();
  items.forEach((item) => {
    if (!item.dueOn) return;
    byDay.set(item.dueOn, [...(byDay.get(item.dueOn) ?? []), item]);
  });

  // A calendar grid always starts on a Sunday and runs whole weeks, so the squares line up under the names.
  const firstCell = new Date(start);
  firstCell.setDate(1 - start.getDay());
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstCell);
    date.setDate(firstCell.getDate() + index);
    return date;
  });
  const lastWithWork = cells.reduce((last, date, index) => (byDay.has(isoDay(date)) ? index : last), 0);
  const visible = cells.slice(0, lastWithWork > 34 ? 42 : 35);

  const dated = items.filter((item) => item.dueOn && !item.closed).length;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Schedule"
        title="Calendar"
        description={dated ? dated + " pieces of open work have a date. They all show up here." : "Nothing has a date yet. Give a task a due date and it appears here."}
      />

      <section className="cal">
        <style>{calCss}</style>
        <header className="cal-top">
          <Link className="cal-nav" href={"/calendar?m=" + (monthOffset - 1)} aria-label="Previous month">←</Link>
          <h2>{monthLabel}</h2>
          <Link className="cal-nav" href={"/calendar?m=" + (monthOffset + 1)} aria-label="Next month">→</Link>
          {monthOffset !== 0 ? <Link className="cal-today" href="/calendar">Today</Link> : null}
        </header>

        <div className="cal-grid" role="grid">
          {DAY_NAMES.map((name) => <div key={name} className="cal-dayname">{name}</div>)}
          {visible.map((date) => {
            const iso = isoDay(date);
            const dayItems = byDay.get(iso) ?? [];
            const otherMonth = date.getMonth() !== start.getMonth();
            return (
              <div key={iso} className={"cal-cell" + (otherMonth ? " is-other" : "") + (iso === todayIso ? " is-today" : "")}>
                <span className="cal-date">{date.getDate()}</span>
                {dayItems.slice(0, 3).map((item) => (
                  <Link
                    key={item.id}
                    href={"/lists/" + item.listId + "?item=" + item.id}
                    className={"cal-item" + (item.closed ? " is-done" : iso < todayIso ? " is-late" : "")}
                    title={item.title + " · " + item.listName}
                  >
                    {item.title}
                  </Link>
                ))}
                {dayItems.length > 3 ? <span className="cal-more">+{dayItems.length - 3} more</span> : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

const calCss = [
  ".cal{border:1px solid var(--cu-border,#e4e6eb);border-radius:12px;background:var(--cu-bg,#fff);padding:14px 16px;overflow:hidden}",
  "html[data-theme=dark] .cal{background:#222326;border-color:#3a3d44}",
  ".cal-top{display:flex;align-items:center;gap:12px;margin-bottom:12px}",
  ".cal-top h2{margin:0;font-size:17px;min-width:170px}",
  ".cal-nav{text-decoration:none;color:inherit;border:1px solid var(--cu-border,#e4e6eb);border-radius:8px;width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;font-size:15px}",
  ".cal-today{margin-left:auto;text-decoration:none;color:#7b68ee;font-size:13.5px;font-weight:600}",
  ".cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:1px;background:var(--cu-border,#e7ebf2)}",
  "html[data-theme=dark] .cal-grid{background:#33363c}",
  ".cal-dayname{background:var(--cu-bg,#fff);padding:6px 8px;font-size:11.5px;font-weight:700;color:var(--cu-muted,#656f7d);text-transform:uppercase;letter-spacing:.04em}",
  "html[data-theme=dark] .cal-dayname{background:#222326}",
  ".cal-cell{background:var(--cu-bg,#fff);min-height:92px;padding:5px 6px;display:flex;flex-direction:column;gap:3px;overflow:hidden}",
  "html[data-theme=dark] .cal-cell{background:#222326}",
  ".cal-cell.is-other{opacity:.45}",
  ".cal-cell.is-today .cal-date{background:#7b68ee;color:#fff;border-radius:50%;width:21px;height:21px;display:inline-flex;align-items:center;justify-content:center}",
  ".cal-date{font-size:12px;font-weight:600;color:var(--cu-muted,#656f7d)}",
  ".cal-item{display:block;font-size:11.5px;line-height:1.3;padding:3px 5px;border-radius:5px;background:rgba(123,104,238,.13);color:inherit;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".cal-item.is-late{background:rgba(208,59,59,.16)}",
  ".cal-item.is-done{background:rgba(12,163,12,.14);text-decoration:line-through;opacity:.75}",
  ".cal-item:hover{outline:1px solid #7b68ee}",
  ".cal-more{font-size:10.5px;color:var(--cu-muted,#8b93a1)}",
  "@media (max-width:760px){",
  "  .cal{padding:10px 8px}",
  "  .cal-grid{gap:1px}",
  "  .cal-cell{min-height:64px;padding:3px}",
  "  .cal-item{font-size:0;padding:0;height:5px;border-radius:3px}",
  "  .cal-more{font-size:9px}",
  "  .cal-dayname{padding:4px 2px;font-size:9.5px;text-align:center}",
  "}"
].join("");
