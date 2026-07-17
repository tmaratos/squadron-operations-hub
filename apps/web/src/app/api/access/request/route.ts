import { NextResponse } from "next/server";
import { z } from "zod";
import { createAccessRequest, countRecentAccessRequests, findUserByEmail } from "@/lib/auth/repository";
import { sendAccessRequestNotification } from "@/lib/email/mailgun";
import { recordAuditEvent } from "@/lib/db/audit";
import { getRequestIp } from "@/lib/security/crypto";
import { assertSameOrigin } from "@/lib/security/origin";
import { verifyTurnstile } from "@/lib/security/turnstile";

const schema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  capid: z.string().trim().max(12).optional().or(z.literal("")),
  dutyTitle: z.string().trim().max(120).optional().or(z.literal("")),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
  turnstileToken: z.string().optional().nullable()
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = schema.parse(await request.json());
    const ip = getRequestIp(request);
    if (!(await verifyTurnstile(input.turnstileToken ?? undefined, ip))) {
      return NextResponse.json({ message: "Security verification failed. Please try again." }, { status: 400 });
    }

    const genericMessage = "Your request was submitted for review. An account approver will verify it before access is enabled.";
    const existingUser = await findUserByEmail(input.email);
    if (existingUser?.status === "APPROVED") {
      return NextResponse.json({ message: genericMessage });
    }

    if ((await countRecentAccessRequests(input.email)) >= 3) {
      return NextResponse.json({ message: genericMessage });
    }

    const requestId = await createAccessRequest(input);
    await recordAuditEvent({
      action: "ACCESS_REQUEST_CREATED",
      entityType: "access_request",
      entityId: requestId,
      summary: `Access requested by ${input.fullName}`,
      metadata: { email: input.email, capid: input.capid || null }
    });
    await sendAccessRequestNotification({
      applicantName: input.fullName,
      applicantEmail: input.email,
      capid: input.capid || undefined,
      dutyTitle: input.dutyTitle || undefined
    });

    return NextResponse.json({ message: genericMessage });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "Please review the information and try again." }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ message: "The request could not be submitted right now." }, { status: 500 });
  }
}
