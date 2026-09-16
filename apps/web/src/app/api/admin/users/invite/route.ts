import { NextResponse } from "next/server";
import { z } from "zod";
import { findUserByEmail } from "@/lib/auth/repository";
import { getCurrentUser } from "@/lib/auth/session";
import { canApproveAccounts } from "@/lib/auth/types";
import { getDatabase } from "@/lib/cloudflare";
import { recordAuditEvent } from "@/lib/db/audit";
import { assertSameOrigin } from "@/lib/security/origin";

// Adds a member before they have ever signed in, so work can be assigned to them straight away.
// The account waits as PENDING. When that person signs in with the same Google address, the two join up
// automatically (sign-in matches on email), and they keep everything already assigned to them.
const schema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  dutyTitle: z.string().trim().max(120).optional(),
  capid: z.string().trim().max(20).optional(),
  role: z.enum(["ADMINISTRATOR", "STAFF_MEMBER", "READ_ONLY"]).optional()
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await getCurrentUser();
    if (!actor || !canApproveAccounts(actor.globalRole)) {
      return NextResponse.json({ message: "You are not authorized to add members." }, { status: 403 });
    }
    const input = schema.parse(await request.json());
    const email = input.email.toLowerCase();

    const existing = await findUserByEmail(email);
    if (existing) {
      return NextResponse.json({ message: existing.fullName + " is already in the Hub." }, { status: 409 });
    }

    const now = new Date().toISOString();
    await getDatabase()
      .prepare("INSERT INTO users (id, email, full_name, capid, duty_title, status, global_role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)")
      .bind(crypto.randomUUID(), email, input.fullName.trim(), input.capid?.trim() || null, input.dutyTitle?.trim() || null, input.role ?? "STAFF_MEMBER", now, now)
      .run();

    await recordAuditEvent({
      actorUserId: actor.id,
      action: "USER_ADDED",
      entityType: "user",
      entityId: email,
      summary: actor.fullName + " added " + input.fullName + " so work can be assigned before their first sign-in",
      metadata: { email, role: input.role ?? "STAFF_MEMBER" }
    });

    return NextResponse.json({ message: input.fullName + " can now be assigned work. They will get access when they sign in with Google using " + email + "." });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "Enter a full name and a valid email address." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "That member could not be added." }, { status: 500 });
  }
}
