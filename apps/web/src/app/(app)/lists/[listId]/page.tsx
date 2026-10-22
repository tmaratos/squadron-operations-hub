import Link from "next/link";
import { notFound } from "next/navigation";
import { ListWorkspace } from "@/components/work/list-workspace";
import { requireUser } from "@/lib/auth/session";
import { listAssignableUsers, listItems } from "@/lib/work/items";
import { getListDetail } from "@/lib/work/structure";

export const dynamic = "force-dynamic";

export default async function ListPage({ params, searchParams }: { params: Promise<{ listId: string }>; searchParams: Promise<{ item?: string }> }) {
  const user = await requireUser();
  const { listId } = await params;
  const { item } = await searchParams;
  const list = await getListDetail(listId);
  if (!list) notFound();
  const [items, people] = await Promise.all([listItems(listId), listAssignableUsers()]);

  return (
    <div className="page-stack">
      {/* The whole way here in one line. The shell's own trail is left off list pages, because it can
          only say "Squadron" - this one can say which department, and which folder. */}
      <nav className="cu-crumbs" aria-label="Breadcrumb">
        <span><Link href="/staff">Squadron</Link><i aria-hidden="true">/</i></span>
        <span><Link href="/spaces">{list.spaceName}</Link><i aria-hidden="true">/</i></span>
        {list.folderName ? <span>{list.folderName}<i aria-hidden="true">/</i></span> : null}
        <span><strong aria-current="page">{list.name}</strong></span>
      </nav>
      <ListWorkspace list={list} initialItems={items} people={people} canEdit={user.globalRole !== "READ_ONLY"} initialOpenId={item && items.some((entry) => entry.id === item) ? item : null} />
    </div>
  );
}
