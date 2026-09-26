import { NextResponse } from "next/server";
import { createGoogleAuthorizationUrl } from "@/lib/auth/google-oauth";

export async function GET(request: Request) {
  try {
    // Adding a mailbox asks for the same Gmail reading permission, but on whichever account the member
    // picks at Google - and the callback is told which of the two this round trip is, so an added mailbox
    // can never be mistaken for a sign-in and swap the account somebody is using.
    const adding = new URL(request.url).searchParams.get("add") === "mailbox";
    if (adding) {
      return NextResponse.redirect(
        await createGoogleAuthorizationUrl(["https://www.googleapis.com/auth/gmail.readonly"], "ADD_MAILBOX")
      );
    }
    return NextResponse.redirect(await createGoogleAuthorizationUrl());
  } catch (error) {
    console.error(error);
    return NextResponse.redirect(new URL("/login?error=configuration", request.url));
  }
}
