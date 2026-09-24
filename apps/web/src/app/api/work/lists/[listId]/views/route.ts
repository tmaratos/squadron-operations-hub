import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { getDatabase } from "@/lib/cloudflare";
import { assertSameOrigin } from "@/lib/security/origin";
import { createView, listViews, WORKSPACE_ID } from "@/lib/work/structure";

// Saved views on a list.
//
// A view is a way of looking at the same work: what it is grouped by, what it is sorted by, what is
// filtered out. They are saved and named so a squadron keeps the ways it actually looks at things -
// "Overdue by owner", "This month's events" - rather than rebuilding them every time.

const configSchema = z.object({
  groupBy: z.enum(["status", "priority", "assignee", "due", "none"]).optional(),
  sortBy: z.enum(["due", "priority", "updated", "title", "manual"]).optional(),
  filters: z.object({
    due: z.enum(["overdue", "today", "next7", "next14", "none"]).optional(),
    statusName: z.string().trim().max(40).optional(),
    tags: z.array(z.string().trim().max(60)).max(10).optional(),
    priorities: z.array(z.enum(["URGENT", "HIGH", "NORMAL", "LOW"])).max(4).optional(),
    assigneeIds: z.array(z.string().trim().max(80)).max(20).optional(),
    includeClosed: z.boolean().optional(),
    search: z.string().trim().max(120).optional()
  }).optional()
}).optional();

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().trim().min(1).max(60),
    type: z.enum(["list", "board", "table", "calendar"]),
    config: configSchema
  }),
  z.object({
    action: z.literal("update"),
    id: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(60).optional(),
    config: configSchema
  }),
  z.object({ action: z.literal("delete"), id: z.string().trim().min(1).max(80) }),
  z.object({ action: z.literal("setDefault"), id: z.string().trim().min(1).max(80) })
]);

export async function POST(request: Request, { params }: { params: Promise<{ listId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (user.globalRole === "READ_ONLY") {
      return NextResponse.json({ message: "Read-only accounts cannot change views." }, { status: 403 });
    }
    const { listId } = await params;
    const input = schema.parse(await request.json());
    const db = getDatabase();
    const now = new Date().toISOString();

    if (input.action === "create") {
      await createView({
        scopeType: "list",
        scopeId: listId,
        name: input.name,
        type: input.type,
        config: input.config ?? {},
        userId: user.id
      });
    } else if (input.action === "update") {
      const sets: string[] = [];
      const values: unknown[] = [];
      if (input.name !== undefined) { sets.push("name = ?"); values.push(input.name); }
      if (input.config !== undefined) { sets.push("config_json = ?"); values.push(JSON.stringify(input.config)); }
      if (sets.length) {
        sets.push("updated_at = ?");
        values.push(now, input.id, listId);
        await db.prepare("UPDATE views SET " + sets.join(", ") + " WHERE id = ? AND scope_id = ?").bind(...values).run();
      }
    } else if (input.action === "delete") {
      // A list keeps at least one way of being looked at.
      const remaining = await db
        .prepare("SELECT COUNT(*) AS total FROM views WHERE scope_type = 'list' AND scope_id = ?")
        .bind(listId)
        .first<{ total: number }>();
      if ((remaining?.total ?? 0) <= 1) {
        return NextResponse.json({ message: "That is the only view. A list needs at least one." }, { status: 409 });
      }
      await db.prepare("DELETE FROM views WHERE id = ? AND scope_id = ?").bind(input.id, listId).run();
    } else {
      await db.prepare("UPDATE views SET is_default = 0 WHERE scope_type = 'list' AND scope_id = ?").bind(listId).run();
      await db.prepare("UPDATE views SET is_default = 1, updated_at = ? WHERE id = ? AND scope_id = ?").bind(now, input.id, listId).run();
    }

    return NextResponse.json({ views: await listViews("list", listId), message: "Saved." });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That view was not valid." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "That view could not be saved." }, { status: 500 });
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ listId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  const { listId } = await params;
  return NextResponse.json({ views: await listViews("list", listId), workspaceId: WORKSPACE_ID });
}
