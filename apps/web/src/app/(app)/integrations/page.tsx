import Link from "next/link";
import { ArrowRight, Bot } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { IntegrationsBoard } from "@/components/integrations/integrations-board";
import { CapwatchCard } from "@/components/integrations/capwatch-card";
import { capwatchStatus } from "@/lib/capwatch/capwatch";
import { requireUser } from "@/lib/auth/session";
import { isGoogleDriveConfigured } from "@/lib/drive/google-auth";
import { listIntegrations } from "@/lib/operations/workspaces";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const user = await requireUser();
  const { ready, integrations } = await listIntegrations();
  // CAPWATCH sits above the rest because a stale member directory is felt everywhere else in the Hub.
  const capwatch = await capwatchStatus();
  const mayManageCapwatch = user.globalRole === "SYSTEM_OWNER" || user.globalRole === "ADMINISTRATOR";

  return (
    <div className="page-stack integrations-experience">
      <PageHeader
        eyebrow="Workspace"
        title="Integrations"
        description="Connect the Hub to the tools the squadron already uses. Connection status is saved to the Hub database, and every change is recorded in History."
      />
      <section className="ai-connect-panel" aria-label="Personal AI connections">
        <h2><Bot size={21} aria-hidden="true" /> ChatGPT and Claude</h2>
        <p>Use your own approved Hub account to read squadron tasks and workspaces in supported AI clients. Personal connection keys can be revoked at any time.</p>
        <Link href="/settings/ai-connections" className="ai-connect-integration-link">
          Connect your AI account <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </section>
      <CapwatchCard
        status={mayManageCapwatch ? capwatch : { ...capwatch, capid: null, credentialUpdatedAt: null }}
        mayManage={mayManageCapwatch}
      />
      <IntegrationsBoard
        initialIntegrations={integrations}
        ready={ready}
        driveConfigured={isGoogleDriveConfigured()}
        isAdmin={["SYSTEM_OWNER", "ADMINISTRATOR"].includes(user.globalRole)}
        canRequest={user.globalRole !== "READ_ONLY"}
      />
    </div>
  );
}
