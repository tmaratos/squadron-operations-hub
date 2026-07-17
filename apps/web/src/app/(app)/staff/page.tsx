import { requireUser } from "@/lib/auth/session";
import { listUsers } from "@/lib/auth/repository";
import { listDutyAssignments } from "@/lib/operations/staff";
import { listFunctionalAreas } from "@/lib/operations/tasks";
import { StaffPage } from "@/modules/staff";

export const dynamic = "force-dynamic";

export default async function Page() {
  const currentUser = await requireUser();
  const [assignments, functionalAreas, users] = await Promise.all([
    listDutyAssignments(),
    listFunctionalAreas(),
    listUsers()
  ]);

  return (
    <StaffPage
      initialAssignments={assignments}
      functionalAreas={functionalAreas}
      users={users
        .filter((item) => item.status === "APPROVED")
        .map((item) => ({ id: item.id, fullName: item.fullName, email: item.email, dutyTitle: item.dutyTitle, globalRole: item.globalRole }))}
      canManage={["SYSTEM_OWNER", "ADMINISTRATOR"].includes(currentUser.globalRole)}
      canDelete={currentUser.globalRole === "SYSTEM_OWNER"}
    />
  );
}
