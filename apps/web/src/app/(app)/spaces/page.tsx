import { PageHeader } from "@/components/page-header";
import { SpaceManager } from "@/components/work/space-manager";
import { requireUser } from "@/lib/auth/session";
import { getWorkspaceTree } from "@/lib/work/structure";

export const dynamic = "force-dynamic";

export default async function SpacesPage() {
  const user = await requireUser();
  const spaces = await getWorkspaceTree();

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Workspace"
        title="Departments and lists"
        description="Everything the squadron works in. Rename anything that is wrong, and remove what should not be there — removing hides it and keeps the work, rather than destroying it."
      />
      <style>{spacesCss}</style>
      <SpaceManager spaces={spaces} canEdit={user.globalRole !== "READ_ONLY"} />
    </div>
  );
}

const spacesCss = [
  ".spaces-grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(320px,1fr))}",
  ".spaces-card{background:var(--surface,#fff);border:1px solid var(--border,#e4e6eb);border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:4px}",
  "html[data-theme=dark] .spaces-card{background:#222326;border-color:#34363b}",
  ".spaces-card header{display:flex;gap:12px;align-items:center;margin-bottom:8px}",
  ".spaces-card h2{font-size:16px;margin:0}.spaces-card header p{margin:2px 0 0;font-size:12px;opacity:.7}",
  ".spaces-avatar{width:32px;height:32px;border-radius:8px;background:#7b68ee;color:#fff;display:grid;place-items:center;font-weight:700}",
  ".spaces-list{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;color:inherit;text-decoration:none}",
  ".spaces-list:hover{background:rgba(123,104,238,.12)}",
  ".spaces-dot{width:8px;height:8px;border-radius:50%;background:#7b68ee;flex:none}",
  ".spaces-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".spaces-count{font-size:12px;opacity:.65}",
  ".spaces-folder h3{font-size:12px;text-transform:uppercase;letter-spacing:.04em;opacity:.6;margin:10px 10px 2px}"
].join("");
