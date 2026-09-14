import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { getWorkspaceTree } from "@/lib/work/structure";
import type { ListNode } from "@/lib/work/types";

export const dynamic = "force-dynamic";

function ListLink({ list }: { list: ListNode }) {
  return (
    <Link className="spaces-list" href={"/lists/" + list.id}>
      <span className="spaces-dot" />
      <span className="spaces-name">{list.name}</span>
      <span className="spaces-count">{list.openItems}</span>
    </Link>
  );
}

export default async function SpacesPage() {
  await requireUser();
  const spaces = await getWorkspaceTree();

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Workspace"
        title="Spaces"
        description="Every space, folder and list in the workspace. Open a list to work its items in list or board view."
      />
      <style>{spacesCss}</style>
      {spaces.length === 0 ? <p className="spaces-empty">No spaces yet.</p> : null}
      <div className="spaces-grid">
        {spaces.map((space) => (
          <section className="spaces-card" key={space.id}>
            <header>
              <span className="spaces-avatar">{space.name.slice(0, 1).toUpperCase()}</span>
              <div>
                <h2>{space.name}</h2>
                {space.description ? <p>{space.description}</p> : null}
              </div>
            </header>
            {space.lists.map((list) => <ListLink key={list.id} list={list} />)}
            {space.folders.map((folder) => (
              <div className="spaces-folder" key={folder.id}>
                <h3>{folder.name}</h3>
                {folder.lists.map((list) => <ListLink key={list.id} list={list} />)}
              </div>
            ))}
          </section>
        ))}
      </div>
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
