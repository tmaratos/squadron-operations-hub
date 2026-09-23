import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { listDocuments, readOneDocument, refreshLibrary } from "@/lib/regs/library";
import { assertSameOrigin } from "@/lib/security/origin";

// The squadron's documents, and what the Hub has made of them.
//
// Reading one regulation with a small model on squadron hardware takes minutes - far longer than a browser
// will hold a request open, and the earlier version was cancelled halfway through by the browser giving up.
// So a read is started and the request returns at once; the work carries on in the background and the page
// follows along by asking for the list again.

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  return NextResponse.json({ documents: await listDocuments() });
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("refresh") }),
  z.object({ action: z.literal("read"), id: z.string().trim().min(1).max(80) })
]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (user.globalRole === "READ_ONLY") return NextResponse.json({ message: "Read-only accounts cannot do this." }, { status: 403 });
    const input = schema.parse(await request.json());

    if (input.action === "refresh") {
      const result = await refreshLibrary(user.id);
      return NextResponse.json({
        documents: await listDocuments(),
        message: result.added
          ? result.added + " document" + (result.added === 1 ? "" : "s") + " to read, out of " + result.found + " in the Drive."
          : "Nothing new. All " + result.found + " documents have been read."
      });
    }

    const actor = { id: user.id, fullName: user.fullName };
    const work = readOneDocument(actor.id, input.id)
      .then(async (result) => {
        if (!result.duties) return;
        await recordAuditEvent({
          actorUserId: actor.id,
          action: "REG_DOCUMENT_READ",
          entityType: "document",
          entityId: input.id,
          summary: actor.fullName + " had the Hub read " + result.name + ", which proposed " + result.duties + " duties for checking",
          metadata: { duties: result.duties }
        });
      })
      .catch((error) => console.error(error));

    // Keeps the worker alive for the reading after the response has gone back.
    getCloudflareContext().ctx.waitUntil(work);

    return NextResponse.json({
      documents: await listDocuments(),
      started: true,
      message: "Reading it now. This takes a few minutes on the squadron's own server — the list updates by itself."
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That request was invalid." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "That could not be done." }, { status: 500 });
  }
}
