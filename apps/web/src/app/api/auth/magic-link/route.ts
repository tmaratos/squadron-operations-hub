import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureBootstrapOwner, findUserByEmail } from "@/lib/auth/repository";
import { issueMagicLink } from "@/lib/auth/magic-link";
import { recordAuditEvent } from "@/lib/db/audit";
import { getRequestIp } from "@/lib/security/crypto";
import { assertSameOrigin } from "@/lib/security/origin";
import { verifyTurnstile } from "@/lib/security/turnstile";

const schema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  turnstileToken: z.string().optional().nullable()
});

export async function POST(request: Request) {
  const genericMessage = "If this address belongs to an approved account, a secure sign-in link has been sent.";
  try {
    assertSameOrigin(request);
    const input = schema.parse(await request.json());
    const ip = getRequestIp(request);
    if (!(await verifyTurnstile(input.turnstileToken ?? undefined, ip))) {
      return NextResponse.json({ message: "Security verification failed. Please try again." }, { status: 400 });
    }

    await ensureBootstrapOwner(input.email);
    const user = await findUserByEmail(input.email);
    if (!user || user.status !== "APPROVED") {
      return NextResponse.json({ message: genericMessage });
    }

    const result = await issueMagicLink(user);
    await recordAuditEvent({
      actorUserId: user.id,
      action: "MAGIC_LINK_REQUESTED",
      entityType: "user",
      entityId: user.id,
      summary: `Secure sign-in link requested for ${user.email}`
    });
    return NextResponse.json({ message: genericMessage, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "Enter a valid email address." }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ message: genericMessage });
  }
}
