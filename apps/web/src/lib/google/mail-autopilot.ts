import { getDatabase } from "@/lib/cloudflare";
import { createItem, updateItem } from "@/lib/work/items";
import { applyProposal, proposeReminders } from "@/lib/work/reminders";
import { recordAuditEvent } from "@/lib/db/audit";
import { notify } from "@/lib/notify/notifications";
import { dateIsInTheText } from "./dated";

// Making the task without being asked, for the mail that plainly says what has to happen and when.
//
// Everything else in the Hub suggests and waits, and that is the right default: a squadron does not want an
// assistant inventing work. But two members asked for this specifically, and the case they described is a
// narrow one - an email that states a deadline, where the job and the date are both already written down
// and pressing a button adds nothing but a delay.
//
// So this is deliberately the narrowest thing that satisfies it:
//
//   - Off unless a member turns it on. Nobody gets this by upgrade.
//   - Only mail that states a date. No date, no task - it goes back to being a suggestion like everything
//     else, because a task with no deadline is exactly the kind a model invents.
//   - Only into one list the member chose, so it can never scatter work across the squadron.
//   - A daily ceiling, so a mailbox nobody has read in a month cannot produce forty tasks overnight.
//   - Every task says it was made this way, quotes the mail it came from, and links back to it.
//   - The member is told, every time, in the same evening email as everything else. Silence would be the
//     worst property this could have.
//
// Anything created here can be deleted like any other task, and turning the setting off stops it at once.

/** Nobody wakes up to forty tasks. A month of unread mail cannot become a month of work in one night. */
const MOST_PER_DAY = 6;

export interface AutopilotSettings {
  on: boolean;
  /** Where tasks land. Null means the member has not chosen, which is the same as off. */
  listId: string | null;
  listName: string | null;
}

export async function getAutopilot(userId: string): Promise<AutopilotSettings> {
  try {
    const rows = await getDatabase()
      .prepare("SELECT key, value FROM user_settings WHERE user_id = ? AND key IN ('mail_autocreate', 'mail_autocreate_list')")
      .bind(userId)
      .all<{ key: string; value: string }>();
    const held = new Map(rows.results.map((row) => [row.key, row.value]));
    const listId = held.get("mail_autocreate_list") ?? null;

    let listName: string | null = null;
    if (listId) {
      // Asked of the table rather than the tree, because a list inside a folder is not in a space's own
      // lists and reading the tree would have found the loose ones only.
      const list = await getDatabase()
        .prepare("SELECT name FROM lists WHERE id = ? AND archived_at IS NULL")
        .bind(listId)
        .first<{ name: string }>();
      listName = list?.name ?? null;
    }
    // A list that has since been removed turns this off rather than guessing at a replacement.
    return { on: held.get("mail_autocreate") === "ON" && Boolean(listId && listName), listId, listName };
  } catch {
    return { on: false, listId: null, listName: null };
  }
}

export async function setAutopilot(userId: string, input: { on: boolean; listId: string | null }): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const put = async (key: string, value: string) => {
    await db
      .prepare(
        "INSERT INTO user_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
      )
      .bind(userId, key, value, now)
      .run();
  };
  await put("mail_autocreate", input.on ? "ON" : "OFF");
  await put("mail_autocreate_list", input.listId ?? "");
}

async function madeToday(userId: string): Promise<number> {
  const key = "mail_autocreate_" + new Date().toISOString().slice(0, 10);
  try {
    const row = await getDatabase()
      .prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = ?")
      .bind(userId, key)
      .first<{ value: string }>();
    return Number(row?.value ?? 0) || 0;
  } catch {
    // Not being able to count is not permission to ignore the limit.
    return MOST_PER_DAY;
  }
}

