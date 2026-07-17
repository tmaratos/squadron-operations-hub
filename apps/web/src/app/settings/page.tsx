import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";

export default function SettingsPage() {
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Administration" title="Settings" description="Configure the squadron, staff permissions, integrations, notifications, and data boundaries." />
      <div className="content-grid content-grid--equal">
        <SectionCard title="Squadron profile"><form className="settings-form"><label>Squadron name<input defaultValue="Oak Ridge Composite Squadron" /></label><label>Charter code<input defaultValue="TN-170" /></label><label>Timezone<select defaultValue="America/New_York"><option value="America/New_York">Eastern Time</option></select></label><button className="button button--primary" type="button">Save profile</button></form></SectionCard>
        <SectionCard title="Operational integrations"><div className="integration-list"><article><div><strong>Discord</strong><span>Connected to one guild and six channels</span></div><button className="button button--secondary">Manage</button></article><article><div><strong>Email</strong><span>SMTP configuration not complete</span></div><button className="button button--secondary">Configure</button></article><article><div><strong>Calendar</strong><span>Two calendars linked</span></div><button className="button button--secondary">Manage</button></article></div></SectionCard>
      </div>
    </div>
  );
}
