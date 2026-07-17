import { NextResponse } from "next/server";
import { revokeCurrentSession } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/origin";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await revokeCurrentSession();
    return NextResponse.redirect(new URL("/login", request.url), 303);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Unable to sign out." }, { status: 500 });
  }
}
