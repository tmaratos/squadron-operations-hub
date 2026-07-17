import { requireUser } from "@/lib/auth/session";
import { listUsers } from "@/lib/auth/repository";
import { listFunctionalAreas, listTasks } from "@/lib/operations/tasks";
import { TasksBoard } from "@/modules/tasks/components/tasks-board";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const user = await requireUser();
  const [tasks, functionalAreas, users] = await Promise.all([
    listTasks(),
    listFunctionalAreas(),
    listUsers()
  ]);

  return (
    <TasksBoard
      initialTasks={tasks}
      functionalAreas={functionalAreas}
      users={users
        .filter((item) => item.status === "APPROVED")
        .map((item) => ({ id: item.id, fullName: item.fullName, dutyTitle: item.dutyTitle }))}
      canEdit={user.globalRole !== "READ_ONLY"}
      canDelete={["SYSTEM_OWNER", "ADMINISTRATOR"].includes(user.globalRole)}
    />
  );
}
