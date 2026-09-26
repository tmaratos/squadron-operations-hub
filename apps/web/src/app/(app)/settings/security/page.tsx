import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { summariseControls } from "@/lib/security/attestation";
import { SecurityControls } from "@/components/security/security-controls";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const user = await requireUser();
  const canSee = ["SYSTEM_OWNER", "ADMINISTRATOR"].includes(user.globalRole);

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Running the Hub"
        title="Security controls"
        description="What the squadron attested to CAP, checked against the running system rather than remembered. Each one is a count you can verify by hand, and anything the Hub cannot see for itself says so."
      />
      {canSee ? <SecurityControls initial={await summariseControls()} /> : (
        <p className="page-note">Only a system owner or administrator may see this.</p>
      )}
    </div>
  );
}
