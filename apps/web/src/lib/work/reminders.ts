import { getDatabase } from "@/lib/cloudflare";
import { aiChatFor } from "@/lib/ai/provider";
import { parseJsonReply } from "@/lib/ai/local";

// Reminders that belong to a single task.
//
// The assistant proposes; a person disposes. Everything here keeps that line: proposing writes rows marked
// as the assistant's suggestion, a member can move, add to or delete any of them, and a task with no
// reminders of its own falls back to the squadron-wide ladder rather than going quiet.
//
// Every date the model returns is checked here against the calendar - parsed, bounded by today and the
// deadline, deduplicated and sorted - because a reminder for a date that does not exist, or one that fires
// after the thing is due, is worse than no reminder at all.

/** A line break, named so it survives being written by a script. */
const NEWLINE = String.fromCharCode(10);

export type ReminderSource = "PERSON" | "ASSISTANT";

export interface Reminder {
  id: string;
  itemId: string;
  remindOn: string;
  note: string | null;
  source: ReminderSource;
  sentAt: string | null;
  /** Negative once the date has passed. Null only if the date cannot be read, which should not happen. */
  daysAway: number | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function isDate(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value + "T12:00:00Z"));
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(to + "T12:00:00Z").getTime() - new Date(from + "T12:00:00Z").getTime()) / 86400000
  );
}

