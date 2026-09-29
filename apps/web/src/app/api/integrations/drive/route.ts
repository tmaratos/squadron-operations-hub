import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/origin";
import { recordAuditEvent } from "@/lib/db/audit";
import {
  readServiceAccountKey,
  serviceAccountStatus,
  ServiceAccountProblem,
  storeServiceAccountKey
} from "@/lib/storage/service-account";
import { GoogleDriveProvider } from "@/lib/storage/google-drive-provider";
import type { GlobalRole } from "@/lib/auth/types";

// The Hub's own key to the squadron's documents.
//
// Same shape as the CAPWATCH credential: pasted once, never read back, encrypted before it is stored. A
// service account key deserves that care more than most secrets, because it does not expire - a leaked one
// works until somebody revokes it in Google Cloud.

function canManage(role: GlobalRole): boolean {
  return role === "SYSTEM_OWNER" || role === "ADMINISTRATOR";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });

  const status = await serviceAccountStatus();
  const mayManage = canManage(user.globalRole);

  return NextResponse.json({
    mayManage,
    // The client email is not secret - an administrator has to be able to read it to grant it access to the
    // shared drive, and it is the one thing they need to copy out of here.
    status: mayManage ? status : { configured: status.configured, clientEmail: null, projectId: null, updatedAt: null }
  });
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), key: z.string().min(50).max(20_000) }),
  z.object({ action: z.literal("check") })
]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (!canManage(user.globalRole)) {
      return NextResponse.json({ message: "You cannot manage document storage." }, { status: 403 });
    }

    const input = schema.parse(await request.json());

    if (input.action === "check") {
      const result = await new GoogleDriveProvider().check();
      await recordAuditEvent({
        actorUserId: user.id,
        action: result.ok ? "DRIVE_SERVICE_ACCOUNT_CHECK_OK" : "DRIVE_SERVICE_ACCOUNT_CHECK_FAILED",
        entityType: "integration",
        entityId: "google-drive",
        summary: user.fullName + " tested the Hub's Google Drive access",
        metadata: { ok: result.ok }
      });
      return NextResponse.json({ ...result, status: await serviceAccountStatus() }, { status: result.ok ? 200 : 400 });
    }

    let key;
    try {
      key = readServiceAccountKey(input.key);
    } catch (error) {
      // The pasted file was the wrong thing. Nothing is stored, and the reason names the actual mistake.
      return NextResponse.json(
        { message: error instanceof ServiceAccountProblem ? error.message : "That key could not be read." },
        { status: 400 }
      );
    }

    await storeServiceAccountKey({ key, raw: input.key, actorId: user.id });
    await recordAuditEvent({
      actorUserId: user.id,
      action: "DRIVE_SERVICE_ACCOUNT_SAVED",
      entityType: "integration",
      entityId: "google-drive",
      summary: user.fullName + " saved a Google service account key for document storage",
      // Identifiers only. The key itself is never written to an audit entry.
      metadata: { clientEmail: key.client_email, projectId: key.project_id ?? null }
    });

    // Tested straight after saving, because the answer people actually want is whether it reaches the drive
    // - and the likely failure is one nobody can fix from here: the account not yet being a drive member.
    const check = await new GoogleDriveProvider().check();

    return NextResponse.json({
      ok: true,
      message: check.ok
        ? "Key saved. " + check.message
        : "Key saved, but the Hub cannot reach the shared drive yet. " + check.message,
      driveReachable: check.ok,
      status: await serviceAccountStatus()
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "That request was invalid." }, { status: 400 });
    }
    // Logged without the body, which is the only place the key could otherwise surface.
    console.error("Drive settings request failed");
    return NextResponse.json({ message: "That could not be done." }, { status: 500 });
  }
}
