import { PageHeader } from "@/components/page-header";
import { DriveBrowser } from "@/components/drive/drive-browser";
import { documentExperienceCss } from "@/components/drive/document-experience";
import { requireUser } from "@/lib/auth/session";

export async function DocumentsPage() {
  const user = await requireUser();
  return (
    <div className="page-stack">
      <style>{documentExperienceCss}</style>
      <PageHeader
        eyebrow="TN 170 Command Shared Drive"
        title="Documents"
        description="Find and organize squadron files. Changes here are saved to the TN 170 Command Google Shared Drive."
      />
      <section className="section-card dx">
        <DriveBrowser readOnly={user.globalRole === "READ_ONLY"} />
      </section>
    </div>
  );
}
