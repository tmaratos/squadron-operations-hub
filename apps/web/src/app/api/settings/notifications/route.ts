import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/origin";
import { recordAuditEvent } from "@/lib/db/audit";
import { notificationLevel, setNotificationLevel, LEVELS } from "@/lib/notify/squadron-switch";
import type { GlobalRole } from "@/lib/auth/types";

// The squadron-wide email switch.
//
// Restricted to the people who answer for the unit, because this decides whether fifty members hear anything
// at all. A member who wants less mail already has their own setting and their own address list; this one is
// for the squadron, and turning it off silences everybody including people who were happy.

function mayChange(role: GlobalRole): boolean {
  return role === "SYSTEM_OWNER" || role === "ADMINISTRATOR";
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    return NextResponse.json({
      level: await notificationLevel(),
      levels: LEVELS,
      canChange: mayChange(user.globalRole)
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "That could not be read." }, { status: 500 });
  }
}

const schema = z.object({ level: z.enum(["EVERYTHING", "ONLY_ALERTS", "NOTHING"]) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (!mayChange(user.globalRole)) {
      return NextResponse.json({ message: "Only command staff can change this." }, { status: 403 });
    }

    const { level } = schema.parse(await request.json());
    const before = await notificationLevel();
    await setNotificationLevel(level, user.id);

    // Written to the record because going quiet is the kind of change nobody notices until somebody asks why
    // they were not told something, and by then the question is who switched it off and when.
    await recordAuditEvent({
      actorUserId: user.id,
      action: "NOTIFICATION_LEVEL_CHANGED",
      entityType: "setting",
      entityId: "notify.level",
      summary: user.fullName + " changed squadron email from " + before + " to " + level,
      metadata: { before, after: level }
    });

    return NextResponse.json({
      level,
      message:
        level === "EVERYTHING"
          ? "Members will be emailed again. Anybody who turned their own email off stays off."
          : level === "ONLY_ALERTS"
            ? "Automated email is off. Squadron alerts still reach people, and everything still appears in the Hub."
            : "No email will be sent to members, including squadron alerts. Everything still appears in the Hub."
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That setting was invalid." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "That could not be saved." }, { status: 500 });
  }
}
