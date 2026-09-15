import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { disconnectConnection, findProvider, listUserConnections, PROVIDERS, recheckConnection, saveApiKeyConnection } from "@/lib/connections";
import { recordAuditEvent } from "@/lib/db/audit";
import { assertSameOrigin } from "@/lib/security/origin";

const provider = z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/);

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), provider, apiKey: z.string().trim().min(8).max(500), baseUrl: z.string().trim().max(300).nullable().optional() }),
  z.object({ action: z.literal("test"), provider }),
  z.object({ action: z.literal("disconnect"), provider })
]);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  return NextResponse.json({ providers: PROVIDERS, connections: await listUserConnections(user.id, user.email) });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    const input = requestSchema.parse(await request.json());
    const definition = findProvider(input.provider);
    if (!definition) return NextResponse.json({ message: "Unknown service." }, { status: 400 });

    let result: { ok: boolean; message: string } = { ok: true, message: "Done." };
    if (input.action === "save") {
      result = await saveApiKeyConnection({ userId: user.id, providerId: definition.id, apiKey: input.apiKey, baseUrl: input.baseUrl });
    } else if (input.action === "test") {
      result = await recheckConnection(user.id, definition.id);
    } else {
      await disconnectConnection(user.id, definition.id);
      result = { ok: true, message: definition.name + " is disconnected." };
    }

    if (input.action !== "test" && (result.ok || input.action === "disconnect")) {
      await recordAuditEvent({
        actorUserId: user.id,
        action: input.action === "save" ? "CONNECTION_ADDED" : "CONNECTION_REMOVED",
        entityType: "connection",
        entityId: definition.id,
        summary: user.fullName + (input.action === "save" ? " connected " : " disconnected ") + definition.name,
        metadata: { provider: definition.id }
      });
    }

    return NextResponse.json(
      { ...result, connections: await listUserConnections(user.id, user.email) },
      { status: result.ok ? 200 : 422 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ ok: false, message: "Please check what you entered and try again." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ ok: false, message: "Something went wrong saving that. Try again, or ask your administrator." }, { status: 500 });
  }
}
