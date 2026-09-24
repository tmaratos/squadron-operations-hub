import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { assertSameOrigin } from "@/lib/security/origin";
import { createAgent, deleteAgent, getAgent, listAgents, updateAgent } from "@/lib/ai/agents";

// Agents the squadron shares, and the ones a member keeps for themselves.

const ADMIN_ROLES = ["SYSTEM_OWNER", "ADMINISTRATOR"];

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().trim().min(2).max(60),
    purpose: z.string().trim().max(160).optional(),
    brief: z.string().trim().max(4000).optional(),
    emoji: z.string().trim().max(8).optional(),
    shared: z.boolean().default(false),
    scopeType: z.enum(["list", "space"]).nullable().optional(),
    scopeId: z.string().trim().max(80).nullable().optional(),
    schedule: z.enum(["DAILY"]).nullable().optional()
  }),
  z.object({
    action: z.literal("update"),
    id: z.string().trim().min(1).max(80),
    name: z.string().trim().min(2).max(60).optional(),
    purpose: z.string().trim().max(160).nullable().optional(),
    brief: z.string().trim().max(4000).nullable().optional(),
    emoji: z.string().trim().max(8).optional(),
    shared: z.boolean().optional(),
    scopeType: z.enum(["list", "space"]).nullable().optional(),
    scopeId: z.string().trim().max(80).nullable().optional(),
    schedule: z.enum(["DAILY"]).nullable().optional()
  }),
  z.object({ action: z.literal("delete"), id: z.string().trim().min(1).max(80) })
]);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  return NextResponse.json({ agents: await listAgents(user.id, ADMIN_ROLES.includes(user.globalRole)) });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (user.globalRole === "READ_ONLY") {
      return NextResponse.json({ message: "Read-only accounts cannot change agents." }, { status: 403 });
    }
    const input = schema.parse(await request.json());
    const isAdmin = ADMIN_ROLES.includes(user.globalRole);

    if (input.action === "create") {
      const id = await createAgent({ ...input, userId: user.id });
      await recordAuditEvent({
        actorUserId: user.id,
        action: "AGENT_CREATED",
        entityType: "agent",
        entityId: id,
        summary: user.fullName + " created the " + (input.shared ? "shared" : "personal") + " agent " + input.name,
        metadata: { shared: input.shared }
      });
      return NextResponse.json({ agents: await listAgents(user.id, isAdmin), id, message: input.name + " is ready." });
    }

    // Only on your own agent, or a shared one you may change. Nobody edits somebody else's private agent.
    const existing = await getAgent(input.id, user.id, isAdmin);
    if (!existing) return NextResponse.json({ message: "That agent is not there." }, { status: 404 });
    if (!existing.canEdit) {
      return NextResponse.json({ message: existing.name + " is shared with the squadron. Ask an administrator to change it." }, { status: 403 });
    }

    if (input.action === "delete") {
      await deleteAgent(input.id);
      await recordAuditEvent({
        actorUserId: user.id,
        action: "AGENT_DELETED",
        entityType: "agent",
        entityId: input.id,
        summary: user.fullName + " removed the agent " + existing.name,
        metadata: {}
      });
      return NextResponse.json({ agents: await listAgents(user.id, isAdmin), message: existing.name + " is gone. The conversations it held are kept." });
    }

    await updateAgent(input.id, { ...input, userId: user.id });
    await recordAuditEvent({
      actorUserId: user.id,
      action: "AGENT_UPDATED",
      entityType: "agent",
      entityId: input.id,
      summary: user.fullName + " changed the agent " + (input.name ?? existing.name),
      metadata: {}
    });
    return NextResponse.json({ agents: await listAgents(user.id, isAdmin), message: "Saved." });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That agent was not valid." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "That could not be saved." }, { status: 500 });
  }
}
