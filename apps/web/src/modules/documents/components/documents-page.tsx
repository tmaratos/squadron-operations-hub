import { PageHeader } from "@/components/page-header";
import { DriveBrowser } from "@/components/drive/drive-browser";
import { requireUser } from "@/lib/auth/session";

export async function DocumentsPage() {
  const user = await requireUser();
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="TN 170 Command Shared Drive"
        title="Documents"
        description="Create, view, rename, upload, download, and organize squadron files through the app while Google Shared Drive remains the storage backend."
      />
      <section className="section-card">
        <DriveBrowser readOnly={user.globalRole === "READ_ONLY"} />
      </section>
    </div>
  );
}
