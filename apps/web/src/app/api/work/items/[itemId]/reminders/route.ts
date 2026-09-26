import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/origin";
import { getItemDetail } from "@/lib/work/items";
import { updateItem } from "@/lib/work/items";
import {
  addReminder,
  applyProposal,
  clearReminders,
  deleteReminder,
  findStatedDeadline,
  listReminders,
  proposeReminders,
  updateReminder
} from "@/lib/work/reminders";

// Reminders on one task.
//
// The assistant proposes and a person decides, the same rule as everywhere else: "suggest" returns dates
// without writing anything, and they are only kept when somebody says so. Everything here is editable
// afterwards - moved later, moved sooner, or deleted - because a schedule nobody can change is a schedule
// people work around rather than with.

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("suggest") }),
  z.object({
    action: z.literal("apply"),
    reminders: z.array(z.object({ remindOn: date, note: z.string().trim().max(160) })).max(6),
    // Present only when the task had no due date and the person accepted the one that was read out of it.
    dueOn: date.optional()
  }),
  z.object({ action: z.literal("add"), remindOn: date, note: z.string().trim().max(160).nullable().optional() }),
  z.object({ action: z.literal("update"), id: z.string().trim().min(1).max(80), remindOn: date.optional(), note: z.string().trim().max(160).nullable().optional() }),
  z.object({ action: z.literal("delete"), id: z.string().trim().min(1).max(80) }),
  z.object({ action: z.literal("clear") })
]);

export async function GET(_request: Request, context: { params: Promise<{ itemId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  const { itemId } = await context.params;
  return NextResponse.json({ reminders: await listReminders(itemId) });
}

export async function POST(request: Request, context: { params: Promise<{ itemId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (user.globalRole === "READ_ONLY") {
      return NextResponse.json({ message: "Read-only accounts cannot change reminders." }, { status: 403 });
    }

    const { itemId } = await context.params;
    const input = schema.parse(await request.json());
    const item = await getItemDetail(itemId);
    if (!item) return NextResponse.json({ message: "That task is gone." }, { status: 404 });

    if (input.action === "suggest") {
      // Reads and returns. Nothing is written by asking, including the due date.
      let dueOn = item.dueOn;
      let foundDate: { dueOn: string | null; because: string | null } = { dueOn: null, because: null };

      // A task with no due date is the common case, and the date is usually sitting in the task's own words:
      // "due 1 Nov", "Operations Briefing - Tue 15 Sep 2026". Asking somebody to retype it before the
      // assistant will help is the kind of small refusal that stops a feature being used at all.
      if (!dueOn) {
        foundDate = await findStatedDeadline({ userId: user.id, title: item.title, description: item.description });
        dueOn = foundDate.dueOn;
      }

      if (!dueOn) {
        return NextResponse.json({
          proposed: [],
          message: "This task does not say when it is due, and a deadline nobody set is worse than none. Put a date on it and press this again."
        });
      }

      const result = await proposeReminders({
        userId: user.id,
        title: item.title,
        description: item.description,
        dueOn
      });

      return NextResponse.json({
        ...result,
        // Offered, never applied. The due date is part of the proposal a person accepts or throws away.
        proposedDueOn: item.dueOn ? null : dueOn,
        proposedDueBecause: foundDate.because,
        message: !result.proposed.length
          ? "It is due too soon for a reminder to be any use."
          : item.dueOn
            ? result.fromAssistant
              ? "Here is what it suggests. Change anything before you keep it."
              : "No assistant was available, so this is the plain schedule. Change anything before you keep it."
            : foundDate.because
              ? "The task says " + JSON.stringify(foundDate.because) + ", so it is read as due " + dueOn + ". Check that before you keep it."
              : "Read as due " + dueOn + " from the task itself. Check that before you keep it."
      });
    }

    if (input.action === "apply") {
      // The date is set first, so a reminder is never left counting back from nothing.
      if (input.dueOn && !item.dueOn) await updateItem(itemId, { dueOn: input.dueOn });
      const kept = await applyProposal({ itemId, proposed: input.reminders, userId: user.id });
      return NextResponse.json({
        reminders: await listReminders(itemId),
        dueOn: input.dueOn && !item.dueOn ? input.dueOn : undefined,
        message: (kept ? kept + (kept === 1 ? " reminder set." : " reminders set.") : "Nothing new to add.")
          + (input.dueOn && !item.dueOn ? " Due date set to " + input.dueOn + "." : "")
      });
    }

    if (input.action === "add") {
      await addReminder({ itemId, remindOn: input.remindOn, note: input.note ?? null, source: "PERSON", userId: user.id });
      return NextResponse.json({ reminders: await listReminders(itemId), message: "Reminder set." });
    }

    if (input.action === "update") {
      await updateReminder(input.id, { remindOn: input.remindOn, note: input.note });
      return NextResponse.json({ reminders: await listReminders(itemId), message: "Saved." });
    }

    if (input.action === "delete") {
      await deleteReminder(input.id);
      return NextResponse.json({ reminders: await listReminders(itemId), message: "Reminder removed." });
    }

    await clearReminders(itemId);
    return NextResponse.json({
      reminders: [],
      message: "All of them removed. This task is back on the squadron's normal schedule."
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That reminder was not valid." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: "That could not be saved." }, { status: 500 });
  }
}
