import { parseJsonReply } from "@/lib/ai/local";
import { aiChatFor } from "@/lib/ai/provider";
import { canRead, listMailForToken, type MailMessage, type ScanMode } from "./gmail";
import { getUserGoogleAccessToken } from "@/lib/auth/google-oauth";
import { accessTokenFor, listMailAccounts } from "@/lib/google/mail-accounts";
import { getCloudflareEnv, getDatabase } from "@/lib/cloudflare";

// Reading squadron mail and saying what it thinks needs doing. Suggestions only: nothing is created until
// a member presses Add. The email it came from is always shown alongside, so a wrong reading is obvious
// rather than quietly becoming a task nobody can trace.

export interface MailSuggestion {
  messageId: string;
  from: string;
  subject: string;
  date: string;
  /** A short quote from the mail that the suggestion rests on, so the member can check it at a glance. */
  because: string;
  title: string;
  dueOn: string | null;
  /** False when the assistant read the mail and concluded there is nothing to do. */
  actionable: boolean;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Mail the Hub sent, which it must not read back.
 *
 * It was reading its own deadline reminders and offering to make a task of the thing the reminder was
 * about - work that already exists, which is what the reminder was reminding somebody of. An assistant
 * listening to its own echo.
 */
function fromTheHub(message: MailMessage): boolean {
  const env = getCloudflareEnv() as unknown as { NOTIFY_FROM?: string };
  const sender = (message.from ?? "").toLowerCase();
  const ours = (env.NOTIFY_FROM ?? "").toLowerCase();
  const address = ours.includes("<") ? ours.slice(ours.indexOf("<") + 1, ours.indexOf(">")) : ours;
  if (address && sender.includes(address)) return true;
  // Whatever it is called, mail from the Hub about the Hub is the Hub talking to itself.
  return sender.includes("hub@") && sender.includes("tristanmaratos.com");
}

/**
 * What a member has asked the Hub to read.
 *
 * Unread mail is where everybody starts, because it is the narrowest of the three and the closest to the
 * question somebody actually has. The wider two are chosen, never arrived at.
 */
export type { ScanMode };

export async function getScanMode(userId: string): Promise<ScanMode> {
  try {
    const row = await getDatabase()
      .prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'mail_scan'")
      .bind(userId)
      .first<{ value: string }>();
    return row?.value === "INBOX" ? "INBOX" : row?.value === "ALL" ? "ALL" : "UNREAD";
  } catch {
    return "UNREAD";
  }
}

export async function setScanMode(userId: string, mode: ScanMode): Promise<void> {
  await getDatabase()
    .prepare(
      "INSERT INTO user_settings (user_id, key, value, updated_at) VALUES (?, 'mail_scan', ?, ?) " +
      "ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
    .bind(userId, mode, new Date().toISOString())
    .run();
}

/**
 * Every mailbox the member has connected, read in one go.
 *
 * The account they signed in with counts as one of them. A mailbox whose permission has lapsed at Google's
 * end is skipped rather than allowed to stop the others - one dead connection should not make the Hub go
 * quiet about the two that still work.
 */
async function everyMailbox(userId: string, mode: ScanMode): Promise<MailMessage[]> {
  const perMailbox = mode === "ALL" ? 40 : 20;
  const messages: MailMessage[] = [];

  if (await canRead(userId).catch(() => false)) {
    try {
      const token = await getUserGoogleAccessToken(userId);
      messages.push(...await listMailForToken(token, mode, perMailbox));
    } catch {
      // The signed-in account cannot be read just now. The others still can.
    }
  }

  for (const account of await listMailAccounts(userId)) {
    try {
      const token = await accessTokenFor(userId, account.id);
      if (!token) continue;
      messages.push(...await listMailForToken(token, mode, perMailbox));
    } catch {
      continue;
    }
  }

  // The same message can arrive in two connected mailboxes. Read it once.
  const seen = new Set<string>();
  return messages.filter((message) => {
    if (seen.has(message.id)) return false;
    seen.add(message.id);
    return true;
  });
}

export async function suggestFromMail(userId: string): Promise<{ suggestions: MailSuggestion[]; read: number }> {
  const mode = await getScanMode(userId);
  const all = await everyMailbox(userId, mode);
  const messages = all.filter((message) => !fromTheHub(message));
  if (!messages.length) return { suggestions: [], read: all.length };

  const suggestions: MailSuggestion[] = [];
  for (const message of messages) {
    const suggestion = await readOne(userId, message);
    if (suggestion) suggestions.push(suggestion);
  }
  return { suggestions, read: messages.length };
}

async function readOne(userId: string, message: MailMessage): Promise<MailSuggestion | null> {
  const system = [
    "You read one email for a Civil Air Patrol squadron and say whether it asks somebody to do something.",
    'Reply with JSON only: {"actionable": true|false, "title": "...", "dueOn": "YYYY-MM-DD" or null, "because": "<a short quote from the email>"}.',
    "Rules:",
    "- title is what a person must DO, in plain words, starting with a verb. Not the subject line.",
    "- dueOn only when the email states or clearly implies a date. Never guess one.",
    "- because must be words that actually appear in the email.",
    "- Newsletters, receipts, confirmations and thank-yous are not actionable.",
    "Today is " + today() + "."
  ].join("\n");

  const content = ["From: " + message.from, "Subject: " + message.subject, "", message.body.slice(0, 3000)].join("\n");

  try {
    const raw = await aiChatFor(userId, [
      { role: "system", content: system },
      { role: "user", content }
    ], { json: true, maxTokens: 300 });

    const parsed = parseJsonReply<{ actionable?: unknown; title?: unknown; dueOn?: unknown; because?: unknown }>(raw, {});
    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    const actionable = parsed.actionable === true && title.length > 2;
    const dueOn = typeof parsed.dueOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dueOn) ? parsed.dueOn : null;
    // A quote that is not in the email is a sign the model is inventing; drop it rather than show it.
    const quoted = typeof parsed.because === "string" ? parsed.because.trim().slice(0, 200) : "";
    const because = quoted && message.body.toLowerCase().includes(quoted.slice(0, 40).toLowerCase()) ? quoted : "";

    return {
      messageId: message.id,
      from: message.from,
      subject: message.subject,
      date: message.date,
      because,
      title: actionable ? title.slice(0, 300) : "",
      dueOn,
      actionable
    };
  } catch {
    // One unreadable message should not stop the rest.
    return null;
  }
}
