import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { aiSource, preferredProvider, setPreferredProvider } from "@/lib/ai/provider";
import { isVendorProvider } from "@/lib/ai/vendors";
import { listUserConnections } from "@/lib/connections";
import { assertSameOrigin } from "@/lib/security/origin";

// Which AI this member wants the Hub to use. The squadron server is free; their own account is theirs to pay for.

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    const [choice, connections] = await Promise.all([
      preferredProvider(user.id),
      listUserConnections(user.id, user.email)
    ]);
    const connected = connections
      .filter((connection) => connection.status === "CONNECTED" && isVendorProvider(connection.provider))
      .map((connection) => connection.provider);
    return NextResponse.json({
      choice: choice && connected.includes(choice) ? choice : "squadron-server",
      squadronAvailable: aiSource() === "squadron-server",
      connected
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "The AI choice could not be read." }, { status: 500 });
  }
}

const schema = z.object({ choice: z.string().trim().min(1).max(60) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    const { choice } = schema.parse(await request.json());

    if (choice !== "squadron-server") {
      if (!isVendorProvider(choice)) return NextResponse.json({ message: "That is not an AI service the Hub can use." }, { status: 400 });
      const connections = await listUserConnections(user.id, user.email);
      const ready = connections.some((connection) => connection.provider === choice && connection.status === "CONNECTED");
      if (!ready) return NextResponse.json({ message: "Connect that service first, then choose it." }, { status: 400 });
    }

    await setPreferredProvider(user.id, choice);
    return NextResponse.json({ choice, message: choice === "squadron-server" ? "The Hub will use the squadron's own AI." : "Saved. The Hub will use your own account." });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "Choose one of the listed services." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "That choice could not be saved." }, { status: 500 });
  }
}
