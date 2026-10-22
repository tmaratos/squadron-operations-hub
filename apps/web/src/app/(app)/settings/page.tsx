import Link from "next/link";
import { ArrowUpRight, Bell, Database, LockKeyhole, Settings2, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { isGoogleDriveConfigured } from "@/lib/drive/google-auth";
import { requireUser } from "@/lib/auth/session";
import { SquadronEmail } from "@/components/settings/squadron-email";
import { DriveServiceAccount } from "@/components/settings/drive-service-account";
import { LEVELS, notificationLevel } from "@/lib/notify/squadron-switch";

export const dynamic = "force-dynamic";

const settingsDestinations = [
  { id: "email", label: "Squadron email", detail: "Notification delivery", icon: Bell },
  { id: "access", label: "Accounts and access", detail: "Roles and permissions", icon: Users },
  { id: "connections", label: "Connections", detail: "Operational services", icon: Database },
  { id: "configuration", label: "Advanced setup", detail: "Shared Drive credentials", icon: LockKeyhole }
];

export default async function SettingsPage() {
  const user = await requireUser();
  const canAdministerAccounts = ["SYSTEM_OWNER", "ACCOUNT_APPROVER"].includes(user.globalRole);
  const canEditNotifications = ["SYSTEM_OWNER", "ADMINISTRATOR"].includes(user.globalRole);
  const emailLevel = await notificationLevel();
  const driveConfigured = isGoogleDriveConfigured();
  const integrations = [
    { name: "Cloudflare D1", detail: "Application database configured", state: "Configured" },
    { name: "Google OAuth and Shared Drive",
      detail: driveConfigured ? "Sign-in and Shared Drive settings are configured" : "Google credentials and Shared Drive settings need configuration",
      state: driveConfigured ? "Configured" : "Needs setup" }
  ];

  return (
    <div className="page-stack settings-experience">
      <PageHeader eyebrow="Your workspace" title="Settings"
        description="Find the settings you need, manage authorized access, and review the services behind the squadron Hub." />

      <nav className="settings-jump" aria-label="Settings categories">
        {settingsDestinations.map((entry) => {
          const Icon = entry.icon;
          return <a key={entry.id} className="settings-jump-link" href={"#" + entry.id}>
            <Icon size={20} aria-hidden="true" />
            <span><strong>{entry.label}</strong><small>{entry.detail}</small></span>
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>;
        })}
      </nav>

      <section id="email" className="settings-anchor" aria-label="Squadron email preferences">
        <SectionCard title="Squadron email" description="Notification delivery for the squadron. Only authorized members may change it.">
          <SquadronEmail initial={emailLevel} levels={LEVELS} canChange={canEditNotifications} />
        </SectionCard>
      </section>

      <section id="access" className="settings-anchor" aria-label="Account and security access">
        <SectionCard title="Accounts and access" description="Hub roles and Shared Drive membership are managed separately.">
          <div className="action-list">
            <div className="action-card">
              <span><strong>Your Hub role</strong><small>{user.globalRole.replaceAll("_", " ").toLowerCase()}</small></span>
            </div>
            {canAdministerAccounts ? (
              <Link className="action-card" href="/admin/users">
                <span><strong>Manage users and succession</strong><small>Assign roles, suspend access and review accounts.</small></span>
                <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
            ) : null}
            <Link className="action-card" href="/settings/ai-connections">
              <span><strong>Connect ChatGPT or Claude</strong><small>Set up your personal read-only AI connection and revoke old keys.</small></span>
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
            <Link className="action-card" href="/audit">
              <span><strong>Activity history</strong><small>Review recorded security and administrative actions.</small></span>
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </SectionCard>
      </section>

      <section id="connections" className="settings-anchor content-grid content-grid--equal" aria-label="Connections and system information">
        <SectionCard title="Operational connections" description="Configuration status does not necessarily guarantee current service availability.">
          <div className="integration-list">
            {integrations.map((integration) => (
              <article key={integration.name}>
                <div><strong>{integration.name}</strong><span>{integration.detail}</span></div>
                <span className="category-label">{integration.state}</span>
              </article>
            ))}
          </div>
          <div className="settings-quicklinks">
            <Link className="button button--ghost" href="/integrations">All integrations <ArrowUpRight size={16} /></Link>
            <Link className="button button--ghost" href="/connections">My connections <ArrowUpRight size={16} /></Link>
          </div>
        </SectionCard>
        <SectionCard title="Squadron profile" description="These values are currently read-only.">
          <form className="settings-form">
            <label>Squadron name<input defaultValue="Oak Ridge Composite Squadron" disabled /></label>
            <label>Charter code<input defaultValue="TN-170" disabled /></label>
            <label>Timezone<select defaultValue="America/New_York" disabled><option value="America/New_York">Eastern Time</option></select></label>
            <small>Profile editing is not yet connected to live operational records.</small>
          </form>
        </SectionCard>
        <SectionCard title="System hosting" description="Technical reference for authorized staff; this does not replace connection health monitoring.">
          <div className="record-list">
            <div className="record-row"><span className="record-row__marker record-row__marker--success" /><div className="record-row__content"><strong>Web and API</strong><span>Cloudflare Workers with OpenNext</span></div></div>
            <div className="record-row"><span className="record-row__marker record-row__marker--success" /><div className="record-row__content"><strong>Operational database</strong><span>Cloudflare D1</span></div></div>
            <div className="record-row"><span className="record-row__marker record-row__marker--info" /><div className="record-row__content"><strong>Documents</strong><span>TN 170 Command Google Shared Drive</span><small>Member access follows configured Google permissions.</small></div></div>
          </div>
        </SectionCard>
      </section>

      <section id="configuration" className="settings-anchor" aria-label="Advanced Shared Drive configuration">
        <details className="settings-advanced">
          <summary><span><Settings2 size={20} aria-hidden="true" /><strong>Advanced Shared Drive configuration</strong><small>For members responsible for maintaining the Google Drive connection</small></span><LockKeyhole size={18} aria-hidden="true" /></summary>
          <SectionCard title="The Hub's key to the Shared Drive">
            <DriveServiceAccount driveId={process.env.GOOGLE_SHARED_DRIVE_ID ?? null} />
          </SectionCard>
        </details>
      </section>
    </div>
  );
}
