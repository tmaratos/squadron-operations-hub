import { PageHeader } from "@/components/page-header";
import { DutiesBoard } from "@/components/work/duties-board";
import { RegReader } from "@/components/work/reg-reader";
import { requireUser } from "@/lib/auth/session";
import { listDuties, outlook } from "@/lib/work/duties";

export const dynamic = "force-dynamic";

export default async function DutiesPage() {
  const user = await requireUser();
  const [duties, dutyOutlook] = await Promise.all([listDuties(), outlook(5)]);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Compliance"
        title="Duties by role"
        description="Every recurring obligation, who owns it, when it falls due, and the regulation or squadron document behind it."
      />
      {user.globalRole === "READ_ONLY" ? null : <RegReader />}
      <DutiesBoard duties={duties} outlook={dutyOutlook} canEdit={user.globalRole !== "READ_ONLY"} />
    </div>
  );
}
