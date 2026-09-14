import { PageHeader } from "@/components/page-header";
import { IntegrationsBoard } from "@/components/integrations/integrations-board";
import { requireUser } from "@/lib/auth/session";
import { isGoogleDriveConfigured } from "@/lib/drive/google-auth";
import { listIntegrations } from "@/lib/operations/workspaces";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const user = await requireUser();
  const { ready, integrations } = await listIntegrations();

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Workspace"
        title="Integrations"
        description="Connect the Hub to the tools the squadron already uses. Connection status is saved to the Hub database, and every change is recorded in History."
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
