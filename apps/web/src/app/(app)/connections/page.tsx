import { ConnectionsBoard } from "@/components/connections/connections-board";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { listUserConnections, PROVIDERS } from "@/lib/connections";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const user = await requireUser();
  const connections = await listUserConnections(user.id, user.email);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Your account"
        title="My connections"
        description="Connect your own accounts so the Hub can work with them. Only you can use what you connect here."
      />
      <ConnectionsBoard providers={PROVIDERS} initialConnections={connections} />
    </div>
  );
}
