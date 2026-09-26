import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth/session";
import { isMicrosoftConfigured, microsoftAuthorizeUrl } from "@/lib/microsoft/graph";
import { createRandomToken } from "@/lib/security/crypto";

// Sends somebody to Microsoft to connect a mailbox.
//
// Only ever adds a mailbox. Signing in to the Hub stays with Google, because that is what the squadron's
// Shared Drive and the accounts are built on; this is a read-only mail connection belonging to whoever is
// already signed in, and losing it cannot lock anybody out.

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  if (!isMicrosoftConfigured()) {
    return NextResponse.redirect(new URL("/connections?mail=microsoft_unavailable#mail", request.url));
  }

  // Tied to this browser, so a callback that did not start here is refused.
  const state = createRandomToken(32);
  const store = await cookies();
  store.set("ms_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600
  });

  return NextResponse.redirect(microsoftAuthorizeUrl(state));
}
