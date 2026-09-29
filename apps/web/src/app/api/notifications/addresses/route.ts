import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/origin";
import { confirmAddress, listAddresses, removeAddress, setNotify, startAdding } from "@/lib/notify/addresses";

// A member's own addresses. Every route here acts on the signed-in member's CAPID and never takes one from
// the request, so there is no shape of call that edits somebody else's list.

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (!user.capid) {
      // Without a CAPID there is no roster identity to hang addresses on. Said plainly rather than shown as
      // an empty list, which would look like a member who has removed everything.
      return NextResponse.json({ addresses: [], message: "Your account is not linked to a CAPID yet." });
    }
    return NextResponse.json({ addresses: await listAddresses(user.capid) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Your addresses could not be read." }, { status: 500 });
  }
}

const schema = z.union([
  z.object({ action: z.literal("add"), email: z.string().min(3).max(254), label: z.string().max(40).nullable().optional() }),
  z.object({ action: z.literal("confirm"), email: z.string().min(3).max(254), code: z.string().min(4).max(10) }),
  z.object({ action: z.literal("notify"), email: z.string().min(3).max(254), notify: z.boolean() }),
  z.object({ action: z.literal("remove"), email: z.string().min(3).max(254) })
]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (!user.capid) {
      return NextResponse.json({ message: "Your account is not linked to a CAPID yet." }, { status: 400 });
    }
    const input = schema.parse(await request.json());

    const result =
      input.action === "add"
        ? await startAdding(user.capid, input.email, input.label ?? null, user.fullName)
        : input.action === "confirm"
          ? await confirmAddress(user.capid, input.email, input.code)
          : input.action === "notify"
            ? await setNotify(user.capid, input.email, input.notify)
            : await removeAddress(user.capid, input.email);

    return NextResponse.json(
      { ...result, addresses: await listAddresses(user.capid) },
      { status: result.ok ? 200 : 400 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That change was invalid." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "That change could not be saved." }, { status: 500 });
  }
}
