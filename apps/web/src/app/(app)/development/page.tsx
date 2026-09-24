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
        title="Positions and development"
        description="Who holds which duty position, how far each member has gone in professional development, and what the Hub can put in front of them next."
      />
      <DevelopmentBoard />
    </div>
  );
}
