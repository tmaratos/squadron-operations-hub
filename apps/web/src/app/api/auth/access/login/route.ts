import { NextResponse } from "next/server";
import { AccessNotVerified, accessConfigured, identityFromRequest } from "@/lib/auth/cloudflare-access";
import { accessForEmail } from "@/lib/members/access";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { getDatabase } from "@/lib/cloudflare";
import { recordAuditEvent } from "@/lib/db/audit";

// Signing in with a personal address, through Cloudflare Access.
//
// The second door, standing beside the Google one rather than replacing it. Cloudflare has already checked
// who this is by the time the request arrives - that is what the Access application in front of this path
// does - and this route asks the only remaining question: has an administrator said this person may use the
// Hub?
//
// Both answers are required. A verified identity with no authorisation is refused, which is the property
// that makes the whole arrangement worth having: someone can hold a perfectly good Cloudflare session and
// still be kept out the moment an administrator restricts them, without anybody touching Cloudflare.

function back(request: Request, reason: string): NextResponse {
  return NextResponse.redirect(new URL("/login?error=" + reason, request.url));
}

export async function GET(request: Request) {
  if (!accessConfigured()) return back(request, "access_not_configured");

  let identity;
  try {
    identity = await identityFromRequest(request);
  } catch (error) {
    // A token that is present and untrustworthy is a refusal, never a shrug.
    console.error("Access token rejected:", error instanceof AccessNotVerified ? error.message : "unknown");
    return back(request, "access_token_invalid");
  }

  // No token means the request did not come through Access at all - usually the application in front of
  // this path is missing, which is a configuration fault rather than the member doing anything wrong.
  if (!identity) return back(request, "access_no_token");

  const decision = await accessForEmail(identity.email);
  if (!decision) return back(request, "access_unknown_member");
  if (decision.status !== "AUTHORIZED") {
    await recordAuditEvent({
      action: "ACCESS_LOGIN_REFUSED",
      entityType: "member",
      entityId: decision.capid,
      summary: "A sign-in through Cloudflare Access was refused for CAPID " + decision.capid,
      metadata: { email: identity.email, status: decision.status }
    });
    return back(request, decision.status === "RESTRICTED" ? "access_restricted" : "access_not_granted");
  }

  // The member is authorised but has never had an account row, so there is nothing to hold their work
  // against. Rather than invent one here, this is reported: creating accounts is an administrator's act.
  if (!decision.userId) return back(request, "access_no_account");

  const db = getDatabase();
  const user = await db
    .prepare("SELECT id, status FROM users WHERE id = ?")
    .bind(decision.userId)
    .first<{ id: string; status: string }>();

  // Suspended in the Hub's own user table is a third refusal, independent of the other two. Three separate
  // places can say no, and any one of them is enough.
  if (!user || user.status === "SUSPENDED" || user.status === "ARCHIVED" || user.status === "REJECTED") {
    return back(request, "access_account_closed");
  }

  const session = await createSession({
    userId: user.id,
    userAgent: request.headers.get("user-agent")
  });
  await setSessionCookie(session.token, session.expiresAt);

  await db
    .prepare("UPDATE member_access SET updated_at = ? WHERE capid = ?")
    .bind(new Date().toISOString(), decision.capid)
    .run();

  await recordAuditEvent({
    actorUserId: user.id,
    action: "ACCESS_LOGIN",
    entityType: "member",
    entityId: decision.capid,
    summary: "Signed in through Cloudflare Access with a personal address",
    metadata: { email: identity.email, capid: decision.capid }
  });

  return NextResponse.redirect(new URL("/", request.url));
}
