import Link from "next/link";
import { notFound } from "next/navigation";
import { ListWorkspace } from "@/components/work/list-workspace";
import { requireUser } from "@/lib/auth/session";
import { listAssignableUsers, listItems } from "@/lib/work/items";
import { getListDetail } from "@/lib/work/structure";

export const dynamic = "force-dynamic";

export default async function ListPage({ params }: { params: Promise<{ listId: string }> }) {
  const user = await requireUser();
  const { listId } = await params;
  const list = await getListDetail(listId);
  if (!list) notFound();
  const [items, people] = await Promise.all([listItems(listId), listAssignableUsers()]);

  return (
    <div className="page-stack">
      <nav style={{ fontSize: 13, opacity: 0.75 }}>
        <Link href="/spaces">{list.spaceName}</Link>
        {list.folderName ? " / " + list.folderName : ""}
        {" / " + list.name}
      </nav>
      <ListWorkspace list={list} initialItems={items} people={people} canEdit={user.globalRole !== "READ_ONLY"} />
    </div>
  );
}
