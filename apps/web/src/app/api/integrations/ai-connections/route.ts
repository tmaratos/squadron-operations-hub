import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/origin";
import { createMcpToken, listMyMcpTokens, revokeMyMcpToken } from "@/lib/integrations/mcp-access";
import { recordAuditEvent } from "@/lib/db/audit";

const securityHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const createSchema = z.object({ label: z.string().trim().min(2).max(50) });
const revokeSchema = z.object({ id: z.string().uuid() });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Sign in to manage your AI connections." }, { status: 401, headers: securityHeaders });
  return NextResponse.json({ connections: await listMyMcpTokens(user.id) }, { headers: securityHeaders });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401, headers: securityHeaders });
    const input = createSchema.parse(await request.json());
    const result = await createMcpToken(user, input.label);
    await recordAuditEvent({
      actorUserId: user.id, action: "MCP_CONNECTION_CREATED", entityType: "mcp_connection",
      entityId: result.id, summary: user.fullName + " created a read-only AI connection", metadata: { label: result.label }
    });
    return NextResponse.json({
      id: result.id, token: result.token, expiresAt: result.expiresAt,
      message: "Copy this connection key now. It will never be displayed again."
    }, { status: 201, headers: securityHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "Enter a connection name between 2 and 50 characters." }, { status: 400, headers: securityHeaders });
    if (error instanceof Error && /maximum five active keys/.test(error.message)) {
      return NextResponse.json({ message: error.message }, { status: 409, headers: securityHeaders });
    }
    console.error("MCP token creation failed");
    return NextResponse.json({ message: "Could not create that connection." }, { status: 500, headers: securityHeaders });
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401, headers: securityHeaders });
    const { id } = revokeSchema.parse(await request.json());
    const revoked = await revokeMyMcpToken(user.id, id);
    if (revoked) await recordAuditEvent({
      actorUserId: user.id, action: "MCP_CONNECTION_REVOKED", entityType: "mcp_connection",
      entityId: id, summary: user.fullName + " revoked an AI connection", metadata: {}
    });
    return NextResponse.json({ revoked }, { headers: securityHeaders });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "Invalid connection identifier." }, { status: 400, headers: securityHeaders });
    console.error("MCP token revocation failed");
    return NextResponse.json({ message: "Could not revoke the connection." }, { status: 500, headers: securityHeaders });
  }
}
