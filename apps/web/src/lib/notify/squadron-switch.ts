import { getDatabase } from "@/lib/cloudflare";

// One switch for the whole squadron's email.
//
// Members asked for the Hub to stop emailing them. Each of them can already turn their own email off, but
// asking fifty people to each go and find a setting is not an answer to "we are all getting too much" - and
// the ones most annoyed are the least likely to go looking. So this turns it off for everybody at once.
//
// It is three settings rather than two, because "off" hides a decision that matters. Silencing the daily
// nudges is what people are asking for. Silencing a squadron alert - a message a staff member deliberately
// wrote and sent to named people - is a different thing, and a commander finding out that nobody received
// their weather cancellation is exactly the kind of surprise this Hub exists to prevent. So that is its own
// step, chosen on purpose rather than arrived at.
//
// What it never blocks is mail a member asked for in the moment: the code confirming an address they just
// typed, the test message they just pressed send on. Those are answers to a person's action, not notices,
// and swallowing them would leave somebody staring at a page waiting for something that is never coming.
//
// In-Hub notifications are untouched either way. Work still appears on the notifications page, so the record
// of what somebody was told stays true. This decides what leaves the building, not what the Hub knows.

export type NotificationLevel = "EVERYTHING" | "ONLY_ALERTS" | "NOTHING";

/** What a message is for. Decides whether the switch applies to it at all. */
export type MailPurpose =
  /** Automated: the daily summary, due-soon nudges, a goal given to a department. */
  | "NOTIFICATION"
  /** A person wrote it and chose who receives it. */
  | "ALERT"
  /** An answer to something a member did seconds ago. Never held back. */
  | "TRANSACTIONAL";

const KEY = "notify.level";
const DEFAULT: NotificationLevel = "EVERYTHING";

export const LEVELS: Array<{ value: NotificationLevel; label: string; detail: string }> = [
  {
    value: "EVERYTHING",
    label: "Send everything",
    detail: "The daily summary, reminders, and squadron alerts. Members can still turn their own email off."
  },
  {
    value: "ONLY_ALERTS",
    label: "Only squadron alerts",
    detail: "No automated email at all. A staff member can still send an alert and it will reach people."
  },
  {
    value: "NOTHING",
    label: "Nothing at all",
    detail: "The Hub sends no email to members. Alerts will not reach anybody either — say it another way."
  }
];

export async function notificationLevel(): Promise<NotificationLevel> {
  try {
    const row = await getDatabase()
      .prepare("SELECT value FROM hub_settings WHERE key = ?")
      .bind(KEY)
      .first<{ value: string }>();
    const said = row?.value as NotificationLevel | undefined;
    return said === "ONLY_ALERTS" || said === "NOTHING" || said === "EVERYTHING" ? said : DEFAULT;
  } catch {
    // A missing table or an unreadable row must not silence the squadron. The default is to send.
    return DEFAULT;
  }
}

export async function setNotificationLevel(level: NotificationLevel, userId: string): Promise<void> {
  const now = new Date().toISOString();
  await getDatabase()
    .prepare(
      "INSERT INTO hub_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at"
    )
    .bind(KEY, level, userId, now)
    .run();
}

/** Whether a message of this kind may be sent under the current setting. */
export function allowed(level: NotificationLevel, purpose: MailPurpose): boolean {
  if (purpose === "TRANSACTIONAL") return true;
  if (level === "NOTHING") return false;
  if (level === "ONLY_ALERTS") return purpose === "ALERT";
  return true;
}

/** Said to whoever is looking at a page, so a held-back message is explained rather than merely absent. */
export function whyHeldBack(level: NotificationLevel): string {
  return level === "NOTHING"
    ? "Email to members is switched off for the whole squadron, so nothing was sent."
    : "Automated email is switched off for the whole squadron, so nothing was sent. It is still in the Hub.";
}

// ---------------------------------------------------------------- the member's own answer

/**
 * FOLLOW: whatever the squadron is doing, which is where everybody starts.
 * ALWAYS: email me even when the squadron has switched it off.
 * NEVER:  do not email me even when the squadron has it on.
 */
export type MemberChoice = "FOLLOW" | "ALWAYS" | "NEVER";

export const MEMBER_CHOICES: Array<{ value: MemberChoice; label: string; detail: string }> = [
  { value: "FOLLOW", label: "Whatever the squadron is doing", detail: "The usual. If command turns email off for everybody, yours goes quiet too." },
  { value: "ALWAYS", label: "Always email me", detail: "You get the daily summary even when the squadron has email switched off." },
  { value: "NEVER", label: "Never email me", detail: "Nothing by email, ever. Everything still appears on this page." }
];

export async function memberChoice(userId: string): Promise<MemberChoice> {
  try {
    const row = await getDatabase()
      .prepare("SELECT email_choice FROM notification_prefs WHERE user_id = ?")
      .bind(userId)
      .first<{ email_choice: string }>();
    const said = row?.email_choice as MemberChoice | undefined;
    return said === "ALWAYS" || said === "NEVER" ? said : "FOLLOW";
  } catch {
    return "FOLLOW";
  }
}

export async function setMemberChoice(userId: string, choice: MemberChoice): Promise<void> {
  const now = new Date().toISOString();
  await getDatabase()
    .prepare(
      "INSERT INTO notification_prefs (user_id, email_choice, email_enabled, updated_at) VALUES (?, ?, ?, ?) " +
      // email_enabled is kept in step rather than left behind, because it is still read elsewhere - including
      // by the notifier worker - and two columns that disagree about the same question is how a member ends up
      // being emailed by one code path and not another.
      "ON CONFLICT(user_id) DO UPDATE SET email_choice = excluded.email_choice, " +
      "email_enabled = excluded.email_enabled, updated_at = excluded.updated_at"
    )
    .bind(userId, choice, choice === "NEVER" ? 0 : 1, now)
    .run();
}

/**
 * Whether this particular member may be emailed this particular kind of message.
 *
 * The member's answer wins in both directions, which is the point: a squadron-wide switch that a member cannot
 * opt back into is one person's complaint imposed on everybody, and one they cannot opt out of is no answer to
 * the complaint at all.
 *
 * ALWAYS does not override NOTHING for an alert, and that is deliberate - see below.
 */
export async function mayEmail(userId: string | null, purpose: MailPurpose): Promise<boolean> {
  if (purpose === "TRANSACTIONAL") return true;

  const level = await notificationLevel();
  if (!userId) return allowed(level, purpose);

  const choice = await memberChoice(userId);
  if (choice === "NEVER") return false;
  if (choice === "ALWAYS") return true;
  return allowed(level, purpose);
}

/** Why nothing was sent to this member, for a page that has to explain itself. */
export async function whyNotSent(userId: string | null): Promise<string> {
  const choice = userId ? await memberChoice(userId) : "FOLLOW";
  if (choice === "NEVER") return "You have asked not to be emailed. Everything still appears here.";
  return whyHeldBack(await notificationLevel());
}
