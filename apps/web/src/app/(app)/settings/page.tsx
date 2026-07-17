import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { isGoogleDriveConfigured } from "@/lib/drive/google-auth";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const env = getCloudflareEnv();
  const owner = ["SYSTEM_OWNER", "ACCOUNT_APPROVER"].includes(user.globalRole);
  const integrations = [
    { name: "Cloudflare D1", detail: "Connected as the application database", state: "Connected" },
    { name: "Google Shared Drive", detail: isGoogleDriveConfigured() ? "TN 170 Command storage is connected" : "Service-account secrets and drive ID are required", state: isGoogleDriveConfigured() ? "Connected" : "Needs setup" },
    { name: "Magic-link email", detail: env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN ? "Mailgun delivery is configured" : "Mailgun API secret and domain are required", state: env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN ? "Connected" : "Needs setup" },
    { name: "Cloudflare Turnstile", detail: env.TURNSTILE_SECRET_KEY ? "Login and access-request forms are protected" : "Optional bot protection is not configured", state: env.TURNSTILE_SECRET_KEY ? "Connected" : "Optional" },
    { name: "Discord", detail: "Integration adapter is present; channel authorization is not configured", state: "Planned" }
  ];

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Administration" title="Settings" description="Review the squadron profile, security model, Cloudflare resources, Google Drive storage, and communication integrations." />
      <div className="content-grid content-grid--equal">
        <SectionCard title="Squadron profile">
          <form className="settings-form">
            <label>Squadron name<input defaultValue="Oak Ridge Composite Squadron" disabled /></label>
            <label>Charter code<input defaultValue="TN-170" disabled /></label>
            <label>Timezone<select defaultValue="America/New_York" disabled><option value="America/New_York">Eastern Time</option></select></label>
            <small>Profile editing will be enabled after operational records move from demonstration data into D1.</small>
          </form>
        </SectionCard>
        <SectionCard title="Operational integrations">
          <div className="integration-list">
            {integrations.map((integration) => (
              <article key={integration.name}>
                <div><strong>{integration.name}</strong><span>{integration.detail}</span></div>
                <span className="category-label">{integration.state}</span>
              </article>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="Account security" description="Accounts require manual approval and use one-time email links instead of passwords.">
          <div className="action-list">
            <div className="action-card"><span><strong>Your global role</strong><small>{user.globalRole.replaceAll("_", " ")}</small></span></div>
            {owner ? <Link className="action-card" href="/admin/users"><span><strong>Manage users and succession</strong><small>Approve requests, suspend accounts, and promote another system owner.</small></span></Link> : null}
          </div>
        </SectionCard>
        <SectionCard title="Production boundary" description="This application is hosted on Cloudflare Workers and does not require Tristan's home server.">
          <div className="record-list">
            <div className="record-row"><span className="record-row__marker record-row__marker--success" /><div className="record-row__content"><strong>Web and API</strong><span>Cloudflare Workers with OpenNext</span><small>Free-tier architecture</small></div></div>
            <div className="record-row"><span className="record-row__marker record-row__marker--success" /><div className="record-row__content"><strong>Operational database</strong><span>Cloudflare D1</span><small>No PostgreSQL or Redis server required</small></div></div>
            <div className="record-row"><span className="record-row__marker record-row__marker--info" /><div className="record-row__content"><strong>Documents</strong><span>TN 170 Command Google Shared Drive</span><small>Accessed server-side through a service account</small></div></div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
