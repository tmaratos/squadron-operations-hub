import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/origin";
import {
  canManageAccess,
  grantAccess,
  listMembers,
  restrictAccess,
  setLoginEmail,
  type AccessStatus
} from "@/lib/members/access";

// Managing who may use the Hub.
//
// Every check here is on the server. The page hides controls a member has no business pressing, but hiding
// is presentation - it is this file that decides, and it decides again on every request rather than trusting
// anything the browser says about who is asking.

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  if (!canManageAccess(user.globalRole)) {
    return NextResponse.json({ message: "You cannot manage member access." }, { status: 403 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const members = await listMembers({
    search: url.searchParams.get("search") ?? undefined,
    status: status === "AUTHORIZED" || status === "RESTRICTED" || status === "NOT_CONFIGURED"
      ? (status as AccessStatus)
      : undefined,
    missingLoginEmail: url.searchParams.get("missingEmail") === "1",
    capMembership: url.searchParams.get("cap") === "ACTIVE" ? "ACTIVE"
      : url.searchParams.get("cap") === "INACTIVE" ? "INACTIVE" : undefined,
    memberType: url.searchParams.get("type") === "CADET" ? "CADET"
      : url.searchParams.get("type") === "SENIOR" ? "SENIOR" : undefined
  });

  return NextResponse.json({ members });
}

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("login_email"),
    capid: z.string().trim().min(1).max(20),
    email: z.string().trim().max(200).nullable()
  }),
  z.object({ action: z.literal("grant"), capid: z.string().trim().min(1).max(20) }),
  z.object({
    action: z.literal("restrict"),
    capid: z.string().trim().min(1).max(20),
    reason: z.string().trim().max(300).optional()
  })
]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (!canManageAccess(user.globalRole)) {
      return NextResponse.json({ message: "You cannot manage member access." }, { status: 403 });
    }

    const input = schema.parse(await request.json());
    const actor = { actorId: user.id, actorName: user.fullName };

    const result = input.action === "login_email"
      ? await setLoginEmail({ capid: input.capid, email: input.email, ...actor })
      : input.action === "grant"
        ? await grantAccess({ capid: input.capid, ...actor })
        : await restrictAccess({ capid: input.capid, reason: input.reason ?? null, ...actor });

    return NextResponse.json(
      { ...result, members: await listMembers() },
      { status: result.ok ? 200 : 400 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "That request was invalid." }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ message: "That could not be done." }, { status: 500 });
  }
}