function addDays(date: string, days: number): string {
  const moved = new Date(date + "T12:00:00Z");
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

export async function listReminders(itemId: string): Promise<Reminder[]> {
  try {
    const rows = await getDatabase()
      .prepare("SELECT * FROM item_reminders WHERE item_id = ? ORDER BY remind_on")
      .bind(itemId)
      .all<{
        id: string; item_id: string; remind_on: string; note: string | null;
        source: ReminderSource; sent_at: string | null;
      }>();
    const from = today();
    return rows.results.map((row) => ({
      id: row.id,
      itemId: row.item_id,
      remindOn: row.remind_on,
      note: row.note,
      source: row.source,
      sentAt: row.sent_at,
      daysAway: isDate(row.remind_on) ? daysBetween(from, row.remind_on) : null
    }));
  } catch {
    // The table arrives with a migration; until then a task simply has none and the ladder applies.
    return [];
  }
}

export async function addReminder(input: {
  itemId: string;
  remindOn: string;
  note?: string | null;
  source?: ReminderSource;
  userId: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  const at = nowIso();
  await getDatabase()
    .prepare(
      "INSERT INTO item_reminders (id, item_id, remind_on, note, source, created_by, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(id, input.itemId, input.remindOn, input.note?.trim() || null, input.source ?? "PERSON", input.userId, at, at)
    .run();
  return id;
}

/**
 * Moving a reminder clears the fact that it was sent.
 *
 * Somebody who drags a reminder to a later date means they want telling then, and a row still marked as
 * sent would sit there silently and never fire. The one case where forgetting is the correct behaviour.
 */
export async function updateReminder(id: string, input: { remindOn?: string; note?: string | null }): Promise<void> {
  const sets: string[] = [];
  const values: Array<string | null> = [];
  if (input.remindOn !== undefined) {
    sets.push("remind_on = ?", "sent_at = NULL");
    values.push(input.remindOn);
  }
  if (input.note !== undefined) {
    sets.push("note = ?");
    values.push(input.note?.trim() || null);
  }
  if (!sets.length) return;
  sets.push("updated_at = ?");
  values.push(nowIso(), id);
  await getDatabase()
    .prepare("UPDATE item_reminders SET " + sets.join(", ") + " WHERE id = ?")
    .bind(...values)
    .run();
}

export async function deleteReminder(id: string): Promise<void> {
  await getDatabase().prepare("DELETE FROM item_reminders WHERE id = ?").bind(id).run();
}

/** Every reminder on a task, gone. Used when somebody wants to start the schedule again. */
export async function clearReminders(itemId: string): Promise<void> {
  await getDatabase().prepare("DELETE FROM item_reminders WHERE item_id = ?").bind(itemId).run();
}

export interface ProposedReminder {
  remindOn: string;
  note: string;
}

/**
 * A schedule worked out without asking anybody, for a task that has a deadline.
 *
 * Used when there is no assistant available, and as the thing the assistant's answer is checked against.
 * Spacing follows how far away the deadline is, because four weeks of warning on something due on Friday is
 * noise, and one week of warning on something due in three months is too late to be any use.
 */
export function plainSchedule(dueOn: string, from = today()): ProposedReminder[] {
  const away = daysBetween(from, dueOn);
  if (away < 0) return [];

  // Inclusive at each boundary, because "due in exactly a fortnight" should get a fortnight's treatment.
  // Written the other way round it did not: fifteen days out got three reminders and fourteen got two,
  // which is the sort of edge nobody would ever guess at and everybody would eventually hit.
  const offsets = away >= 60
    ? [42, 21, 7, 1]
    : away >= 30
      ? [21, 7, 2]
      : away >= 14
        ? [10, 3, 1]
        : away >= 5
          ? [3, 1]
          : [1];

  return offsets
    .filter((offset) => offset < away)
    .map((offset) => ({
      remindOn: addDays(dueOn, -offset),
      note: offset === 1 ? "The day before it is due" : offset + " days before it is due"
    }));
}

/**
 * What the assistant thinks, checked against the calendar before any of it is kept.
 *
 * The model sees the task and its deadline and suggests when somebody would want warning, and why. Whatever
 * comes back is then held to the same rules as anything else the Hub takes from a model: real dates only,
 * nothing in the past, nothing after the deadline, no duplicates, at most five. If nothing survives that,
 * the plain schedule is used, so the feature never simply fails.
 */
/**
 * The deadline a task already states, for tasks that have no due date set.
 *
 * Squadron work arrives with the date in the words: "Operations Briefing - Tue 15 Sep 2026", "due 1 Nov",
 * "suspense 15 September". The date is sitting there and the field is empty, so the assistant reads it out
 * rather than asking somebody to retype it.
 *
 * It is a reading, never a guess. Where the task states no date, this returns null and says so, because a
 * deadline nobody set is worse than no deadline: it looks like a commitment somebody made.
 */
export async function findStatedDeadline(input: {
  userId: string;
  title: string;
  description?: string | null;
}): Promise<{ dueOn: string | null; because: string | null }> {
  const system = [
    "You read one task from a Civil Air Patrol squadron and find the deadline it already states.",
    'Reply with JSON only: {"dueOn": "YYYY-MM-DD" or null, "because": "<the words in the task that say so>"}',
    "Rules:",
    "- Only a date the task actually states, in its title or its description. Never one you think is sensible.",
    "- because must be the words that carry the date, copied from the task.",
    "- If the task states no date, reply {\"dueOn\": null, \"because\": null}. That is a correct answer.",
    "- Today is " + today() + ". A bare day and month means the next one still to come."
  ].join(NEWLINE);

  try {
    const raw = await aiChatFor(input.userId, [
      { role: "system", content: system },
      { role: "user", content: ["Task: " + input.title, input.description ? "Detail: " + input.description.slice(0, 1200) : ""].filter(Boolean).join(NEWLINE) }
    ], { json: true, maxTokens: 200 });

    const parsed = parseJsonReply<{ dueOn?: unknown; because?: unknown }>(raw, {});
    if (!isDate(parsed.dueOn)) return { dueOn: null, because: null };
    // A stated deadline in the past is still a fact about the task, but it is no use to count back from.
    if (parsed.dueOn < today()) return { dueOn: null, because: null };

    const because = typeof parsed.because === "string" ? parsed.because.trim().slice(0, 160) : "";
    const words = (input.title + " " + (input.description ?? "")).toLowerCase();
    // The quote has to appear in the task. Without this check the reason is just the model's own sentence.
    const honest = because.length > 3 && words.includes(because.toLowerCase().slice(0, Math.min(18, because.length)));
    return { dueOn: parsed.dueOn, because: honest ? because : null };
  } catch {
    return { dueOn: null, because: null };
  }
}

export async function proposeReminders(input: {
  userId: string;
  title: string;
  description?: string | null;
  dueOn: string;
}): Promise<{ proposed: ProposedReminder[]; fromAssistant: boolean }> {
  const fallback = plainSchedule(input.dueOn);
  const away = daysBetween(today(), input.dueOn);
  if (away < 0) return { proposed: [], fromAssistant: false };

  const system = [
    "You schedule reminders for one task in a Civil Air Patrol squadron's operations app.",
    'Reply with JSON only: {"reminders": [{"daysBefore": <whole number>, "why": "<short reason>"}]}',
    "Rules:",
    "- Between one and five reminders, and none on or after the day it is due.",
    "- daysBefore counts back from the deadline. The task is due in " + away + " days.",
    "- Space them for the work: something needing other people, a booking, a form or a payment wants early",
    "  warning; something somebody can do in an hour does not.",
    "- why is why that date matters for this task, in a few words. Not a restatement of the task.",
    "- Do not invent facts about the task. Work only from what you are given."
  ].join("\n");

  try {
    const raw = await aiChatFor(input.userId, [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          "Task: " + input.title,
          input.description ? "Detail: " + input.description.slice(0, 600) : "",
          "Due: " + input.dueOn,
          "Today: " + today()
        ].filter(Boolean).join("\n")
      }
    ], { json: true, maxTokens: 400 });

    const parsed = parseJsonReply<{ reminders?: unknown }>(raw, {});
    const rows = Array.isArray(parsed.reminders) ? parsed.reminders : [];

    const seen = new Set<string>();
    const proposed: ProposedReminder[] = [];
    rows.forEach((entry) => {
      const row = entry as { daysBefore?: unknown; why?: unknown };
      const before = Math.round(Number(row.daysBefore));
      // Must be a real number of days, must land before the deadline, and must not be in the past.
      if (!Number.isFinite(before) || before < 1 || before >= away) return;
      const remindOn = addDays(input.dueOn, -before);
      if (!isDate(remindOn) || remindOn < today()) return;
      if (seen.has(remindOn)) return;
      seen.add(remindOn);
      const why = typeof row.why === "string" && row.why.trim() ? row.why.trim().slice(0, 140) : before + " days before it is due";
      proposed.push({ remindOn, note: why });
    });

    if (!proposed.length) return { proposed: fallback, fromAssistant: false };
    return {
      proposed: proposed.sort((left, right) => left.remindOn.localeCompare(right.remindOn)).slice(0, 5),
      fromAssistant: true
    };
  } catch {
    // No assistant, or it answered with nothing usable. The task still gets a schedule.
    return { proposed: fallback, fromAssistant: false };
  }
}

/** Writes a proposal, replacing anything the assistant put there before but never a person's own. */
export async function applyProposal(input: {
  itemId: string;
  proposed: ProposedReminder[];
  userId: string;
  source?: ReminderSource;
}): Promise<number> {
  const db = getDatabase();
  // A member who has set their own reminders has said what they want; proposing again must not sweep that
  // away. Only the assistant's previous suggestions are replaced.
  await db.prepare("DELETE FROM item_reminders WHERE item_id = ? AND source = 'ASSISTANT' AND sent_at IS NULL")
    .bind(input.itemId)
    .run();

  const existing = await listReminders(input.itemId);
  const taken = new Set(existing.map((reminder) => reminder.remindOn));

  let kept = 0;
  for (const entry of input.proposed) {
    if (taken.has(entry.remindOn)) continue;
    taken.add(entry.remindOn);
    await addReminder({
      itemId: input.itemId,
      remindOn: entry.remindOn,
      note: entry.note,
      source: input.source ?? "ASSISTANT",
      userId: input.userId
    });
    kept += 1;
  }
  return kept;
}
