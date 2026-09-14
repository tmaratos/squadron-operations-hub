"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CalendarDays, FolderOpen, KeyRound, LoaderCircle, Mail, MessageSquare, Search, Webhook, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { IntegrationRecord, IntegrationStatus } from "@/lib/operations/workspaces";

// Integration state is saved to Cloudflare D1 through /api/integrations. Nothing is kept in browser storage.

interface CatalogItem {
  provider: string;
  name: string;
  category: "Sign-in & files" | "Calendar & email" | "Work management" | "Chat" | "Developer";
  description: string;
  icon: LucideIcon;
  live?: "drive";
}

const catalog: CatalogItem[] = [
  { provider: "google-workspace", name: "Google sign-in & Shared Drive", category: "Sign-in & files", description: "Members sign in with Google, and the Knowledge area reads the TN 170 Command Shared Drive with each member's own permissions.", icon: FolderOpen, live: "drive" },
  { provider: "microsoft-entra", name: "Microsoft Entra ID", category: "Sign-in & files", description: "Planned second sign-in option so each member keeps one Hub account whether they use Google or Microsoft.", icon: KeyRound },
  { provider: "google-calendar", name: "Google Calendar", category: "Calendar & email", description: "Show squadron meetings and events from a shared Google Calendar on the Schedule page.", icon: CalendarDays },
  { provider: "email-intake", name: "Email intake", category: "Calendar & email", description: "Forward CAP National, Wing, and Group email to a Hub address and turn it into tasks waiting for triage.", icon: Mail },
  { provider: "clickup-import", name: "ClickUp import", category: "Work management", description: "Bring tasks, tags, assignees, and due dates over from the SER-TN-170 ClickUp workspace.", icon: Workflow },
  { provider: "microsoft-teams", name: "Microsoft Teams", category: "Chat", description: "Post new assignments and overdue reminders into a Teams channel.", icon: MessageSquare },
  { provider: "slack", name: "Slack", category: "Chat", description: "Post new assignments and overdue reminders into a Slack channel.", icon: MessageSquare },
  { provider: "webhooks", name: "Outgoing webhooks", category: "Developer", description: "Send task and calendar changes to another system when they happen.", icon: Webhook }
];

const categories = ["All", "Sign-in & files", "Calendar & email", "Work management", "Chat", "Developer"] as const;

export function IntegrationsBoard({
  initialIntegrations,
  ready,
  driveConfigured,
  isAdmin,
  canRequest
}: {
  initialIntegrations: IntegrationRecord[];
  ready: boolean;
  driveConfigured: boolean;
  isAdmin: boolean;
  canRequest: boolean;
}) {
  const [records, setRecords] = useState(initialIntegrations);
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; message: string } | null>(null);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return catalog.filter((item) => (category === "All" || item.category === category) && (!normalized || (item.name + " " + item.description).toLowerCase().includes(normalized)));
  }, [category, query]);

  function statusFor(item: CatalogItem): { status: IntegrationStatus; record?: IntegrationRecord } {
    const record = records.find((entry) => entry.provider === item.provider);
    if (item.live === "drive" && driveConfigured) return { status: "CONNECTED", record };
    return { status: record?.status ?? "NOT_CONNECTED", record };
  }

  async function update(item: CatalogItem, status: IntegrationStatus) {
    if (busy) return;
    setBusy(item.provider);
    setNotice(null);
    try {
      const response = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: item.provider, status })
      });
      const payload = await response.json() as { integrations?: IntegrationRecord[]; message?: string };
      if (!response.ok) throw new Error(payload.message || "The integration could not be updated.");
      if (payload.integrations) setRecords(payload.integrations);
      setNotice({ tone: "success", message: item.name + ": " + label(status) + "." });
    } catch (error) {
      setNotice({ tone: "danger", message: error instanceof Error ? error.message : "The integration could not be updated." });
    } finally {
      setBusy(null);
    }
  }

  const connectedCount = catalog.filter((item) => statusFor(item).status === "CONNECTED").length;

  return (
    <div className="integrations">
      <style>{integrationsCss}</style>
      {!ready ? (
        <div className="inline-notice inline-notice--danger" role="status">
          <AlertCircle size={17} />
          <span>Integration settings can't be saved yet because the database tables for them haven't been created. Live connections below still show their real status.</span>
        </div>
      ) : null}
      {notice ? (
        <div className={"inline-notice inline-notice--" + notice.tone} role="status">
          <AlertCircle size={17} />
          <span>{notice.message}</span>
        </div>
      ) : null}

      <div className="integrations__toolbar">
        <div className="integrations__tabs" role="tablist" aria-label="Integration categories">
          {categories.map((item) => (
            <button key={item} type="button" role="tab" aria-selected={category === item} className={category === item ? "is-active" : ""} onClick={() => setCategory(item)}>{item}</button>
          ))}
        </div>
        <label className="integrations__search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search integrations" /></label>
      </div>
      <p className="integrations__summary">{connectedCount} of {catalog.length} connected</p>

      <div className="integrations__grid">
        {visible.map((item) => {
          const Icon = item.icon;
          const { status, record } = statusFor(item);
          const isBusy = busy === item.provider;
          return (
            <article key={item.provider} className="integration-card">
              <header>
                <span className="integration-card__icon"><Icon size={20} /></span>
                <div><strong>{item.name}</strong><small>{item.category}</small></div>
                <span className={"integration-status integration-status--" + status.toLowerCase()}>{label(status)}</span>
              </header>
              <p>{item.description}</p>
              {record?.updatedAt && !item.live ? <small className="integration-card__meta">Updated {new Date(record.updatedAt).toLocaleDateString()}{record.updatedByName ? " by " + record.updatedByName : ""}</small> : null}
              <footer>
                {item.live === "drive" ? (
                  <span className="integration-card__meta">{driveConfigured ? "Managed by the Hub's Cloudflare configuration" : "Needs Google OAuth secrets and the Shared Drive ID in Cloudflare"}</span>
                ) : isAdmin ? (
                  <>
                    {status !== "CONNECTED" ? <button type="button" className="button button--primary" disabled={isBusy || !ready} onClick={() => update(item, "CONNECTED")}>{isBusy ? <LoaderCircle className="spin" size={14} /> : null}Mark connected</button> : null}
                    {status === "CONNECTED" ? <button type="button" className="button button--ghost" disabled={isBusy || !ready} onClick={() => update(item, "DISABLED")}>Disable</button> : null}
                    {status !== "NOT_CONNECTED" ? <button type="button" className="button button--ghost" disabled={isBusy || !ready} onClick={() => update(item, "NOT_CONNECTED")}>Reset</button> : null}
                  </>
                ) : canRequest && status === "NOT_CONNECTED" ? (
                  <button type="button" className="button button--ghost" disabled={isBusy || !ready} onClick={() => update(item, "REQUESTED")}>Request setup</button>
                ) : null}
              </footer>
            </article>
          );
        })}
        {!visible.length ? <div className="empty-state"><strong>No integrations match.</strong><span>Try another category or search.</span></div> : null}
      </div>
    </div>
  );
}

