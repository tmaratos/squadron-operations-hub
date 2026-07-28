import { NextResponse } from "next/server";
import { createGoogleAuthorizationUrl } from "@/lib/auth/google-oauth";

export async function GET(request: Request) {
  try {
    return NextResponse.redirect(await createGoogleAuthorizationUrl());
  } catch (error) {
    console.error(error);
    return NextResponse.redirect(new URL("/login?error=configuration", request.url));
  }
}
