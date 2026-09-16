import { AiChoiceCard } from "@/components/connections/ai-choice-card";
import { ConnectionsBoard } from "@/components/connections/connections-board";
import { EmailIntakeCard } from "@/components/connections/email-intake-card";
import { PageHeader } from "@/components/page-header";
import { aiSource, preferredProvider } from "@/lib/ai/provider";
import { isVendorProvider } from "@/lib/ai/vendors";
import { requireUser } from "@/lib/auth/session";
import { listUserConnections, PROVIDERS } from "@/lib/connections";
import { getEmailIntake } from "@/lib/email-intake";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const user = await requireUser();
  const [connections, intake, choice] = await Promise.all([
    listUserConnections(user.id, user.email),
    getEmailIntake(user.id),
    preferredProvider(user.id)
  ]);
  const connectedAi = connections
    .filter((connection) => connection.status === "CONNECTED" && isVendorProvider(connection.provider))
    .map((connection) => connection.provider);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Your account"
        title="My connections"
        description="Connect your own accounts so the Hub can work with them. Only you can use what you connect here."
      />
      <EmailIntakeCard address={intake.address} />
      <AiChoiceCard
        providers={PROVIDERS}
        connected={connectedAi}
        squadronAvailable={aiSource() === "squadron-server"}
        initialChoice={choice && connectedAi.includes(choice) ? choice : "squadron-server"}
      />
      <ConnectionsBoard providers={PROVIDERS} initialConnections={connections} />
    </div>
  );
}