function label(status: IntegrationStatus): string {
  if (status === "CONNECTED") return "Connected";
  if (status === "REQUESTED") return "Requested";
  if (status === "DISABLED") return "Disabled";
  return "Not connected";
}

const integrationsCss = [
  ".integrations{display:grid;gap:14px}",
  ".integrations__toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}",
  ".integrations__tabs{display:flex;flex-wrap:wrap;gap:4px;padding:3px;border:1px solid var(--border-soft);border-radius:10px;background:var(--surface)}",
  ".integrations__tabs button{min-height:30px;padding:0 11px;border:0;border-radius:7px;background:transparent;color:var(--muted-strong);font-size:12px;cursor:pointer}",
  ".integrations__tabs button.is-active{background:var(--surface-high);color:var(--accent);font-weight:700}",
  ".integrations__search{display:flex;align-items:center;gap:7px;min-height:36px;padding:0 10px;border:1px solid var(--border-soft);border-radius:9px;background:var(--surface);color:var(--muted)}",
  ".integrations__search input{border:0;background:transparent;color:inherit;outline:0;font-size:12px}",
  ".integrations__summary{margin:0;color:var(--muted);font-size:12px}",
  ".integrations__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px}",
  ".integration-card{display:grid;align-content:start;gap:10px;padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--surface);box-shadow:var(--shadow)}",
  ".integration-card header{display:grid;grid-template-columns:40px minmax(0,1fr) auto;align-items:center;gap:10px}",
  ".integration-card header div{display:grid;gap:2px;min-width:0}.integration-card header strong{font-size:14px}.integration-card header small{color:var(--muted);font-size:11px}",
  ".integration-card__icon{width:40px;height:40px;display:grid;place-items:center;border-radius:10px;background:var(--surface-high);color:var(--accent)}",
  ".integration-card p{margin:0;color:var(--muted-strong);font-size:12px;line-height:1.5}",
  ".integration-card__meta{color:var(--muted);font-size:11px}",
  ".integration-card footer{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:2px}",
  ".integration-status{padding:3px 9px;border-radius:99px;font-size:11px;font-weight:700;white-space:nowrap;background:#eef2f6;color:#475569}",
  ".integration-status--connected{background:#dcfce7;color:#15803d}.integration-status--requested{background:#fff4e0;color:#9a5b00}.integration-status--disabled{background:#fdecec;color:#b42318}",
  "html[data-theme=dark] .integration-status{background:rgba(148,163,184,.16);color:#cbd5e1}",
  "html[data-theme=dark] .integration-status--connected{background:rgba(74,222,128,.16);color:#86efac}html[data-theme=dark] .integration-status--requested{background:rgba(245,176,65,.14);color:#f5c26b}html[data-theme=dark] .integration-status--disabled{background:rgba(242,87,87,.16);color:#ff8f8f}"
].join("\n");
