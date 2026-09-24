import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { getDatabase } from "@/lib/cloudflare";
import { recordAuditEvent } from "@/lib/db/audit";
import { assertSameOrigin } from "@/lib/security/origin";
import { archiveNode, createFolder, createList, createSpace, getWorkspaceTree, moveList, renameNode, reorderSpaces } from "@/lib/work/structure";

// Renaming and removing departments, folders and lists.
//
// Until now they could only be created - by a member or by the assistant - and never tidied up, so two
// departments called Aerospace Education sat in the sidebar with no way to be rid of either.
//
// Removing archives rather than deletes: the work inside is still in the database and an administrator can
// bring it back, which matters when the thing being removed turns out to have been the one people were using.

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  return NextResponse.json({ spaces: await getWorkspaceTree() });
}

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    kind: z.enum(["space", "folder", "list"]),
    name: z.string().trim().min(1).max(80),
    // A list needs to know where it goes; a department does not.
    spaceId: z.string().trim().min(1).max(80).optional(),
    folderId: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(400).optional()
  }),
  z.object({
    action: z.literal("rename"),
    kind: z.enum(["space", "folder", "list"]),
    id: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(80)
  }),
  z.object({
    action: z.literal("reorder"),
    kind: z.literal("space"),
    ids: z.array(z.string().trim().min(1).max(80)).min(1).max(60)
  }),
  z.object({
    action: z.literal("move"),
    kind: z.literal("list"),
    id: z.string().trim().min(1).max(80),
    spaceId: z.string().trim().min(1).max(80)
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

    if (input.action === "create") {
      // Nothing in the app could make a department or a list: only the assistant could, through its own
      // tools, which left a member who wanted a new list with a menu item that went nowhere.
      if (input.kind !== "space" && !input.spaceId) {
        return NextResponse.json({ message: "Say which department it belongs to." }, { status: 400 });
      }

      const existing = await getWorkspaceTree();
      const wanted = input.name.trim().toLowerCase();
      const clash = input.kind === "space"
        ? existing.some((space) => space.name.trim().toLowerCase() === wanted)
        : existing.find((space) => space.id === input.spaceId)?.lists.some((list) => list.name.trim().toLowerCase() === wanted);
      if (clash) {
        return NextResponse.json(
          { message: "There is already " + (input.kind === "space" ? "a department" : "a list") + " called " + input.name.trim() + "." },
          { status: 409 }
        );
      }

      const id = input.kind === "space"
        ? await createSpace({ name: input.name, description: input.description ?? null, userId: user.id })
        : input.kind === "folder"
          ? await createFolder({ spaceId: input.spaceId as string, name: input.name })
          : await createList({
              spaceId: input.spaceId as string,
              folderId: input.folderId ?? null,
              name: input.name,
              description: input.description ?? null,
              userId: user.id
            });

      await recordAuditEvent({
        actorUserId: user.id,
        action: "STRUCTURE_CREATED",
        entityType: input.kind,
        entityId: id,
        summary: user.fullName + " created the " + input.kind + " " + input.name.trim(),
        metadata: { kind: input.kind, name: input.name.trim() }
      });

      return NextResponse.json({
        spaces: await getWorkspaceTree(),
        id,
        message: input.name.trim() + " is ready."
      });
    }

    if (input.action === "reorder") {
      const tree = await getWorkspaceTree();
      const known = new Set(tree.map((space) => space.id));
      // Only departments that exist, and every one of them, so nothing is left without a place in the order.
      const ordered = input.ids.filter((id) => known.has(id));
      if (ordered.length !== tree.length) {
        return NextResponse.json({ message: "That ordering did not match the departments." }, { status: 400 });
      }
      await reorderSpaces(ordered);
      await recordAuditEvent({
        actorUserId: user.id,
        action: "STRUCTURE_REORDERED",
        entityType: "space",
        entityId: ordered[0],
        summary: user.fullName + " reordered the departments",
        metadata: { ids: ordered }
      });
      return NextResponse.json({ spaces: await getWorkspaceTree(), message: "Order saved." });
    }

    if (input.action === "move") {
      const tree = await getWorkspaceTree();
      const target = tree.find((space) => space.id === input.spaceId);
      if (!target) return NextResponse.json({ message: "That department is not there." }, { status: 404 });
      const from = tree.find((space) => space.lists.some((list) => list.id === input.id));
      if (from?.id === input.spaceId) {
        return NextResponse.json({ spaces: tree, message: "It is already there." });
      }

      await moveList(input.id, input.spaceId);
      await recordAuditEvent({
        actorUserId: user.id,
        action: "STRUCTURE_MOVED",
        entityType: "list",
        entityId: input.id,
        summary: user.fullName + " moved a list into " + target.name,
        metadata: { spaceId: input.spaceId, from: from?.id ?? null }
      });
      return NextResponse.json({ spaces: await getWorkspaceTree(), message: "Moved into " + target.name + "." });
    }

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
