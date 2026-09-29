import { NextResponse } from "next/server";
import { accessConfigured, AccessNotVerified, identityFromRequest } from "@/lib/auth/cloudflare-access";
import { accessForEmail } from "@/lib/members/access";

// Proving the new identity path without standing in front of the old one.
//
// This answers the two questions separately and shows both answers: who Cloudflare says this is, and what
// the Hub would decide about them. It changes nothing - no session is created, no cookie set, nobody is let
// in or kept out. It exists so the replacement can be demonstrated against a real account before it is put
// anywhere near the door that nine people currently use.
//
// Deliberately readable without being signed in, because the whole point is to test it before Google sign-in
// is involved. It discloses only what Access already asserted about the caller and whether that address is
// authorised - the caller's own facts, which they could learn by trying to log in anyway.

export async function GET(request: Request) {
  if (!accessConfigured()) {
    return NextResponse.json({
      accessConfigured: false,
      verdict: "Cloudflare Access is not configured for this Hub yet.",
      // Said plainly so a test that returns nothing is not mistaken for a test that failed.
      note: "Set CF_ACCESS_TEAM_DOMAIN to switch this on. Until then the Hub is reached through Google sign-in only."
    });
  }

  let identity = null;
  let problem: string | null = null;
  try {
    identity = await identityFromRequest(request);
  } catch (error) {
    problem = error instanceof AccessNotVerified ? error.message : "The Access token could not be checked.";
  }

  if (problem) {
    // A token that is present and bad is the interesting failure, and it is reported as a refusal rather
    // than as an absence.
    return NextResponse.json({ accessConfigured: true, verified: false, problem }, { status: 400 });
  }

  if (!identity) {
    return NextResponse.json({
      accessConfigured: true,
      verified: false,
      problem: "This request did not come through Cloudflare Access, so it carries no identity token.",
      note: "Expected until an Access application is placed in front of this path."
    });
  }

  const decision = await accessForEmail(identity.email);

  return NextResponse.json({
    accessConfigured: true,
    verified: true,
    cloudflareSays: {
      email: identity.email,
      subject: identity.subject,
      audience: identity.audience,
      expiresAt: identity.expiresAt.toISOString()
    },
    hubSays: decision
      ? { capid: decision.capid, status: decision.status, hasAccount: Boolean(decision.userId) }
      : { capid: null, status: "UNKNOWN", hasAccount: false },
    // The two answers combined, which is what the real check will do once this is trusted.
    wouldBeAdmitted: decision?.status === "AUTHORIZED",
    why: !decision
      ? "Cloudflare knows this address but the Hub has no member with it as their login address."
      : decision.status === "AUTHORIZED"
        ? "Authorised by an administrator."
        : decision.status === "RESTRICTED"
          ? "An administrator has restricted this member, so the Hub refuses regardless of Cloudflare."
          : "No administrator has granted this member access yet."
  });
}
