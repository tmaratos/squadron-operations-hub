import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { MemberAccessTable } from "@/components/admin/member-access-table";
import { requireUser } from "@/lib/auth/session";
import { canManageAccess, listMembers } from "@/lib/members/access";

export const dynamic = "force-dynamic";

// Who may use the Hub, and who CAP says is a member. Two columns, deliberately side by side, because the
// whole point of this page is that they are different questions with different answers.

export default async function MemberAccessPage() {
  const user = await requireUser();
  // Checked here as well as in the API. The page not rendering is a courtesy; the API refusing is the rule.
  if (!canManageAccess(user.globalRole)) redirect("/");

  const members = await listMembers();

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Administration"
        title="Member access"
        description="Being in TN-170 and being allowed into the Hub are separate. CAP membership comes from the roster; access is granted here, by a person."
      />
      <MemberAccessTable
        members={members}
        canManage={canManageAccess(user.globalRole)}
      />
    </div>
  );
}
