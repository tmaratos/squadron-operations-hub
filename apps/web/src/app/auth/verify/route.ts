import { NextResponse } from "next/server";
import { consumeMagicLink } from "@/lib/auth/magic-link";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { getRequestIp, hashIp } from "@/lib/security/crypto";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) return NextResponse.redirect(new URL("/login?error=invalid", request.url));

  try {
    const user = await consumeMagicLink(token);
    if (!user) return NextResponse.redirect(new URL("/login?error=expired", request.url));

    const session = await createSession({
      userId: user.id,
      userAgent: request.headers.get("user-agent"),
      ipHash: await hashIp(getRequestIp(request))
    });
    await setSessionCookie(session.token, session.expiresAt);
    await recordAuditEvent({
      actorUserId: user.id,
      action: "SIGNED_IN",
      entityType: "session",
      summary: `${user.fullName} signed in with a one-time email link`
    });
    return NextResponse.redirect(new URL("/", request.url));
  } catch (error) {
    console.error(error);
    return NextResponse.redirect(new URL("/login?error=failed", request.url));
  }
}
