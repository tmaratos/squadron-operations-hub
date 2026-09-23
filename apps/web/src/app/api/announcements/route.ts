import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { listAnnouncements, sendAnnouncement } from "@/lib/notify/announcements";
import { assertSameOrigin } from "@/lib/security/origin";

// Sending an alert to named members. Staff only: read-only accounts cannot, and it is always audited,
// because a message going out to the squadron under the Hub's name is somebody's responsibility.

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  return NextResponse.json({ announcements: await listAnnouncements() });
}

const schema = z.object({
  userIds: z.array(z.string().trim().min(1).max(80)).min(1).max(300),
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(3).max(5000),
  urgent: z.boolean().default(false)
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (user.globalRole === "READ_ONLY") return NextResponse.json({ message: "Read-only accounts cannot send alerts." }, { status: 403 });

    const input = schema.parse(await request.json());
    const result = await sendAnnouncement({ ...input, actor: { id: user.id, fullName: user.fullName } });

    await recordAuditEvent({
      actorUserId: user.id,
      action: "ANNOUNCEMENT_SENT",
      entityType: "announcement",
      entityId: input.subject.slice(0, 80),
      summary: user.fullName + " sent an alert to " + result.sent + " member" + (result.sent === 1 ? "" : "s") + ": " + input.subject,
      metadata: { recipients: result.sent, emailed: result.emailed, urgent: input.urgent }
    });

    const message = input.urgent
      ? "Sent to " + result.sent + " member" + (result.sent === 1 ? "" : "s") + ", emailed " + result.emailed + " straight away." +
        (result.failures.length ? " Email failed for " + result.failures.join(", ") + ", but they can see it in the Hub." : "")
      : "Sent to " + result.sent + " member" + (result.sent === 1 ? "" : "s") + ". It is in the Hub now and rides along with their next daily email.";

    return NextResponse.json({ ...result, message });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "Choose at least one person and write a subject and a message." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "That alert could not be sent." }, { status: 500 });
  }
}