async function countMade(userId: string, made: number): Promise<void> {
  const key = "mail_autocreate_" + new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  await getDatabase()
    .prepare(
      "INSERT INTO user_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
    .bind(userId, key, String(made), now)
    .run();
}

/**
 * Catches up the suggestions that were already waiting before any of this existed.
 *
 * Those rows were written without the date ever being checked, so they sit at unverified, and would have been
 * skipped for ever. The email bodies are long gone, but the quote kept with each one was itself checked
 * against the message when it was read - so a date found in that quote is still a date the email said, which
 * is the whole test. A date that is not in it stays unverified and waits for a person, which is where it was
 * already.
 */
async function catchUpOlderRows(userId: string): Promise<void> {
  const db = getDatabase();
  const stale = await db
    .prepare(
      "SELECT id, title, due_on, because FROM mail_suggestions " +
      "WHERE user_id = ? AND status = 'OPEN' AND due_on IS NOT NULL AND due_verified = 0"
    )
    .bind(userId)
    .all<{ id: string; title: string; due_on: string; because: string | null }>();

  for (const row of stale.results) {
    const words = (row.because ?? "") + "|" + row.title;
    if (!dateIsInTheText(row.due_on, words)) continue;
    await db.prepare("UPDATE mail_suggestions SET due_verified = 1 WHERE id = ?").bind(row.id).run();
  }
}

export interface AutoCreated {
  itemId: string;
  title: string;
  dueOn: string;
  reminders: number;
}

/**
 * Turns the dated suggestions waiting for a member into tasks, with their reminders already set.
 *
 * Called after the mail check, and does nothing at all unless the member asked for it. Returns what it made
 * so the caller can say so; it never returns silently having changed the squadron's work.
 */
export async function runAutopilot(userId: string, userName: string): Promise<AutoCreated[]> {
  const settings = await getAutopilot(userId);
  if (!settings.on || !settings.listId) return [];

  // Done before the query below, so turning this on applies to the mail already read and not only to what
  // arrives next.
  await catchUpOlderRows(userId).catch((error) => console.error(error));

  const already = await madeToday(userId);
  const room = MOST_PER_DAY - already;
  if (room <= 0) return [];

  const db = getDatabase();
  let waiting: Array<{ id: string; title: string; due_on: string; because: string | null; from_address: string | null; subject: string | null; message_id: string }> = [];
  try {
    const rows = await db
      .prepare(
        "SELECT id, title, due_on, because, from_address, subject, message_id FROM mail_suggestions " +
        // The date is the whole qualification, and it has to be a date the email really contains. An
        // unverified one still shows as a suggestion for somebody to read; it just cannot make work by itself.
        // A deadline that has already gone by is not work, it is history - and reading ninety days of mail
        // turns up plenty of it. Those stay as suggestions, where a person can see for themselves that the
        // date has passed.
        "WHERE user_id = ? AND status = 'OPEN' AND due_on IS NOT NULL AND due_verified = 1 " +
        "AND due_on >= ? ORDER BY created_at LIMIT ?"
      )
      .bind(userId, new Date().toISOString().slice(0, 10), room)
      .all<{ id: string; title: string; due_on: string; because: string | null; from_address: string | null; subject: string | null; message_id: string }>();
    waiting = rows.results;
  } catch {
    return [];
  }
  if (!waiting.length) return [];

  const made: AutoCreated[] = [];
  const now = new Date().toISOString();

  for (const suggestion of waiting) {
    try {
      // Claimed before anything is created, and only if it is still open.
      //
      // Two requests can run this at once - the home page's pulse and the offers list both set the mail
      // check going - and the row has to stop being available to the second one before the first spends any
      // time making a task. Marking it afterwards left a window in which both passes saw the same suggestion
      // and the member got the task twice; the same window reopened every time the update itself failed.
      const claim = await db
        .prepare("UPDATE mail_suggestions SET status = 'ADDED' WHERE id = ? AND status = 'OPEN'")
        .bind(suggestion.id)
        .run();
      if (!claim.meta.changes) continue;

      const itemId = await createItem({ listId: settings.listId, title: suggestion.title, dueOn: suggestion.due_on, userId });
      // Written down the moment the task exists. The description and the reminders come next and either of
      // them can fail; if the row did not already know about the task by then, putting it back would make a
      // second copy of one that had been created perfectly well.
      await db
        .prepare("UPDATE mail_suggestions SET item_id = ? WHERE id = ?")
        .bind(itemId, suggestion.id)
        .run();

      await updateItem(itemId, {
        description: [
          "Made from an email, automatically.",
          suggestion.from_address ? "From: " + suggestion.from_address : null,
          suggestion.subject ? "Subject: " + suggestion.subject : null,
          suggestion.because ? "\nIt said: “" + suggestion.because + "”" : null,
          "\nThe Hub made this because you asked it to create tasks from dated mail. Delete it if it is wrong."
        ].filter(Boolean).join("\n")
      });

      // The reminders go on at the same moment, which is the other half of what was asked for.
      const proposal = await proposeReminders({
        userId,
        title: suggestion.title,
        description: suggestion.because,
        dueOn: suggestion.due_on
      });
      const reminders = proposal.proposed.length
        ? await applyProposal({ itemId, proposed: proposal.proposed, userId, source: "ASSISTANT" })
        : 0;

      made.push({ itemId, title: suggestion.title, dueOn: suggestion.due_on, reminders });
    } catch (error) {
      console.error(error);
      // Put back, so one that failed halfway is still offered by hand rather than vanishing. A task that did
      // get made keeps its own row's item_id; this only runs when something threw before that point.
      await db
        .prepare("UPDATE mail_suggestions SET status = 'OPEN' WHERE id = ? AND item_id IS NULL")
        .bind(suggestion.id)
        .run()
        .catch(() => undefined);
      continue;
    }
  }

  if (!made.length) return [];

  await countMade(userId, already + made.length);

  // Told, every time. A thing that changes the squadron's work without saying so is not something anybody
  // should have to discover.
  await notify(made.map((entry) => ({
    userId,
    kind: "ASSIGNED",
    title: "Made from your email: " + entry.title,
    body: "Due " + entry.dueOn + " in " + settings.listName + "."
      + (entry.reminders ? " " + entry.reminders + " reminder" + (entry.reminders === 1 ? "" : "s") + " set." : "")
      + " Delete it if it is wrong.",
    itemId: entry.itemId,
    listId: settings.listId,
    dedupeKey: "AUTOMADE:" + entry.itemId
  })));

  await recordAuditEvent({
    actorUserId: userId,
    action: "MAIL_AUTOCREATED",
    entityType: "user",
    entityId: userId,
    summary: userName + " had " + made.length + (made.length === 1 ? " task" : " tasks") + " created automatically from dated mail",
    metadata: { count: made.length, listId: settings.listId, at: now }
  });

  return made;
}
