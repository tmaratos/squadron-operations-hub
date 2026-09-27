import { getDatabase } from "@/lib/cloudflare";

// Has somebody in the squadron already turned this email into a task?
//
// A squadron email goes to everybody. The commander sends one message about a deadline to twelve members,
// and until now every one of those twelve mailboxes produced its own suggestion, and - with the assistant
// creating tasks unasked - would have produced its own task. Twelve tasks for one job, all saying the same
// thing, all with their own reminders. That is not twelve people being organised; that is a list nobody can
// read any more.
//
// The Message-ID makes this answerable. The sender's mail server sets it once, and every copy that lands in
// every recipient's mailbox carries the same one, so the message in Mel's inbox and the message in Zac's are
// recognisably one message rather than two that happen to look alike.
//
// What this does NOT do is decide who should do the work. It only reports that a task already exists and who
// has it, so the second member is told instead of handed a duplicate. Whether the job should be theirs, or
// shared, or reassigned is a squadron matter and stays with people.

export interface AlreadyMade {
  itemId: string;
  listId: string | null;
  listName: string | null;
  /** Who it was made for. Null if that account has since been removed. */
  memberName: string | null;
  memberId: string;
}

/**
 * The task somebody already has for this email, if there is one.
 *
 * Returns null when the email carries no Message-ID at all. That happens - some senders omit it, and a
 * mailbox can hand back a blank - and it has to mean "cannot tell", not "no duplicate", because treating an
 * unknown as a match would silently stop unrelated mail from ever becoming work.
 */
export async function alreadyMadeFor(internetId: string | null | undefined): Promise<AlreadyMade | null> {
  const id = (internetId ?? "").trim();
  if (!id) return null;

  try {
    const row = await getDatabase()
      .prepare(
        "SELECT s.item_id AS itemId, s.user_id AS memberId, i.list_id AS listId, l.name AS listName, u.full_name AS memberName " +
        "FROM mail_suggestions s " +
        "JOIN items i ON i.id = s.item_id " +
        "LEFT JOIN lists l ON l.id = i.list_id " +
        "LEFT JOIN users u ON u.id = s.user_id " +
        // Only a suggestion that actually became a task counts. One that is still open, or was dismissed,
        // has not claimed anything and must not stop anybody else acting on the same email.
        // The join to items is doing a second job: a task somebody has since deleted is gone from that
        // table, so it stops holding a claim over the email the moment it is deleted.
        "WHERE s.internet_id = ? AND s.status = 'ADDED' AND s.item_id IS NOT NULL " +
        "ORDER BY s.created_at LIMIT 1"
      )
      .bind(id)
      .first<{ itemId: string; memberId: string; listId: string | null; listName: string | null; memberName: string | null }>();

    return row ?? null;
  } catch {
    // Not being able to check is not a reason to block work. It falls back to the old behaviour, which is a
    // possible duplicate rather than a possible silence.
    return null;
  }
}

/** How to say it, for whoever is about to be handed a second copy. */
export function alreadySaid(made: AlreadyMade, forMemberId: string): string {
  const who = made.memberId === forMemberId
    ? "You already have a task for this email"
    : (made.memberName ?? "Somebody") + " already has a task for this email";
  return who + (made.listName ? ", in " + made.listName + "." : ".");
}
