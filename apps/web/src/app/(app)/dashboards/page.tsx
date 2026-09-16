import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { DashboardEditor } from "@/components/work/dashboard-editor";
import { requireUser } from "@/lib/auth/session";
import { getDashboard, listDashboards, loadDashboardItems, renderWidget, type DashboardItem, type WidgetResult } from "@/lib/work/dashboards";
import { listDuties, outlook } from "@/lib/work/duties";
import type { DashboardWidget } from "@/lib/work/types";

export const dynamic = "force-dynamic";

// Status palette (fixed roles) plus the workspace accent. Tones never carry meaning alone: every tile also has an icon and a label.
const TONES: Record<string, { color: string; icon: string; label: string }> = {
  danger: { color: "#d03b3b", icon: "!", label: "Needs attention" },
  warning: { color: "#e59a00", icon: "◷", label: "Coming up" },
  info: { color: "#2a78d6", icon: "⏸", label: "Blocked or waiting" },
  success: { color: "#0ca30c", icon: "✓", label: "On track" },
  accent: { color: "#7b68ee", icon: "★", label: "Command" }
};

const DAY = 86400000;

function isoDay(offset: number): string {
  return new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to + "T12:00:00").getTime() - new Date(from + "T12:00:00").getTime()) / DAY);
}

function relativeDue(dueOn: string | null): { text: string; tone: "late" | "soon" | "later" | "none" } {
  if (!dueOn) return { text: "No date", tone: "none" };
  const diff = daysBetween(isoDay(0), dueOn);
  if (diff < 0) return { text: Math.abs(diff) + "d overdue", tone: "late" };
  if (diff === 0) return { text: "Today", tone: "soon" };
  if (diff === 1) return { text: "Tomorrow", tone: "soon" };
  if (diff <= 7) return { text: "In " + diff + "d", tone: "soon" };
  return { text: new Date(dueOn + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }), tone: "later" };
}

const PRIORITY_COLOR: Record<string, string> = { URGENT: "#d03b3b", HIGH: "#e59a00", NORMAL: "#2a78d6", LOW: "#898781" };

function ItemRows({ items, total, empty }: { items: DashboardItem[]; total: number; empty: string }) {
  if (items.length === 0) {
    return <div className="cd-empty"><span className="cd-empty-icon">✓</span>{empty}</div>;
  }
  return (
    <ul className="cd-rows">
      {items.map((item) => {
        const due = relativeDue(item.dueOn);
        return (
          <li key={item.id}>
            <Link href={"/lists/" + item.listId + "?item=" + encodeURIComponent(item.id)} className="cd-row" title="Open this task">
              <span className="cd-row-status" style={{ background: item.statusColor ?? "#898781" }} title={item.statusName ?? "no status"} />
              <span className="cd-row-main">
                <span className="cd-row-title">{item.title}</span>
                <span className="cd-row-meta">
                  <span className="cd-chip">{item.listName}</span>
                  {item.statusName ? <span className="cd-row-state">{item.statusName}</span> : null}
                  {item.priority ? <span className="cd-row-flag" style={{ color: PRIORITY_COLOR[item.priority] }}>⚑ {item.priority.toLowerCase()}</span> : null}
                </span>
              </span>
              <span className={"cd-due cd-due--" + due.tone}>{due.text}</span>
            </Link>
          </li>
        );
      })}
      {total > items.length ? <li className="cd-more">+ {total - items.length} more</li> : null}
    </ul>
  );
}

