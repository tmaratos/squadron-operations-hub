import { NextResponse } from "next/server";
import { createGoogleAuthorizationUrl, GMAIL_READ_SCOPE, GMAIL_SCOPE } from "@/lib/auth/google-oauth";
import { getCurrentUser } from "@/lib/auth/session";

// Attaching Google to an account that already exists: the squadron Drive, and optionally Gmail drafting or
// reading. Members sign in with their own email now, so this is how anybody brings Google in - a member opts
// in from My connections or Documents, and can take it away in Google.

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const wanted = new URL(request.url).searchParams.get("scope");
  const scopes = wanted === "drive" || !wanted ? []
    : wanted === "gmail" ? [GMAIL_SCOPE]
    : wanted === "gmail-read" ? [GMAIL_SCOPE, GMAIL_READ_SCOPE]
    : null;
  if (!scopes) return NextResponse.redirect(new URL("/connections?error=unknown_permission", request.url));

  try {
    return NextResponse.redirect(await createGoogleAuthorizationUrl(scopes, "CONNECT"));
  } catch (error) {
    console.error(error);
    return NextResponse.redirect(new URL("/connections?error=configuration", request.url));
  }
}
