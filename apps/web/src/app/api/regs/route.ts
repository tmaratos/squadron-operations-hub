import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { listDocuments, readOneDocument, refreshLibrary } from "@/lib/regs/library";
import { assertSameOrigin } from "@/lib/security/origin";

// The squadron's documents, and what the Hub has made of them.
// Reading is done one document at a time, on purpose: a request that reads forty PDFs would time out, and
// a member watching a list tick over knows more about what is happening than a spinner does.

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

    const result = await readOneDocument(user.id, input.id);
    if (result.duties) {
      await recordAuditEvent({
        actorUserId: user.id,
        action: "REG_DOCUMENT_READ",
        entityType: "document",
        entityId: input.id,
        summary: user.fullName + " had the Hub read " + result.name + ", which proposed " + result.duties + " duties for checking",
        metadata: { duties: result.duties }
      });
    }
    return NextResponse.json({ documents: await listDocuments(), message: result.message, duties: result.duties });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That request was invalid." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "That could not be done." }, { status: 500 });
  }
}
