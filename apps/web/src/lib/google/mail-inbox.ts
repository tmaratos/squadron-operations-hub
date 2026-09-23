import { getDatabase } from "@/lib/cloudflare";
import { canRead } from "./gmail";
import { suggestFromMail } from "./mail-suggestions";

// Looking through labelled mail quietly, in the background, so the answer is already waiting.
//
// A member should not have to press a button and watch a spinner to find out that an email needed a task.
// The Hub checks every so often while they are using it, keeps what it found, and offers it on the home
// page. Nothing becomes a task without a press, and a message it has already asked about never returns.

const CHECK_EVERY_MINUTES = 90;

export interface StoredSuggestion {
  id: string;
  messageId: string;
  from: string | null;
  subject: string | null;
  title: string;
  dueOn: string | null;
  because: string | null;
}

async function lastCheckedAt(userId: string): Promise<number> {
  try {
    const row = await getDatabase()
      .prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'mail_checked_at'")
      .bind(userId)
      .first<{ value: string }>();
    return row?.value ? new Date(row.value).getTime() : 0;
  } catch {
    return 0;
  }
}

async function markChecked(userId: string): Promise<void> {
  await getDatabase()
    .prepare(
      "INSERT INTO user_settings (user_id, key, value, updated_at) VALUES (?, 'mail_checked_at', ?, ?) " +
      "ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
    .bind(userId, new Date().toISOString(), new Date().toISOString())
    .run();
}

export async function dueForCheck(userId: string): Promise<boolean> {
  if (!(await canRead(userId).catch(() => false))) return false;
  return Date.now() - (await lastCheckedAt(userId)) > CHECK_EVERY_MINUTES * 60000;
}

/** Reads the labelled mail and keeps anything worth doing. Safe to call often; it does the work rarely. */
export async function checkMail(userId: string): Promise<number> {
  if (!(await dueForCheck(userId))) return 0;
  await markChecked(userId); // marked first, so a failure does not put it in a loop

  const { suggestions } = await suggestFromMail(userId);
  const db = getDatabase();
  const now = new Date().toISOString();
  let kept = 0;

  for (const suggestion of suggestions) {
    if (!suggestion.actionable) continue;
    try {
      await db
        .prepare(
          "INSERT INTO mail_suggestions (id, user_id, message_id, from_address, subject, title, due_on, because, status, created_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?) ON CONFLICT(user_id, message_id) DO NOTHING"
        )
        .bind(crypto.randomUUID(), userId, suggestion.messageId, suggestion.from, suggestion.subject, suggestion.title, suggestion.dueOn, suggestion.because, now)
        .run();
      kept += 1;
    } catch (error) {
      console.error(error);
    }
  }
  return kept;
}

export async function openSuggestions(userId: string, limit = 5): Promise<StoredSuggestion[]> {
  try {
    const rows = await getDatabase()
      .prepare(
        "SELECT id, message_id, from_address, subject, title, due_on, because FROM mail_suggestions " +
        "WHERE user_id = ? AND status = 'OPEN' ORDER BY created_at DESC LIMIT ?"
      )
      .bind(userId, limit)
      .all<{ id: string; message_id: string; from_address: string | null; subject: string | null; title: string; due_on: string | null; because: string | null }>();
    return rows.results.map((row) => ({
      id: row.id,
      messageId: row.message_id,
      from: row.from_address,
      subject: row.subject,
      title: row.title,
      dueOn: row.due_on,
      because: row.because
    }));
  } catch {
    return [];
  }
}

export async function settleSuggestion(input: { userId: string; id: string; status: "ADDED" | "DISMISSED"; itemId?: string | null }): Promise<void> {
  await getDatabase()
    .prepare("UPDATE mail_suggestions SET status = ?, item_id = ? WHERE id = ? AND user_id = ?")
    .bind(input.status, input.itemId ?? null, input.id, input.userId)
    .run();
}
