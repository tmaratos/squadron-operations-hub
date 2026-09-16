import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { getEmailIntake, rotateEmailIntake } from "@/lib/email-intake";
import { assertSameOrigin } from "@/lib/security/origin";

// GET returns the member's own forwarding address. POST issues a new one, which stops the old one working.

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    return NextResponse.json(await getEmailIntake(user.id));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Your email address could not be read." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    const issued = await rotateEmailIntake(user.id);
    await recordAuditEvent({
      actorUserId: user.id,
      action: "EMAIL_INTAKE_ROTATED",
      entityType: "user",
      entityId: user.id,
      summary: user.fullName + " issued a new email-to-task address, retiring the previous one",
      metadata: {}
    });
    return NextResponse.json({ ...issued, message: "New address ready. The old one no longer works." });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "A new address could not be issued." }, { status: 500 });
  }
}
