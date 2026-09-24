import { PageHeader } from "@/components/page-header";
import { GoalsBoard } from "@/components/goals/goals-board";
import { requireUser } from "@/lib/auth/session";
import { listGoals } from "@/lib/goals/goals";
import { listUsers } from "@/lib/auth/repository";
import { getWorkspaceTree } from "@/lib/work/structure";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const user = await requireUser();
  const [goals, spaces, users] = await Promise.all([
    listGoals(),
    getWorkspaceTree().catch(() => []),
    listUsers().catch(() => [])
  ]);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Direction"
        title="Goals"
        description="What the squadron is trying to achieve, as opposed to what it has to do this week. A task is done or not; a goal has a distance left to travel and a date it has to be true by."
      />
      <GoalsBoard
        goals={goals}
        canEdit={user.globalRole !== "READ_ONLY"}
        lists={spaces.flatMap((space) => space.lists.map((list) => ({ id: list.id, name: list.name, spaceName: space.name })))}
        people={users.filter((entry) => entry.status === "APPROVED").map((entry) => ({ userId: entry.id, fullName: entry.fullName }))}
      />
    </div>
  );
}
