import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { listNotifications, markRead, savePrefs, sendTestEmail, unreadCount, type NotificationPrefs } from "@/lib/notify/notifications";
import { assertSameOrigin } from "@/lib/security/origin";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    const [notifications, unread] = await Promise.all([listNotifications(user.id), unreadCount(user.id)]);
    return NextResponse.json({ notifications, unread });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Your notifications could not be read." }, { status: 500 });
  }
}

const schema = z.union([
  z.object({ action: z.literal("read"), ids: z.array(z.string().max(80)).max(200).optional() }),
  z.object({
    action: z.literal("prefs"),
    prefs: z.object({
      emailEnabled: z.boolean(),
      onAssigned: z.boolean(),
      onComment: z.boolean(),
      onDueSoon: z.boolean(),
      onOverdue: z.boolean(),
      onStatus: z.boolean(),
      cadence: z.enum(["IMMEDIATE", "DAILY"]),
      leadDays: z.number().int().min(0).max(30)
    })
  }),
  z.object({ action: z.literal("test") })
]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    const input = schema.parse(await request.json());

    if (input.action === "read") {
      await markRead(user.id, input.ids);
      return NextResponse.json({ unread: await unreadCount(user.id) });
    }

    if (input.action === "test") {
      const result = await sendTestEmail(user.id);
      return NextResponse.json({ message: result.message }, { status: result.ok ? 200 : 400 });
    }

    await savePrefs(user.id, input.prefs as NotificationPrefs);
    return NextResponse.json({ message: "Saved. This takes effect straight away." });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That change was invalid." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "That change could not be saved." }, { status: 500 });
  }
}
