import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { getDatabase } from "@/lib/cloudflare";
import { recordAuditEvent } from "@/lib/db/audit";
import { notify } from "@/lib/notify/notifications";
import { assertSameOrigin } from "@/lib/security/origin";

// Giving several tasks an owner at once.
//
// Assigning 35 things one at a time is 35 chances to give up halfway, which is how work ends up with
// nobody on it - and work with nobody on it is work the Hub cannot remind anyone about.

const schema = z.object({
  itemIds: z.array(z.string().trim().min(1).max(80)).min(1).max(200),
  userId: z.string().trim().min(1).max(80).nullable()
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getCurrentUser();
    if (!actor) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (actor.globalRole === "READ_ONLY") return NextResponse.json({ message: "Read-only accounts cannot assign work." }, { status: 403 });

    const input = schema.parse(await request.json());
    const db = getDatabase();
    const now = new Date().toISOString();

    let person: { id: string; full_name: string } | null = null;
    if (input.userId) {
      person = await db
        .prepare("SELECT id, full_name FROM users WHERE id = ? AND status IN ('APPROVED','PENDING')")
        .bind(input.userId)
        .first<{ id: string; full_name: string }>();
      if (!person) return NextResponse.json({ message: "That person is no longer available." }, { status: 400 });
    }

    // Replacing rather than adding: "give these to Mel" means Mel owns them, not Mel and whoever was there.
    const statements = input.itemIds.flatMap((itemId) => {
      const clear = db.prepare("DELETE FROM item_assignees WHERE item_id = ?").bind(itemId);
      return person
        ? [clear, db.prepare("INSERT OR IGNORE INTO item_assignees (item_id, user_id, assigned_at) VALUES (?, ?, ?)").bind(itemId, person.id, now)]
        : [clear];
    });

    for (let index = 0; index < statements.length; index += 50) {
      await db.batch(statements.slice(index, index + 50));
    }

    // Being given work is the thing a member most needs to hear about, and assigning in bulk is now the
    // usual way it happens. Without this, the quickest way to hand out work was also the only way that
    // told nobody.
    if (person) {
      const rows = await db
        .prepare(
          "SELECT i.id, i.title, i.list_id, i.due_on, l.name AS list_name FROM items i JOIN lists l ON l.id = i.list_id " +
          "WHERE i.id IN (" + input.itemIds.map(() => "?").join(", ") + ")"
        )
        .bind(...input.itemIds)
        .all<{ id: string; title: string; list_id: string; due_on: string | null; list_name: string }>();

      await notify(
        rows.results.map((row) => ({
          userId: person!.id,
          kind: "ASSIGNED" as const,
          title: actor.fullName + " gave you: " + row.title,
          body: "In " + row.list_name + "." + (row.due_on ? " Due " + row.due_on + "." : ""),
          itemId: row.id,
          listId: row.list_id,
          url: (process.env.APP_URL ?? "https://tn170adminhub.tristanmaratos.com") + "/lists/" + row.list_id + "?item=" + row.id,
          actorUserId: actor.id
        }))
      ).catch((error) => console.error(error));
    }

    await recordAuditEvent({
      actorUserId: actor.id,
      action: "ITEMS_ASSIGNED",
      entityType: "item",
      entityId: input.itemIds[0],
      summary: actor.fullName + (person
        ? " gave " + input.itemIds.length + " task" + (input.itemIds.length === 1 ? "" : "s") + " to " + person.full_name
        : " took the owner off " + input.itemIds.length + " task" + (input.itemIds.length === 1 ? "" : "s")),
      metadata: { count: input.itemIds.length, userId: input.userId }
    });

    return NextResponse.json({
      message: person
        ? input.itemIds.length + " now belong" + (input.itemIds.length === 1 ? "s" : "") + " to " + person.full_name + ". They will be in the next daily email."
        : "Owner removed from " + input.itemIds.length + "."
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That request was invalid." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "Those could not be assigned." }, { status: 500 });
  }
}
