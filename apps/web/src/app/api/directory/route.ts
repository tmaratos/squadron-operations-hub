import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { ensurePerson, listDirectory } from "@/lib/org/directory";
import { assertSameOrigin } from "@/lib/security/origin";

// GET  /api/directory?q=smith  — who can be given work, from Hub accounts and Shared Drive access
// POST /api/directory          — make a Shared Drive person assignable (creates their pending account)

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    const query = new URL(request.url).searchParams.get("q") ?? "";
    const result = await listDirectory(user.id, query.slice(0, 120));
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "The directory could not be read." }, { status: 500 });
  }
}

const schema = z.object({
  email: z.string().trim().email().max(200),
  fullName: z.string().trim().min(1).max(120)
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (user.globalRole === "READ_ONLY") {
      return NextResponse.json({ message: "Read-only accounts cannot add people." }, { status: 403 });
    }
    const input = schema.parse(await request.json());
    const { userId, created } = await ensurePerson(input);
    if (created) {
      await recordAuditEvent({
        actorUserId: user.id,
        action: "USER_ADDED",
        entityType: "user",
        entityId: input.email.toLowerCase(),
        summary: user.fullName + " added " + input.fullName + " from Shared Drive access so work could be assigned",
        metadata: { email: input.email.toLowerCase(), source: "directory" }
      });
    }
    return NextResponse.json({ userId, created });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "A name and email address are required." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "That person could not be added." }, { status: 500 });
  }
}
