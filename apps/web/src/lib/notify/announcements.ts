import { getDatabase } from "@/lib/cloudflare";
import { addressesForCapid } from "@/lib/org/roster";
import { mailConfigured, sendMail } from "./mail";

// A squadron alert: one message a staff member sends to the members they choose. It is a notification like
// any other, so it appears in the Hub as well as the inbox, and it is never quietly lost if email is off.
//
// Alerts ignore the "what to tell me" checkboxes, because they are sent deliberately to named people about
// something that matters. They still respect a member turning email off entirely - that member reads it in
// the Hub. Urgent sends now; otherwise it rides along with that member's usual daily email.

export interface AnnouncementResult {
  sent: number;
  emailed: number;
  failures: string[];
}

export async function sendAnnouncement(input: {
  userIds: string[];
  subject: string;
  body: string;
  urgent: boolean;
  actor: { id: string; fullName: string };
}): Promise<AnnouncementResult> {
  const db = getDatabase();
  const ids = [...new Set(input.userIds)].filter(Boolean);
  if (!ids.length) return { sent: 0, emailed: 0, failures: ["Nobody was chosen."] };

  const placeholders = ids.map(() => "?").join(", ");
  const people = await db
    .prepare(
      "SELECT u.id, u.email, u.full_name, u.capid, COALESCE(p.email_enabled, 1) AS email_enabled " +
      "FROM users u LEFT JOIN notification_prefs p ON p.user_id = u.id " +
      "WHERE u.id IN (" + placeholders + ") AND u.status IN ('APPROVED','PENDING')"
    )
    .bind(...ids)
    .all<{ id: string; email: string; full_name: string; capid: string | null; email_enabled: number }>();

  const now = new Date().toISOString();
  const announcementId = crypto.randomUUID();
  const url = null;

  await db.batch([
    db.prepare("INSERT INTO announcements (id, subject, body, sent_by, recipient_count, urgent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(announcementId, input.subject.slice(0, 300), input.body.slice(0, 5000), input.actor.id, people.results.length, input.urgent ? 1 : 0, now),
    ...people.results.map((person) =>
      db.prepare(
        "INSERT INTO notifications (id, user_id, kind, title, body, item_id, list_id, url, actor_user_id, dedupe_key, email_state, created_at) " +
        "VALUES (?, ?, 'ANNOUNCEMENT', ?, ?, NULL, NULL, ?, ?, NULL, ?, ?)"
      ).bind(
        crypto.randomUUID(),
        person.id,
        input.subject.slice(0, 300),
        input.body.slice(0, 2000),
        url,
        input.actor.id,
        person.email_enabled ? "PENDING" : "SKIPPED",
        now
      )
    )
  ]);

  if (!input.urgent || !mailConfigured()) {
    return { sent: people.results.length, emailed: 0, failures: [] };
  }

  let emailed = 0;
  const failures: string[] = [];
  for (const person of people.results) {
    if (!person.email_enabled) continue;
    const to = person.capid ? await addressesForCapid(person.capid) : [person.email.toLowerCase()];
    const result = await sendMail({
      to,
      subject: input.subject,
      name: person.full_name,
      notices: [{ title: input.subject, body: input.body, url: null }]
    });
    const stamp = new Date().toISOString();
    await db
      .prepare("UPDATE notifications SET email_state = ?, emailed_at = ? WHERE user_id = ? AND kind = 'ANNOUNCEMENT' AND created_at = ?")
      .bind(result.ok ? "SENT" : "FAILED", stamp, person.id, now)
      .run();
    await db
      .prepare("INSERT INTO notification_sends (id, user_id, email, subject, notification_count, provider, status, error, created_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), person.id, to.join(", "), input.subject.slice(0, 300), result.provider, result.ok ? "SENT" : "FAILED", result.error, stamp)
      .run();
    if (result.ok) emailed += 1;
    else failures.push(person.full_name);
  }

  return { sent: people.results.length, emailed, failures };
}

export async function listAnnouncements(limit = 20): Promise<Array<{ id: string; subject: string; body: string; sentBy: string | null; recipientCount: number; urgent: boolean; createdAt: string }>> {
  try {
    const rows = await getDatabase()
      .prepare(
        "SELECT a.id, a.subject, a.body, a.recipient_count, a.urgent, a.created_at, u.full_name AS sent_by " +
        "FROM announcements a LEFT JOIN users u ON u.id = a.sent_by ORDER BY a.created_at DESC LIMIT ?"
      )
      .bind(limit)
      .all<{ id: string; subject: string; body: string; recipient_count: number; urgent: number; created_at: string; sent_by: string | null }>();
    return rows.results.map((row) => ({
      id: row.id,
      subject: row.subject,
      body: row.body,
      sentBy: row.sent_by,
      recipientCount: row.recipient_count,
      urgent: Boolean(row.urgent),
      createdAt: row.created_at
    }));
  } catch {
    return [];
  }
}
