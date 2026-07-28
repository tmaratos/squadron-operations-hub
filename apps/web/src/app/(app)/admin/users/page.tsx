import { PageHeader } from "@/components/page-header";
import { UserAdministration } from "@/components/admin/user-administration";
import { listUsers } from "@/lib/auth/repository";
import { requireRole } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function UserAdministrationPage() {
  const actor = await requireRole(["SYSTEM_OWNER", "ACCOUNT_APPROVER"]);
  const users = await listUsers();
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Security and succession" title="User Administration" description="Manage Hub roles and suspend Hub access. Google Drive membership is managed by squadron command staff." />
      <UserAdministration actor={actor} users={users} />
    </div>
  );
}
