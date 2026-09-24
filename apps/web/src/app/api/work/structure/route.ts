import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { getDatabase } from "@/lib/cloudflare";
import { recordAuditEvent } from "@/lib/db/audit";
import { assertSameOrigin } from "@/lib/security/origin";
import { archiveNode, getWorkspaceTree, renameNode } from "@/lib/work/structure";

// Renaming and removing departments, folders and lists.
//
// Until now they could only be created - by a member or by the assistant - and never tidied up, so two
// departments called Aerospace Education sat in the sidebar with no way to be rid of either.
//
// Removing archives rather than deletes: the work inside is still in the database and an administrator can
// bring it back, which matters when the thing being removed turns out to have been the one people were using.

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("rename"),
    kind: z.enum(["space", "folder", "list"]),
    id: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(80)
  }),
  z.object({
    action: z.literal("archive"),
    kind: z.enum(["space", "folder", "list"]),
    id: z.string().trim().min(1).max(80)
  })
]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (user.globalRole === "READ_ONLY") {
      return NextResponse.json({ message: "Read-only accounts cannot change the workspace." }, { status: 403 });
    }
    const input = schema.parse(await request.json());
    const db = getDatabase();

    if (input.action === "rename") {
      await renameNode(input.kind, input.id, input.name);
      await recordAuditEvent({
        actorUserId: user.id,
        action: "STRUCTURE_RENAMED",
        entityType: input.kind,
        entityId: input.id,
        summary: user.fullName + " renamed a " + input.kind + " to " + input.name,
        metadata: { kind: input.kind, name: input.name }
      });
      return NextResponse.json({ spaces: await getWorkspaceTree(), message: "Renamed." });
    }

    // What is about to disappear, said plainly, because "are you sure" is worth nothing without a number.
    const counts = input.kind === "list"
      ? await db.prepare("SELECT COUNT(*) AS open FROM items WHERE list_id = ? AND archived_at IS NULL").bind(input.id).first<{ open: number }>()
      : input.kind === "space"
        ? await db.prepare(
            "SELECT COUNT(*) AS open FROM items JOIN lists ON lists.id = items.list_id WHERE lists.space_id = ? AND items.archived_at IS NULL"
          ).bind(input.id).first<{ open: number }>()
        : { open: 0 };

    await archiveNode(input.kind, input.id);

    // A department's lists go with it, or they would be left pointing at something no longer shown.
    if (input.kind === "space") {
      const now = new Date().toISOString();
      await db.prepare("UPDATE lists SET archived_at = ?, updated_at = ? WHERE space_id = ? AND archived_at IS NULL").bind(now, now, input.id).run();
      await db.prepare("UPDATE folders SET archived_at = ?, updated_at = ? WHERE space_id = ? AND archived_at IS NULL").bind(now, now, input.id).run();
    }

    await recordAuditEvent({
      actorUserId: user.id,
      action: "STRUCTURE_ARCHIVED",
      entityType: input.kind,
      entityId: input.id,
      summary: user.fullName + " removed a " + input.kind + " holding " + (counts?.open ?? 0) + " open tasks",
      metadata: { kind: input.kind, openItems: counts?.open ?? 0 }
    });

    return NextResponse.json({
      spaces: await getWorkspaceTree(),
      message: counts?.open
        ? "Removed, along with " + counts.open + " open task" + (counts.open === 1 ? "" : "s") + ". Nothing is deleted — ask an administrator if it has to come back."
        : "Removed. It was empty."
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That change was invalid." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "That change could not be saved." }, { status: 500 });
  }
}
