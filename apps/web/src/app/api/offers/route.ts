import { NextResponse } from "next/server";
import { z } from "zod";
import { dismissOffer, listOffers } from "@/lib/ai/offers";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { assertSameOrigin } from "@/lib/security/origin";
import { createItem } from "@/lib/work/items";

// What the Hub has noticed and offers to do. Accepting one does the thing; "not now" remembers so the
// same offer does not come back tomorrow.

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  try {
    return NextResponse.json({ offers: await listOffers(user.id) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ offers: [] });
  }
}

const schema = z.object({
  id: z.string().trim().min(1).max(300),
  action: z.enum(["accept", "dismiss"]),
  listId: z.string().trim().max(80).optional(),
  title: z.string().trim().max(300).optional()
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    const input = schema.parse(await request.json());

    if (input.action === "dismiss") {
      await dismissOffer(user.id, input.id);
      return NextResponse.json({ offers: await listOffers(user.id), message: "Fine — I won't bring that up again." });
    }

    if (!input.listId || !input.title) {
      return NextResponse.json({ message: "That offer is no longer valid. Refresh and try again." }, { status: 400 });
    }
    if (user.globalRole === "READ_ONLY") return NextResponse.json({ message: "Read-only accounts cannot create work." }, { status: 403 });

    const id = await createItem({ listId: input.listId, title: input.title, userId: user.id });
    await dismissOffer(user.id, input.id);
    await recordAuditEvent({
      actorUserId: user.id,
      action: "ITEM_CREATED",
      entityType: "item",
      entityId: id,
      summary: user.fullName + " accepted the Hub's offer to create " + input.title,
      metadata: { listId: input.listId, source: "offer" }
    });

    return NextResponse.json({
      offers: await listOffers(user.id),
      created: { id, listId: input.listId },
      message: "Done. Open it to add the details."
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That request was invalid." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "That could not be done." }, { status: 500 });
  }
}
