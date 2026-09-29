import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/origin";
import { capwatchStatus, replaceCredential, testStoredCredential } from "@/lib/capwatch/capwatch";
import type { GlobalRole } from "@/lib/auth/types";

// The CAPWATCH integration, as the responsible member manages it.
//
// Two levels of access on purpose. Anybody who can see the integrations page may see whether CAPWATCH is
// working and when it last ran, because a stale member directory is everybody's problem. Only the people who
// hold the credential may touch it, because it is the authorised member's live eServices password - not a
// scoped key - and it opens far more than this application.
//
// Nothing here ever returns the password. There is no endpoint that reads it, encrypted or otherwise; the
// only thing the browser is ever told is whether one exists.

/** Health is visible to any signed-in member: the roster going stale affects everyone. */
function canSeeHealth(): boolean {
  return true;
}

/** The credential is not. This is the high-sensitivity permission. */
function canManageCredential(role: GlobalRole): boolean {
  return role === "SYSTEM_OWNER" || role === "ADMINISTRATOR";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  if (!canSeeHealth()) return NextResponse.json({ message: "Not permitted." }, { status: 403 });

  const status = await capwatchStatus();
  const mayManage = canManageCredential(user.globalRole);

  // A member who cannot manage the credential is told whether it is working, and nothing about it.
  return NextResponse.json({
    mayManage,
    status: mayManage ? status : {
      configured: status.configured,
      capid: null,
      orgId: status.orgId,
      unitOnly: status.unitOnly,
      credentialUpdatedAt: null,
      lastAuthOkAt: status.lastAuthOkAt,
      lastSync: status.lastSync
        ? { ...status.lastSync, message: status.lastSync.status === "OK" ? status.lastSync.message : null }
        : null
    }
  });
}

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    capid: z.string().trim().regex(/^\d{5,8}$/, "A CAPID is five to eight digits."),
    // Sent once, never stored by the browser, never returned by this endpoint.
    password: z.string().min(1).max(200),
    orgId: z.string().trim().regex(/^\d{1,8}$/).optional(),
    unitOnly: z.boolean().optional()
  }),
  z.object({ action: z.literal("test") })
]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (!canManageCredential(user.globalRole)) {
      return NextResponse.json({ message: "You cannot manage the CAPWATCH credential." }, { status: 403 });
    }

    const input = schema.parse(await request.json());

    if (input.action === "test") {
      const result = await testStoredCredential({ actorId: user.id, actorName: user.fullName });
      return NextResponse.json({ ...result, status: await capwatchStatus() }, { status: result.ok ? 200 : 400 });
    }

    const result = await replaceCredential({
      capid: input.capid,
      password: input.password,
      orgId: input.orgId,
      unitOnly: input.unitOnly,
      actorId: user.id,
      actorName: user.fullName
    });

    // The response carries the outcome and the new health, and never any part of what was submitted.
    return NextResponse.json(
      { ok: result.ok, message: result.message, status: await capwatchStatus() },
      { status: result.ok ? 200 : 400 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: error.issues[0]?.message ?? "That request was invalid." }, { status: 400 });
    }
    // Errors are logged without the request body, which is the one place a password could otherwise surface.
    console.error("CAPWATCH settings request failed");
    return NextResponse.json({ message: "That could not be done." }, { status: 500 });
  }
}
