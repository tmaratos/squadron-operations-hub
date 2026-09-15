import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getDashboard, listDashboards, loadDashboardItems, renderWidget, type WidgetResult } from "@/lib/work/dashboards";

export const dynamic = "force-dynamic";

const TONES: Record<string, string> = { danger: "#e5484d", warning: "#f5a623", info: "#0091ff", success: "#30a46c", accent: "#7b68ee" };

function formatDue(value: string | null): string {
  if (!value) return "";
  return new Date(value + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function WidgetBody({ result, tone }: { result: WidgetResult; tone?: string }) {
  if (result.kind === "count") {
    return <div className="db-count" style={{ color: tone ? TONES[tone] : undefined }}>{result.value}</div>;
  }
  if (result.kind === "items") {
    const today = new Date().toISOString().slice(0, 10);
    return (
      <div className="db-items">
        {result.items.length === 0 ? <p className="db-faint">Nothing here.</p> : null}
        {result.items.map((item) => (
          <Link key={item.id} href={"/lists/" + item.listId} className="db-item">
            <span className="db-dot" style={{ background: item.statusColor ?? "#87909e" }} />
            <span className="db-item-title">{item.title}</span>
            <span className="db-faint db-item-list">{item.listName}</span>
            <span className={"db-item-due" + (item.dueOn && item.dueOn < today ? " db-late" : "")}>{formatDue(item.dueOn)}</span>
          </Link>
        ))}
        {result.total > result.items.length ? <p className="db-faint">+ {result.total - result.items.length} more</p> : null}
      </div>
    );
  }
  if (result.kind === "breakdown") {
    const max = Math.max(1, ...result.rows.map((row) => row.value));
    return (
      <div className="db-bars">
        {result.rows.length === 0 ? <p className="db-faint">No data.</p> : null}
        {result.rows.map((row) => (
          <div key={row.label} className="db-bar">
            <span className="db-bar-label" title={row.label}>{row.label}</span>
            <span className="db-bar-track"><span className="db-bar-fill" style={{ width: (row.value / max) * 100 + "%", background: row.color ?? "#7b68ee" }} /></span>
            <span className="db-bar-value">{row.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return <p style={{ whiteSpace: "pre-wrap" }}>{result.text}</p>;
}

export default async function DashboardsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  await requireUser();
  const { id } = await searchParams;
  const dashboards = await listDashboards();
  const selectedId = id ?? dashboards[0]?.id;
  const [dashboard, items] = await Promise.all([selectedId ? getDashboard(selectedId) : Promise.resolve(null), loadDashboardItems()]);

  return (
    <div className="db">
      <style>{dbCss}</style>
      <header className="db-head">
        <h1>{dashboard?.name ?? "Dashboards"}</h1>
        <nav className="db-tabs">
          {dashboards.map((entry) => (
            <Link key={entry.id} href={"/dashboards?id=" + entry.id} className={entry.id === selectedId ? "is-active" : ""}>{entry.name}</Link>
          ))}
        </nav>
      </header>
      {dashboard?.description ? <p className="db-faint db-desc">{dashboard.description}</p> : null}
      {!dashboard ? <p className="db-faint">No dashboards yet.</p> : (
        <div className="db-grid">
          {dashboard.widgets.map((widget) => (
            <section key={widget.id} className={"db-card db-card--" + widget.type} style={{ gridColumn: "span " + Math.min(12, Math.max(2, widget.w)) }}>
              <h2>{widget.title}</h2>
              <WidgetBody result={renderWidget(widget, items)} tone={widget.config.tone} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

const dbCss = [
  ".db{--db-border:var(--cu-border,#e4e6eb);--db-muted:var(--cu-muted,#656f7d);--db-hover:var(--cu-hover,rgba(15,23,42,.05));display:flex;flex-direction:column;gap:14px}",
  ".db-head{display:flex;align-items:center;gap:16px;flex-wrap:wrap;border-bottom:1px solid var(--db-border);padding-bottom:8px}",
  ".db-head h1{margin:0;font-size:18px;font-weight:600}",
  ".db-tabs{display:flex;gap:4px;flex-wrap:wrap}.db-tabs a{padding:5px 10px;border-radius:6px;color:var(--db-muted);text-decoration:none;font-size:13px}",
  ".db-tabs a.is-active{background:rgba(123,104,238,.14);color:#7b68ee;font-weight:600}",
  ".db-desc{margin:0}",
  ".db-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:12px}",
  ".db-card{border:1px solid var(--db-border);border-radius:10px;padding:14px 16px;min-width:0;background:var(--cu-bg,#fff)}",
  ".db-card h2{margin:0 0 8px;font-size:13px;font-weight:600;color:var(--db-muted)}",
  ".db-count{font-size:34px;font-weight:700;line-height:1.1}",
  ".db-faint{color:var(--db-muted);font-size:12px}",
  ".db-items{display:flex;flex-direction:column}",
  ".db-item{display:grid;grid-template-columns:10px minmax(0,1fr) auto 56px;gap:8px;align-items:center;padding:7px 4px;border-bottom:1px solid var(--db-border);color:inherit;text-decoration:none;font-size:13px}",
  ".db-item:hover{background:var(--db-hover)}",
  ".db-dot{width:9px;height:9px;border-radius:3px}",
  ".db-item-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".db-item-list{max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".db-item-due{text-align:right;font-size:12px}.db-late{color:#e5484d}",
  ".db-bars{display:flex;flex-direction:column;gap:7px}",
  ".db-bar{display:grid;grid-template-columns:110px minmax(0,1fr) 30px;gap:8px;align-items:center;font-size:12px}",
  ".db-bar-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".db-bar-track{height:8px;border-radius:4px;background:var(--db-hover);overflow:hidden}",
  ".db-bar-fill{display:block;height:100%;border-radius:4px}",
  ".db-bar-value{text-align:right;color:var(--db-muted)}",
  "@media (max-width:1100px){.db-grid{grid-template-columns:repeat(6,minmax(0,1fr))}.db-card{grid-column:span 6 !important}.db-card--count{grid-column:span 3 !important}}",
  "@media (max-width:600px){.db-card--count{grid-column:span 6 !important}.db-item-list{display:none}.db-item{grid-template-columns:10px minmax(0,1fr) 56px}}"
].join("");
