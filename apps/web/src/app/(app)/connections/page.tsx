import { AiChoiceCard } from "@/components/connections/ai-choice-card";
import { ConnectionsBoard } from "@/components/connections/connections-board";
import { MailSuggestions } from "@/components/connections/mail-suggestions";
import { MailboxesCard } from "@/components/connections/mailboxes-card";
import { listMailAccounts } from "@/lib/google/mail-accounts";
import { isMicrosoftConfigured } from "@/lib/microsoft/graph";
import { PageHeader } from "@/components/page-header";
import { aiSource, preferredProvider } from "@/lib/ai/provider";
import { isVendorProvider } from "@/lib/ai/vendors";
import { requireUser } from "@/lib/auth/session";
import { listUserConnections, PROVIDERS } from "@/lib/connections";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const user = await requireUser();
  const [connections, choice, mailboxes] = await Promise.all([
    listUserConnections(user.id, user.email),
    preferredProvider(user.id),
    listMailAccounts(user.id)
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
      <MailSuggestions />
      <MailboxesCard signedInAs={user.email} accounts={mailboxes} microsoftReady={isMicrosoftConfigured()} />
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
