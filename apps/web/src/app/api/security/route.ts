import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { summariseControls } from "@/lib/security/attestation";

// What the Hub can prove about its own security controls, on demand.
//
// Restricted to the people who would have to answer for it. The evidence names counts of accounts, sessions
// and stored credentials, which is not something every member needs to read.

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  if (!["SYSTEM_OWNER", "ADMINISTRATOR"].includes(user.globalRole)) {
    return NextResponse.json({ message: "Only a system owner or administrator may see this." }, { status: 403 });
  }
  return NextResponse.json(await summariseControls());
}
