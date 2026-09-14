import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { listIntegrations, setIntegrationStatus, WorkspaceTablesMissingError } from "@/lib/operations/workspaces";
import { assertSameOrigin } from "@/lib/security/origin";

const updateIntegrationSchema = z.object({
  provider: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/),
  status: z.enum(["NOT_CONNECTED", "REQUESTED", "CONNECTED", "DISABLED"]),
  notes: z.string().trim().max(1000).nullable().optional()
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  return NextResponse.json(await listIntegrations());
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });

    const input = updateIntegrationSchema.parse(await request.json());
    const isAdmin = ["SYSTEM_OWNER", "ADMINISTRATOR"].includes(user.globalRole);
    if (!isAdmin && input.status !== "REQUESTED") {
      return NextResponse.json({ message: "Only an administrator can connect or disable integrations. You can request one." }, { status: 403 });
    }
    if (user.globalRole === "READ_ONLY") {
      return NextResponse.json({ message: "Read-only accounts cannot change integrations." }, { status: 403 });
    }

    await setIntegrationStatus({ provider: input.provider, status: input.status, notes: input.notes, userId: user.id });
    await recordAuditEvent({
      actorUserId: user.id,
      action: "INTEGRATION_UPDATED",
      entityType: "integration",
      entityId: input.provider,
      summary: user.fullName + " set integration " + input.provider + " to " + input.status.toLowerCase().replace("_", " "),
      metadata: { provider: input.provider, status: input.status, notes: input.notes ?? null }
    });

    return NextResponse.json({ ...(await listIntegrations()), message: "Integration updated." });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "The integration update was invalid.", issues: error.issues }, { status: 400 });
    }
    if (error instanceof WorkspaceTablesMissingError) {
      return NextResponse.json({ message: error.message }, { status: 503 });
    }
    console.error(error);
    return NextResponse.json({ message: "The integration could not be updated." }, { status: 500 });
  }
}
