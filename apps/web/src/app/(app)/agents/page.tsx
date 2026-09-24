import { PageHeader } from "@/components/page-header";
import { AgentsBoard } from "@/components/ai/agents-board";
import { requireUser } from "@/lib/auth/session";
import { listAgents } from "@/lib/ai/agents";
import { getWorkspaceTree } from "@/lib/work/structure";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const user = await requireUser();
  const [agents, spaces] = await Promise.all([
    listAgents(user.id, ["SYSTEM_OWNER", "ADMINISTRATOR"].includes(user.globalRole)),
    getWorkspaceTree().catch(() => [])
  ]);
  const lists = spaces.flatMap((space) => space.lists.map((list) => ({ id: list.id, name: list.name, spaceName: space.name })));

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Assistants"
        title="Agents"
        description="An agent is the assistant with a job description kept in front of it, so nobody explains the same thing twice. Shared agents belong to the squadron; the rest are yours alone."
      />
      <AgentsBoard agents={agents} lists={lists} canEdit={user.globalRole !== "READ_ONLY"} />
    </div>
  );
}
