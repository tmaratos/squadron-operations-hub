import { requireUser } from "@/lib/auth/session";
import { listUsers } from "@/lib/auth/repository";
import { listComplianceRequirements } from "@/lib/operations/compliance";
import { listFunctionalAreas } from "@/lib/operations/tasks";
import { CompliancePage } from "@/modules/compliance";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireUser();
  const [requirements, functionalAreas, users] = await Promise.all([
    listComplianceRequirements(),
    listFunctionalAreas(),
    listUsers()
  ]);

  return (
    <CompliancePage
      initialRequirements={requirements}
      functionalAreas={functionalAreas}
      users={users
        .filter((item) => item.status === "APPROVED")
        .map((item) => ({ id: item.id, fullName: item.fullName, dutyTitle: item.dutyTitle }))}
      canEdit={user.globalRole !== "READ_ONLY"}
      canDelete={["SYSTEM_OWNER", "ADMINISTRATOR"].includes(user.globalRole)}
    />
  );
}
