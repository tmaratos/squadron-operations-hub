import { PageHeader } from "@/components/page-header";
import type { AuthenticatedUser } from "@/lib/auth/types";
import { StaffMessagesPanel } from "../discord/components/staff-messages-panel";

export function CommunicationsPage({ user }: { user: AuthenticatedUser }) {
  return (
    <div className="page-stack communications-center">
      <PageHeader eyebrow="Squadron operations" title="Communications Center" description="Read and send messages through approved Discord channels without leaving the Hub." />
      <StaffMessagesPanel
        canManage={["SYSTEM_OWNER", "ADMINISTRATOR"].includes(user.globalRole)}
        canSend={user.globalRole !== "READ_ONLY"}
      />
    </div>
  );
}