function StatusStack({ rows }: { rows: Array<{ label: string; value: number; color?: string | null }> }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  if (!total) return <div className="cd-empty">No open work.</div>;
  return (
    <div>
      <div className="cd-stack" role="img" aria-label={rows.map((row) => row.label + " " + row.value).join(", ")}>
        {rows.map((row) => (
          <span key={row.label} className="cd-stack-seg" style={{ flexGrow: row.value, background: row.color ?? "#898781" }} title={row.label + ": " + row.value + " (" + Math.round((row.value / total) * 100) + "%)"} />
        ))}
      </div>
      <ul className="cd-legend">
        {rows.map((row) => (
          <li key={row.label}>
            <span className="cd-legend-swatch" style={{ background: row.color ?? "#898781" }} />
            <span className="cd-legend-label">{row.label}</span>
            <span className="cd-legend-value">{row.value}</span>
            <span className="cd-legend-pct">{Math.round((row.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function breakdownRows(result: WidgetResult) {
  return result.kind === "breakdown" ? result.rows : [];
}

export default async function DashboardsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const user = await requireUser();
  const { id } = await searchParams;
  const dashboards = await listDashboards();
  const selectedId = id ?? dashboards[0]?.id;
  const [dashboard, items] = await Promise.all([selectedId ? getDashboard(selectedId) : Promise.resolve(null), loadDashboardItems()]);

  const today = isoDay(0);
  const open = items.filter((item) => !item.closed);
  const overdueCount = open.filter((item) => item.dueOn && item.dueOn < today).length;
  const weekCount = open.filter((item) => item.dueOn && item.dueOn >= today && item.dueOn <= isoDay(7)).length;
  const undated = open.filter((item) => !item.dueOn).length;

  const widgets: DashboardWidget[] = dashboard?.widgets ?? [];
  const rendered = widgets.map((widget) => ({ widget, result: renderWidget(widget, items) }));
  const counts = rendered.filter((entry) => entry.widget.type === "count");
  const lists = rendered.filter((entry) => entry.widget.type === "item_list");
  const statusWidget = rendered.find((entry) => entry.widget.type === "status_breakdown");
  const others = rendered.filter((entry) => entry.widget.type === "text");

  const strip = Array.from({ length: 14 }, (_, index) => {
    const day = isoDay(index);
    const dayItems = open.filter((item) => item.dueOn === day);
    return { day, count: dayItems.length, titles: dayItems.map((item) => item.title) };
  });
  const stripMax = Math.max(1, ...strip.map((entry) => entry.count));

  const byList = new Map<string, { listId: string; name: string; open: number; overdue: number }>();
  open.forEach((item) => {
    const entry = byList.get(item.listId) ?? { listId: item.listId, name: item.listName, open: 0, overdue: 0 };
    entry.open += 1;
    if (item.dueOn && item.dueOn < today) entry.overdue += 1;
    byList.set(item.listId, entry);
  });
  const listRows = Array.from(byList.values()).sort((a, b) => b.open - a.open);
  const listMax = Math.max(1, ...listRows.map((row) => row.open));

  // What each role owes and when, from the duty catalog. Nothing here is guessed: every duty carries its source.
  const duties = await listDuties();
  const dutyOutlook = await outlook(5);
  const roleMap = new Map<string, { role: string; count: number; unverified: number }>();
  duties.forEach((duty) => {
    const entry = roleMap.get(duty.role) ?? { role: duty.role, count: 0, unverified: 0 };
    entry.count += 1;
    if (duty.confidence === "UNVERIFIED") entry.unverified += 1;
    roleMap.set(duty.role, entry);
  });
  const roleRows = Array.from(roleMap.values()).sort((a, b) => b.count - a.count);
  const roleMax = Math.max(1, ...roleRows.map((row) => row.count));
  const yearMap = new Map<string, number>();
  dutyOutlook.forEach((entry) => {
    const year = entry.dueOn.slice(0, 4);
    yearMap.set(year, (yearMap.get(year) ?? 0) + 1);
  });
  const yearRows = Array.from(yearMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const yearMax = Math.max(1, ...yearRows.map((row) => row[1]));
  const next90 = open.filter((item) => item.dueOn && item.dueOn >= today && item.dueOn <= isoDay(90)).length;
  const allLists = Array.from(new Map(items.map((item) => [item.listId, item.listName] as const)).entries()).map(([listId, name]) => ({ id: listId, name })).sort((a, b) => a.name.localeCompare(b.name));
  const allTags = Array.from(new Set(items.flatMap((item) => item.tags))).sort();
  const allStatuses = Array.from(new Set(items.map((item) => item.statusName).filter((name): name is string => Boolean(name)))).sort();
  const canEdit = user.globalRole !== "READ_ONLY";

  const hour = (new Date().getUTCHours() + 20) % 24;
  const greeting = hour >= 4 && hour < 12 ? "Good morning" : hour >= 12 && hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = user.fullName.includes(",") ? user.fullName.split(",")[1].trim().split(" ")[0] : user.fullName.split(" ")[0];

  return (
    <div className="cd">
      <style>{cdCss}</style>

      <header className="cd-hero">
        <div className="cd-hero-brand">
          <Image src="/tn170-logo.png" alt="TN-170 emblem" width={64} height={64} priority />
          <div>
            <p className="cd-eyebrow">TN-170 Oak Ridge Composite Squadron</p>
            <h1>{dashboard?.name ?? "Dashboards"}</h1>
            <p className="cd-summary">
              {greeting}, {firstName}. <strong>{open.length}</strong> open tasks,{" "}
              <strong className={overdueCount ? "cd-text-late" : ""}>{overdueCount}</strong> overdue,{" "}
              <strong>{weekCount}</strong> due this week.
            </p>
          </div>
        </div>
        <div className="cd-hero-side">
          {dashboard && canEdit ? <DashboardEditor dashboardId={dashboard.id} widgets={widgets} lists={allLists} tags={allTags} statusNames={allStatuses} /> : null}
          <span className="cd-date">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" })}</span>
          {dashboards.length > 1 ? (
            <nav className="cd-switch" aria-label="Dashboards">
              {dashboards.map((entry) => (
                <Link key={entry.id} href={"/dashboards?id=" + entry.id} className={entry.id === selectedId ? "is-active" : ""}>{entry.name}</Link>
              ))}
            </nav>
          ) : null}
        </div>
      </header>

      {!dashboard ? <div className="cd-card cd-empty">No dashboards yet.</div> : (
        <>
          {counts.length ? (
            <section className="cd-kpis" aria-label="Key numbers">
              {counts.map(({ widget, result }) => {
                const tone = TONES[widget.config.tone ?? "accent"] ?? TONES.accent;
                const value = result.kind === "count" ? result.value : 0;
                return (
                  <article key={widget.id} className="cd-kpi" style={{ "--tone": tone.color } as CSSProperties} title={tone.label}>
                    <div className="cd-kpi-top">
                      <span className="cd-kpi-icon" aria-hidden="true">{tone.icon}</span>
                      <span className="cd-kpi-label">{widget.title}</span>
                    </div>
                    <div className="cd-kpi-value">{value}</div>
                    <div className="cd-kpi-foot">
                      <span className="cd-kpi-bar"><span style={{ width: Math.min(100, open.length ? (value / open.length) * 100 : 0) + "%" }} /></span>
                      <span>{open.length ? Math.round((value / open.length) * 100) : 0}% of open</span>
                    </div>
                  </article>
                );
              })}
            </section>
          ) : null}

          <section className="cd-card cd-strip-card">
            <div className="cd-card-head">
              <h2>Next 14 days</h2>
              <span className="cd-muted">{strip.reduce((sum, entry) => sum + entry.count, 0)} due · {next90} in 90 days · {undated} without a date</span>
            </div>
            <div className="cd-strip">
              {strip.map((entry, index) => {
                const date = new Date(entry.day + "T12:00:00");
                return (
                  <div key={entry.day} className={"cd-strip-day" + (index === 0 ? " is-today" : "") + (date.getDay() === 0 || date.getDay() === 6 ? " is-weekend" : "")} title={entry.count ? entry.titles.join("\n") : "Nothing due"}>
                    <span className="cd-strip-count">{entry.count || ""}</span>
                    <span className="cd-strip-col"><span className="cd-strip-fill" style={{ height: (entry.count / stripMax) * 100 + "%" }} /></span>
                    <span className="cd-strip-dow">{date.toLocaleDateString("en-US", { weekday: "narrow" })}</span>
                    <span className="cd-strip-num">{date.getDate()}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {lists.length ? (
            <section className="cd-two">
              {lists.map(({ widget, result }, index) => (
                <article key={widget.id} className={"cd-card" + (index === 0 ? " cd-card--alert" : "")}>
                  <div className="cd-card-head">
                    <h2>{widget.title}</h2>
                    <span className="cd-count-pill">{result.kind === "items" ? result.total : 0}</span>
                  </div>
                  {result.kind === "items" ? <ItemRows items={result.items} total={result.total} empty={index === 0 ? "Nothing overdue. Nice work." : "Nothing scheduled."} /> : null}
                </article>
              ))}
            </section>
          ) : null}

          <section className="cd-three">
            {statusWidget ? (
              <article className="cd-card">
                <div className="cd-card-head"><h2>{statusWidget.widget.title}</h2></div>
                <StatusStack rows={breakdownRows(statusWidget.result)} />
              </article>
            ) : null}
            <article className="cd-card">
              <div className="cd-card-head"><h2>Open work by list</h2></div>
              <div className="cd-bars">
                {listRows.map((row) => (
                  <Link key={row.listId} href={"/lists/" + row.listId} className="cd-bar cd-bar--link" title={row.name + ": " + row.open + " open, " + row.overdue + " overdue"}>
                    <span className="cd-bar-label">{row.name}</span>
                    <span className="cd-bar-track"><span className="cd-bar-fill" style={{ width: Math.max(2, (row.open / listMax) * 100) + "%" }} /></span>
                    <span className="cd-bar-value">{row.open}{row.overdue ? <em className="cd-text-late"> · {row.overdue} late</em> : null}</span>
                  </Link>
                ))}
              </div>
            </article>
          </section>

          <section className="cd-two">
            <article className="cd-card">
              <div className="cd-card-head">
                <h2>Duties by role</h2>
                <Link className="cd-link" href="/duties">Manage duties</Link>
              </div>
              {roleRows.length === 0 ? (
                <div className="cd-blank">
                  <p><strong>No duties recorded yet.</strong></p>
                  <p>This is where each role&rsquo;s recurring obligations live, with the regulation or squadron document each one comes from.</p>
                  <p>Add them on the Duties page, or have the assistant read a regulation and propose them for your approval.</p>
                </div>
              ) : (
                <div className="cd-bars">
                  {roleRows.map((row) => (
                    <Link key={row.role} href="/duties" className="cd-bar cd-bar--link" title={row.role + ": " + row.count + " duties"}>
                      <span className="cd-bar-label">{row.role}</span>
                      <span className="cd-bar-track"><span className="cd-bar-fill" style={{ width: Math.max(2, (row.count / roleMax) * 100) + "%" }} /></span>
                      <span className="cd-bar-value">{row.count}{row.unverified ? <em className="cd-unverified"> · {row.unverified} to confirm</em> : null}</span>
                    </Link>
                  ))}
                </div>
              )}
            </article>

            <article className="cd-card">
              <div className="cd-card-head">
                <h2>Next five years</h2>
                <span className="cd-muted">{dutyOutlook.length} dated obligations</span>
              </div>
              {yearRows.length === 0 ? (
                <div className="cd-blank"><p>Once duties are recorded, every year ahead is worked out from their schedules and shown here.</p></div>
              ) : (
                <div className="cd-years">
                  {yearRows.map(([year, count]) => (
                    <div key={year} className="cd-year">
                      <span className="cd-year-label">{year}</span>
                      <span className="cd-bar-track"><span className="cd-bar-fill" style={{ width: Math.max(3, (count / yearMax) * 100) + "%" }} /></span>
                      <span className="cd-bar-value">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </section>

          {others.map(({ widget, result }) => (
            <section key={widget.id} className="cd-card">
              <div className="cd-card-head"><h2>{widget.title}</h2></div>
              {result.kind === "text" ? <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{result.text}</p> : null}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

const cdCss = [
  ".cd{--cd-surface:var(--cu-bg,#fcfcfb);--cd-card:#ffffff;--cd-border:var(--cu-border,#e4e6eb);--cd-muted:var(--cu-muted,#656f7d);--cd-track:rgba(15,23,42,.06);--cd-accent:#7b68ee;--cd-late:#d03b3b;display:flex;flex-direction:column;gap:16px;max-width:1440px;margin:0 auto}",
  "html[data-theme=dark] .cd{--cd-card:#222326;--cd-track:rgba(255,255,255,.07);--cd-late:#e66767}",
  ".cd-hero{position:relative;overflow:hidden;display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;padding:22px 24px;border-radius:16px;color:#fff;background:linear-gradient(120deg,#16213f 0%,#1f3a78 55%,#5b4bd6 100%);box-shadow:0 10px 30px rgba(22,33,63,.25)}",
  ".cd-hero:after{content:'';position:absolute;right:-60px;top:-80px;width:280px;height:280px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.14),transparent 70%);pointer-events:none}",
  ".cd-hero-brand{display:flex;align-items:center;gap:16px;min-width:0;position:relative;z-index:1}",
  ".cd-hero-brand img{width:64px;height:64px;object-fit:contain;filter:drop-shadow(0 4px 10px rgba(0,0,0,.35));flex:none}",
  ".cd-eyebrow{margin:0;font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.75}",
  ".cd-hero h1{margin:2px 0 4px;font-size:26px;font-weight:700;letter-spacing:-.01em;color:#fff}",
  ".cd-summary{margin:0;font-size:14px;opacity:.92}.cd-summary strong{font-weight:700}",
  ".cd-hero .cd-text-late{color:#ffb4b4}",
  ".cd-hero-side{display:flex;flex-direction:column;align-items:flex-end;gap:8px;position:relative;z-index:1}",
  ".cd-date{font-size:12px;opacity:.8}",
  ".cd-switch{display:flex;gap:4px;padding:3px;border-radius:8px;background:rgba(255,255,255,.12)}",
  ".cd-switch a{padding:4px 10px;border-radius:6px;color:#fff;text-decoration:none;font-size:12px;opacity:.8}.cd-switch a.is-active{background:#fff;color:#1f3a78;opacity:1;font-weight:600}",
  ".cd-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}",
  ".cd-link{font-size:12px;color:#7b68ee;text-decoration:none}.cd-link:hover{text-decoration:underline}",
  ".cd-blank{display:flex;flex-direction:column;gap:6px;font-size:13px;line-height:1.55;color:var(--cd-muted)}.cd-blank strong{color:inherit}",
  ".cd-unverified{font-style:normal;color:var(--cd-muted)}",
  ".cd-years{display:flex;flex-direction:column;gap:9px}",
  ".cd-year{display:grid;grid-template-columns:52px minmax(0,1fr) 34px;gap:10px;align-items:center;font-size:13px}",
  ".cd-year-label{font-weight:600;font-variant-numeric:tabular-nums}",
  ".cd-kpi{position:relative;padding:14px 16px 12px;border-radius:12px;background:var(--cd-card);border:1px solid var(--cd-border);overflow:hidden;transition:transform .15s ease,box-shadow .15s ease}",
  ".cd-kpi:before{content:'';position:absolute;inset:0 0 auto 0;height:3px;background:var(--tone)}",
  ".cd-kpi:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(0,0,0,.12)}",
  ".cd-kpi-top{display:flex;align-items:center;gap:8px}",
  ".cd-kpi-icon{display:grid;place-items:center;width:26px;height:26px;border-radius:8px;font-size:13px;font-weight:800;color:var(--tone);background:color-mix(in srgb,var(--tone) 16%,transparent)}",
  ".cd-kpi-label{font-size:13px;font-weight:600;color:var(--cd-muted)}",
  ".cd-kpi-value{font-size:40px;font-weight:700;line-height:1.05;margin:8px 0 10px;letter-spacing:-.02em}",
  ".cd-kpi-foot{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--cd-muted)}",
  ".cd-kpi-bar{flex:1;height:4px;border-radius:2px;background:var(--cd-track);overflow:hidden}.cd-kpi-bar span{display:block;height:100%;border-radius:2px;background:var(--tone)}",
  ".cd-card{background:var(--cd-card);border:1px solid var(--cd-border);border-radius:12px;padding:16px 18px;min-width:0}",
  ".cd-card--alert{box-shadow:inset 3px 0 0 var(--cd-late)}",
  ".cd-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}",
  ".cd-card-head h2{margin:0;font-size:14px;font-weight:650}",
  ".cd-muted{font-size:12px;color:var(--cd-muted)}",
  ".cd-count-pill{min-width:26px;text-align:center;font-size:12px;font-weight:700;padding:2px 8px;border-radius:10px;background:var(--cd-track)}",
  ".cd-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}",
  ".cd-three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}",
  ".cd-rows{list-style:none;margin:0;padding:0}",
  ".cd-row{display:grid;grid-template-columns:4px minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 6px;border-radius:8px;color:inherit;text-decoration:none}",
  ".cd-row:hover{background:var(--cd-track)}",
  ".cd-rows li+li .cd-row{border-top:1px solid var(--cd-border);border-radius:0}",
  ".cd-row-status{width:4px;height:30px;border-radius:2px}",
  ".cd-row-main{display:flex;flex-direction:column;gap:3px;min-width:0}",
  ".cd-row-title{font-size:13px;font-weight:550;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".cd-row-meta{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--cd-muted);min-width:0;overflow:hidden;white-space:nowrap}",
  ".cd-chip{padding:1px 6px;border-radius:4px;background:var(--cd-track);max-width:170px;overflow:hidden;text-overflow:ellipsis}",
  ".cd-row-state{text-transform:uppercase;font-size:10px;letter-spacing:.03em}",
  ".cd-due{font-size:12px;font-weight:600;padding:3px 8px;border-radius:6px;white-space:nowrap;font-variant-numeric:tabular-nums}",
  ".cd-due--late{color:var(--cd-late);background:color-mix(in srgb,var(--cd-late) 12%,transparent)}",
  ".cd-due--soon{color:#b87700;background:rgba(229,154,0,.13)}html[data-theme=dark] .cd-due--soon{color:#f0b429}",
  ".cd-due--later,.cd-due--none{color:var(--cd-muted)}",
  ".cd-more{font-size:12px;color:var(--cd-muted);padding:8px 6px 0}",
  ".cd-empty{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--cd-muted);padding:10px 0}",
  ".cd-empty-icon{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:rgba(12,163,12,.14);color:#0ca30c;font-weight:800;font-size:12px}",
  ".cd-strip{display:grid;grid-template-columns:repeat(14,minmax(0,1fr));gap:6px}",
  ".cd-strip-day{display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 0;border-radius:8px}",
  ".cd-strip-day.is-today{background:color-mix(in srgb,var(--cd-accent) 12%,transparent)}",
  ".cd-strip-count{font-size:12px;font-weight:700;height:16px;font-variant-numeric:tabular-nums}",
  ".cd-strip-col{display:flex;align-items:flex-end;width:60%;max-width:26px;height:64px;border-radius:4px;background:var(--cd-track);overflow:hidden}",
  ".cd-strip-fill{display:block;width:100%;border-radius:4px 4px 0 0;background:var(--cd-accent)}",
  ".cd-strip-dow{font-size:10px;color:var(--cd-muted);text-transform:uppercase}",
  ".cd-strip-day.is-weekend .cd-strip-dow{opacity:.6}",
  ".cd-strip-num{font-size:12px;font-weight:600;font-variant-numeric:tabular-nums}",
  ".cd-strip-day.is-today .cd-strip-num{color:var(--cd-accent)}",
  ".cd-stack{display:flex;gap:2px;height:14px;border-radius:7px;overflow:hidden;margin:4px 0 14px}",
  ".cd-stack-seg{min-width:4px}",
  ".cd-legend{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:7px}",
  ".cd-legend li{display:grid;grid-template-columns:10px minmax(0,1fr) auto 38px;gap:8px;align-items:center;font-size:12px}",
  ".cd-legend-swatch{width:10px;height:10px;border-radius:3px}",
  ".cd-legend-label{text-transform:capitalize;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".cd-legend-value{font-weight:600;font-variant-numeric:tabular-nums}.cd-legend-pct{text-align:right;color:var(--cd-muted);font-variant-numeric:tabular-nums}",
  ".cd-bars{display:flex;flex-direction:column;gap:9px}",
  ".cd-bar{display:grid;grid-template-columns:minmax(0,120px) minmax(0,1fr) auto;gap:10px;align-items:center;font-size:12px;color:inherit;text-decoration:none}",
  ".cd-bar--link{padding:2px 4px;margin:-2px -4px;border-radius:6px}.cd-bar--link:hover{background:var(--cd-track)}",
  ".cd-bar-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".cd-bar-track{height:8px;border-radius:4px;background:var(--cd-track);overflow:hidden}",
  ".cd-bar-fill{display:block;height:100%;border-radius:4px;background:var(--cd-accent)}",
  ".cd-bar-value{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}.cd-bar-value em{font-style:normal;font-weight:500}",
  ".cd-text-late{color:var(--cd-late)}",
  ".cd-tags{display:flex;flex-wrap:wrap;gap:8px}",
  ".cd-tag{display:inline-flex;align-items:center;gap:8px;padding:5px 6px 5px 11px;border-radius:999px;border:1px solid var(--cd-border);font-size:12px}",
  ".cd-tag strong{min-width:22px;text-align:center;padding:1px 6px;border-radius:999px;background:color-mix(in srgb,var(--cd-accent) 16%,transparent);color:var(--cd-accent);font-variant-numeric:tabular-nums}",
  "@media (max-width:1100px){.cd-three{grid-template-columns:repeat(2,minmax(0,1fr))}}",
  "@media (max-width:760px){.cd-two,.cd-three{grid-template-columns:minmax(0,1fr)}.cd-hero{padding:18px}.cd-hero h1{font-size:21px}.cd-hero-side{align-items:flex-start}.cd-strip{grid-template-columns:repeat(7,minmax(0,1fr))}.cd-strip-day:nth-child(n+8){display:none}.cd-chip{display:none}}",
  "@media (max-width:600px){",
  ".cd-kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}",
  ".cd-kpi{padding:12px}",
  ".cd-kpi-value{font-size:30px;margin:6px 0 8px}",
  ".cd-kpi-label{font-size:12px}",
  ".cd-kpi-foot{font-size:10px}",
  ".cd-hero h1{font-size:19px}",
  ".cd-summary{font-size:13px}",
  ".cd-bar{grid-template-columns:minmax(0,92px) minmax(0,1fr) auto}",
  ".cd-item-list{display:none}",
  "}"
].join("");
