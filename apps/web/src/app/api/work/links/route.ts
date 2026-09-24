import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { assertSameOrigin } from "@/lib/security/origin";
import { addLink, contradictions, linksFor, removeLink } from "@/lib/work/links";

// Links between tasks, and what they contradict.

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    fromItemId: z.string().trim().min(1).max(80),
    toItemId: z.string().trim().min(1).max(80),
    kind: z.enum(["BLOCKS", "RELATES"])
  }),
  z.object({ action: z.literal("remove"), linkId: z.string().trim().min(1).max(80) })
]);

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const itemId = params.get("item");
  return NextResponse.json({
    links: itemId ? await linksFor(itemId) : [],
    contradictions: params.get("checks") === "1" ? await contradictions() : []
  });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (user.globalRole === "READ_ONLY") {
      return NextResponse.json({ message: "Read-only accounts cannot link tasks." }, { status: 403 });
    }
    const input = schema.parse(await request.json());

    if (input.action === "add") {
      await addLink({ ...input, userId: user.id });
      await recordAuditEvent({
        actorUserId: user.id,
        action: "ITEM_LINKED",
        entityType: "item",
        entityId: input.fromItemId,
        summary: user.fullName + " linked two tasks (" + input.kind.toLowerCase() + ")",
        metadata: { toItemId: input.toItemId, kind: input.kind }
      });
      return NextResponse.json({ links: await linksFor(input.fromItemId), contradictions: await contradictions(), message: "Linked." });
    }

    await removeLink(input.linkId);
    return NextResponse.json({ message: "Unlinked.", contradictions: await contradictions() });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That link was not valid." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "That link could not be saved." }, { status: 500 });
  }
}
