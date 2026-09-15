import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDatabase } from "@/lib/cloudflare";
import { WORKSPACE_ID } from "@/lib/work/structure";

// Powers the Ctrl+K search. With no query it returns the open tasks due soonest, so the palette is useful before typing.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });

  const query = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  const base =
    "SELECT items.id, items.title, items.list_id, lists.name AS list_name, items.due_on, s.name AS status_name, s.color AS status_color, s.category " +
    "FROM items JOIN lists ON lists.id = items.list_id JOIN spaces ON spaces.id = lists.space_id LEFT JOIN list_statuses s ON s.id = items.status_id " +
    "WHERE spaces.workspace_id = ? AND items.archived_at IS NULL AND lists.archived_at IS NULL ";

  const db = getDatabase();
  const statement = query
    ? db.prepare(
        base + "AND items.title LIKE ? ESCAPE '!' " +
        "ORDER BY CASE WHEN s.category IN ('DONE', 'CLOSED') THEN 1 ELSE 0 END, CASE WHEN lower(items.title) LIKE ? ESCAPE '!' THEN 0 ELSE 1 END, items.due_on IS NULL, items.due_on LIMIT 20"
      ).bind(WORKSPACE_ID, "%" + escapeLike(query) + "%", escapeLike(query.toLowerCase()) + "%")
    : db.prepare(
        base + "AND (s.category IS NULL OR s.category NOT IN ('DONE', 'CLOSED')) AND items.due_on IS NOT NULL ORDER BY items.due_on LIMIT 8"
      ).bind(WORKSPACE_ID);

  const result = await statement.all<{ id: string; title: string; list_id: string; list_name: string; due_on: string | null; status_name: string | null; status_color: string | null; category: string | null }>();
  return NextResponse.json({
    tasks: result.results.map((row) => ({
      id: row.id,
      title: row.title,
      listId: row.list_id,
      listName: row.list_name,
      dueOn: row.due_on,
      statusName: row.status_name,
      statusColor: row.status_color,
      closed: row.category === "DONE" || row.category === "CLOSED"
    }))
  });
}

function escapeLike(value: string): string {
  return value.replace(/[!%_]/g, (match) => "!" + match);
}
