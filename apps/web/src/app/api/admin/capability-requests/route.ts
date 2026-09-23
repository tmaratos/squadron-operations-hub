import { NextResponse } from "next/server";
import { z } from "zod";
import { listCapabilityRequests, reviewCapabilityRequest } from "@/lib/ai/capability-requests";
import { getCurrentUser } from "@/lib/auth/session";
import { canApproveAccounts } from "@/lib/auth/types";
import { recordAuditEvent } from "@/lib/db/audit";
import { assertSameOrigin } from "@/lib/security/origin";

export async function GET(request: Request) {
  const actor = await getCurrentUser();
  if (!actor || !canApproveAccounts(actor.globalRole)) return NextResponse.json({ message: "Administrators only." }, { status: 403 });
  const includeClosed = new URL(request.url).searchParams.get("all") === "1";
  return NextResponse.json({ requests: await listCapabilityRequests(includeClosed) });
}

const schema = z.object({
  id: z.string().trim().min(1).max(80),
  status: z.enum(["OPEN", "PLANNED", "BUILT", "DECLINED"]),
  note: z.string().trim().max(1000).optional()
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getCurrentUser();
    if (!actor || !canApproveAccounts(actor.globalRole)) return NextResponse.json({ message: "Administrators only." }, { status: 403 });
    const input = schema.parse(await request.json());
    await reviewCapabilityRequest({ ...input, reviewerId: actor.id });
    await recordAuditEvent({
      actorUserId: actor.id,
      action: "CAPABILITY_REQUEST_REVIEWED",
      entityType: "capability_request",
      entityId: input.id,
      summary: actor.fullName + " marked a request as " + input.status.toLowerCase(),
      metadata: { status: input.status }
    });
    return NextResponse.json({ requests: await listCapabilityRequests(true), message: "Saved." });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That change was invalid." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "That change could not be saved." }, { status: 500 });
  }
}
