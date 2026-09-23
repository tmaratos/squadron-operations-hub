import { NextResponse } from "next/server";
import { createGoogleAuthorizationUrl, GMAIL_READ_SCOPE, GMAIL_SCOPE } from "@/lib/auth/google-oauth";
import { getCurrentUser } from "@/lib/auth/session";

// Adding a Google permission to an account that already exists - today that means Gmail drafting.
// Sign-in itself never asks for this: a member opts in from My connections, and can take it away in Google.

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const wanted = new URL(request.url).searchParams.get("scope");
  const scopes = wanted === "gmail" ? [GMAIL_SCOPE]
    : wanted === "gmail-read" ? [GMAIL_SCOPE, GMAIL_READ_SCOPE]
    : null;
  if (!scopes) return NextResponse.redirect(new URL("/connections?error=unknown_permission", request.url));

  try {
    return NextResponse.redirect(await createGoogleAuthorizationUrl(scopes));
  } catch (error) {
    console.error(error);
    return NextResponse.redirect(new URL("/connections?error=configuration", request.url));
  }
}
