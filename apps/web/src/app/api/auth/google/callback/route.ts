import { NextResponse } from "next/server";
import {
  canAccessSharedDrive,
  exchangeGoogleCode,
  getGoogleProfile,
  isVerifiedGoogleProfile,
  oauthPurpose,
  storeGoogleTokens
} from "@/lib/auth/google-oauth";
import { ensureOwnership, upsertGoogleUser } from "@/lib/auth/repository";
import { createSession, getCurrentUser, setSessionCookie } from "@/lib/auth/session";
import { saveMailAccount } from "@/lib/google/mail-accounts";
import { recordAuditEvent } from "@/lib/db/audit";
import { getRequestIp, hashIp } from "@/lib/security/crypto";
import { getDatabase } from "@/lib/cloudflare";
import { mayEnter } from "@/lib/members/access";

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

    // Adding a second mailbox, not signing in. Nothing about the current session changes: this is a
    // read-only mail connection belonging to whoever is already signed in, and it is stored somewhere else
    // entirely so that removing it can never affect how they get in.
    if ((await oauthPurpose()) === "ADD_MAILBOX") {
      const signedIn = await getCurrentUser();
      if (!signedIn) return loginRedirect(request, "invalid");
      await saveMailAccount({
        userId: signedIn.id,
        email: profile.email,
        googleSubject: profile.sub,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in,
        scopes: tokens.scope
      });
      await recordAuditEvent({
        actorUserId: signedIn.id,
        action: "MAILBOX_ADDED",
        entityType: "user",
        entityId: signedIn.id,
        summary: signedIn.fullName + " connected the mailbox " + profile.email + " for reading",
        metadata: { email: profile.email }
      });
      return NextResponse.redirect(new URL("/connections#mail", request.url));
    }
    // Either door: on the squadron's Shared Drive, or holding a CAP address. The Drive is asked either
    // way, because the answer decides what somebody may do once inside and not only whether they get in.
    if ((await oauthPurpose()) === "CONNECT") {
      // Attaching Google to the member who is already signed in. Their Google address may be nothing like the
      // one they signed in with - a personal Gmail holding the squadron Drive is common - and that is fine:
      // this is their account now, and it is never used to decide who they are.
      const signedIn = await getCurrentUser();
      if (!signedIn) return loginRedirect(request, "invalid");
      try {
        await storeGoogleTokens({
          userId: signedIn.id,
          googleSubject: profile.sub,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresIn: tokens.expires_in,
          scopes: tokens.scope
        });
      } catch (error) {
        // One Google account belongs to one member. Taking it over silently would leave the other member's
        // Drive and Gmail pointing at the wrong person.
        console.error(error);
        return NextResponse.redirect(new URL("/connections?error=google_in_use#files", request.url));
      }
      const driveAccess = await canAccessSharedDrive(tokens.access_token).catch(() => false);
      // Reaching the squadron Drive was always what let a member change things. An account the Hub itself
      // limited to reading is lifted once its Drive is connected; one an administrator set stays as set.
      if (driveAccess && signedIn.globalRole === "READ_ONLY") {
        await getDatabase()
          .prepare("UPDATE users SET global_role = 'STAFF_MEMBER', access_basis = 'DRIVE', updated_at = ? WHERE id = ? AND access_basis = 'DOMAIN'")
          .bind(new Date().toISOString(), signedIn.id)
          .run();
      }
      await recordAuditEvent({
        actorUserId: signedIn.id,
        action: "GOOGLE_CONNECTED",
        entityType: "user",
        entityId: signedIn.id,
        summary: signedIn.fullName + " connected the Google account " + profile.email,
        metadata: { email: profile.email, sharedDrive: driveAccess }
      });
      return NextResponse.redirect(new URL(driveAccess ? "/documents" : "/connections?notice=no_drive#files", request.url));
    }
    const driveAccess = await canAccessSharedDrive(tokens.access_token);
    // Google lets a member in if their account can open the squadron Shared Drive, or if an administrator has
    // let that address in on the Member access page - the same rule as signing in with an email. It used to
    // admit any @cap.gov Google account read-only; the Shared Drive check on every request then turned them
    // away, and with that check gone a CAP member from anywhere could have read the squadron's records.
    if (!driveAccess && !(await mayEnter(profile.email))) {
      return loginRedirect(request, "drive_access");
    }

    const user = await upsertGoogleUser({ email: profile.email, fullName: profile.name, driveAccess });
    // Somebody has to be able to reach the admin pages, or the Hub cannot be administered at all.
    const ownership = await ensureOwnership(user.id, user.email);
    if (ownership) {
      await recordAuditEvent({
        actorUserId: user.id,
        action: "OWNER_GRANTED",
        entityType: "user",
        entityId: user.id,
        summary: user.fullName + (ownership === "CONFIGURED"
          ? " was made a system owner because their address is configured as one"
          : " became the first system owner, because the Hub had none"),
        metadata: { reason: ownership, email: user.email }
      });
    }
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
