import { requireUser } from "@/lib/auth/session";
import { listUsers } from "@/lib/auth/repository";
import { listDutyAssignments } from "@/lib/operations/staff";
import { listPersonnelCommittees, listPersonnelMembers, listPersonnelPositions } from "@/lib/operations/personnel";
import { listFunctionalAreas } from "@/lib/operations/tasks";
import { StaffPage } from "@/modules/staff";

export const dynamic = "force-dynamic";

export default async function Page() {
  const currentUser = await requireUser();
  const [assignments, functionalAreas, users, personnelMembers, personnelPositions, personnelCommittees] = await Promise.all([
    listDutyAssignments(),
    listFunctionalAreas(),
    listUsers(),
    listPersonnelMembers(),
    listPersonnelPositions(),
    listPersonnelCommittees()
  ]);

  return (
    <StaffPage
      initialAssignments={assignments}
      personnelMembers={personnelMembers}
      personnelPositions={personnelPositions}
      personnelCommittees={personnelCommittees}
      functionalAreas={functionalAreas}
      users={users
        .filter((item) => item.status === "APPROVED")
        .map((item) => ({ id: item.id, fullName: item.fullName, email: item.email, dutyTitle: item.dutyTitle, globalRole: item.globalRole }))}
      canManage={["SYSTEM_OWNER", "ADMINISTRATOR"].includes(currentUser.globalRole)}
      canDelete={currentUser.globalRole === "SYSTEM_OWNER"}
    />
  );
}
