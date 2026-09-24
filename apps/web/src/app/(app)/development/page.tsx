import { DevelopmentBoard } from "@/components/work/development-board";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function DevelopmentPage() {
  await requireUser();
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="People"
        title="Professional development"
        description="How far each member has gone, and what the Hub can put in front of them next. Who holds which position is recorded on the People and positions page; it is shown here for context and can be corrected if it is out of date."
      />
      <DevelopmentBoard />
    </div>
  );
}
