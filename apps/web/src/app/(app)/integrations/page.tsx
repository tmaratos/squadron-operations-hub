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
    <div className="page-stack">
      <PageHeader
        eyebrow="Workspace"
        title="Integrations"
        description="Connect the Hub to the tools the squadron already uses. Connection status is saved to the Hub database, and every change is recorded in History."
      />
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
