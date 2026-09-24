import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { getDatabase } from "@/lib/cloudflare";
import { recordAuditEvent } from "@/lib/db/audit";
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
