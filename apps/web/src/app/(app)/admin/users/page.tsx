import { PageHeader } from "@/components/page-header";
import { UserAdministration } from "@/components/admin/user-administration";
import { listPendingAccessRequests, listUsers } from "@/lib/auth/repository";
import { requireRole } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function UserAdministrationPage() {
  const actor = await requireRole(["SYSTEM_OWNER", "ACCOUNT_APPROVER"]);
  const [users, requests] = await Promise.all([listUsers(), listPendingAccessRequests()]);
  return (
    <div className="page-stack">
      <PageHeader eyebrow="Security and succession" title="User Administration" description="Approve new accounts, suspend access, and transfer full system-owner privileges to another trusted senior member." />
      <UserAdministration actor={actor} users={users} requests={requests} />
    </div>
  );
}
