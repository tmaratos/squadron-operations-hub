import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/origin";
import { markRead, messagesFor, runDueAgents, unreadByAgent } from "@/lib/ai/agent-runs";

// What the agents have said on their own, and running the ones that are due.
//
// A run only ever writes messages. It never creates, assigns, moves or deletes work, which is the whole
// reason it is safe to leave running unattended.

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  const agentId = new URL(request.url).searchParams.get("agent");
  return NextResponse.json({
    unread: await unreadByAgent(user.id),
    messages: agentId ? await messagesFor(user.id, agentId) : []
  });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as { action?: string; agentId?: string };

    if (body.action === "read" && body.agentId) {
      await markRead(user.id, body.agentId);
      return NextResponse.json({ unread: await unreadByAgent(user.id) });
    }

    const result = await runDueAgents();
    return NextResponse.json({ ...result, unread: await unreadByAgent(user.id) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "The agents could not be run." }, { status: 500 });
  }
}
