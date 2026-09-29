import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/origin";
import { bookBack, deleteAsset, listAssets, saveAsset, setStatus, signOut } from "@/lib/assets/assets";
import type { GlobalRole } from "@/lib/auth/types";

// Two different permissions, because they are two different things.
//
// Signing a van out is ordinary squadron business and any member who is not read-only can do it - making it an
// administrator's job is how a sign-out sheet stops being filled in. Deciding what the squadron holds, and what
// its inspection dates are, is a property record and belongs to staff.

function mayUse(role: GlobalRole): boolean {
  return role !== "READ_ONLY";
}

function mayManage(role: GlobalRole): boolean {
  return role === "SYSTEM_OWNER" || role === "ADMINISTRATOR" || role === "STAFF_MEMBER";
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    return NextResponse.json({ assets: await listAssets(), canManage: mayManage(user.globalRole) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "That could not be read." }, { status: 500 });
  }
}

const odometer = z.number().int().min(0).max(2_000_000).nullable();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

const schema = z.union([
  z.object({
    action: z.literal("save"),
    id: z.string().max(80).optional(),
    kind: z.enum(["VEHICLE", "AIRCRAFT", "RADIO", "EQUIPMENT"]),
    name: z.string().min(1).max(120),
    identifier: z.string().max(60).nullable(),
    custodianId: z.string().max(80).nullable(),
    assignedOn: day,
    notes: z.string().max(2000).nullable(),
    odometer,
    registrationExpiresOn: day,
    inspectionDueOn: day
  }),
  z.object({ action: z.literal("status"), id: z.string().max(80), status: z.enum(["AVAILABLE", "GROUNDED", "RETURNED"]) }),
  z.object({
    action: z.literal("out"),
    id: z.string().max(80),
    memberId: z.string().max(80),
    purpose: z.string().max(200).nullable(),
    destination: z.string().max(200).nullable(),
    odometerOut: odometer
  }),
  z.object({ action: z.literal("in"), id: z.string().max(80), odometerIn: odometer }),
  z.object({ action: z.literal("delete"), id: z.string().max(80) })
]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (!mayUse(user.globalRole)) {
      return NextResponse.json({ message: "Your account is read-only." }, { status: 403 });
    }

    const input = schema.parse(await request.json());

    if (input.action !== "out" && input.action !== "in" && !mayManage(user.globalRole)) {
      return NextResponse.json({ message: "Only staff can change what the squadron holds." }, { status: 403 });
    }

    const result =
      input.action === "save"
        ? await saveAsset(input)
        : input.action === "status"
          ? await setStatus(input.id, input.status)
          : input.action === "out"
            ? await signOut({
                assetId: input.id,
                memberId: input.memberId,
                purpose: input.purpose,
                destination: input.destination,
                odometerOut: input.odometerOut
              })
            : input.action === "in"
              ? await bookBack({ assetId: input.id, odometerIn: input.odometerIn })
              : await deleteAsset(input.id);

    return NextResponse.json({ ...result, assets: await listAssets() }, { status: result.ok ? 200 : 400 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That change was invalid." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "That change could not be saved." }, { status: 500 });
  }
}
