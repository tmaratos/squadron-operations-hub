import { NextResponse } from "next/server";
import {
  canAccessSharedDrive,
  exchangeGoogleCode,
  getGoogleProfile,
  isVerifiedGoogleProfile,
  storeGoogleTokens
} from "@/lib/auth/google-oauth";
import { upsertGoogleUser } from "@/lib/auth/repository";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { getRequestIp, hashIp } from "@/lib/security/crypto";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.has("error")) return loginRedirect(request, "google_denied");
  if (!code || !state) return loginRedirect(request, "invalid");

  try {
    const tokens = await exchangeGoogleCode(code, state);
    const profile = await getGoogleProfile(tokens.access_token);
    if (!isVerifiedGoogleProfile(profile)) return loginRedirect(request, "unverified");
    if (!(await canAccessSharedDrive(tokens.access_token))) return loginRedirect(request, "drive_access");

    const user = await upsertGoogleUser({ email: profile.email, fullName: profile.name });
    await storeGoogleTokens({
      userId: user.id,
      googleSubject: profile.sub,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      scopes: tokens.scope
    });
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
      summary: `${user.fullName} signed in with Google`
    });
    return NextResponse.redirect(new URL("/", request.url));
  } catch (error) {
    console.error(error);
    return loginRedirect(request, "failed");
  }
}

function loginRedirect(request: Request, error: string): NextResponse {
  const target = new URL("/login", request.url);
  target.searchParams.set("error", error);
  return NextResponse.redirect(target);
}
