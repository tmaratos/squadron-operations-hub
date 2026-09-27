import { parseJsonReply } from "@/lib/ai/local";
import { aiChatFor } from "@/lib/ai/provider";
import { canRead, listMailForToken, type MailMessage, type ScanMode } from "./gmail";
import { getUserGoogleAccessToken } from "@/lib/auth/google-oauth";
import { accessTokenFor, listMailAccounts } from "@/lib/google/mail-accounts";
import { listMicrosoftMail } from "@/lib/microsoft/graph";
import { dateIsInTheText } from "./dated";
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
  /** True only when that date is in the email's own words. Nothing is created unasked without it. */
  dueVerified: boolean;
  /** The email's worldwide id, the same in every member's copy of a message sent to several of them. */
  internetId: string;
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
  const howMany = (of: ScanMode) => (of === "ALL" ? 40 : 20);
  const messages: MailMessage[] = [];

  if (await canRead(userId).catch(() => false)) {
    try {
      const token = await getUserGoogleAccessToken(userId);
      messages.push(...await listMailForToken(token, mode, howMany(mode)));
    } catch {
      // The signed-in account cannot be read just now. The others still can.
    }
  }

  for (const account of await listMailAccounts(userId)) {
    try {
      const token = await accessTokenFor(userId, account.id);
      if (!token) continue;
      // Each mailbox is read as much as it has been told to be.
      //
      // A CAP address and somebody's personal mail do not deserve the same treatment: one is worth reading
      // every folder of, the other mostly is not. A mailbox nobody has decided about follows the member's
      // own default, which is what the single setting used to do for all of them.
      const its = account.scanMode ?? mode;
      messages.push(...(account.provider === "MICROSOFT"
        ? await listMicrosoftMail(token, its, howMany(its))
        : await listMailForToken(token, its, howMany(its))));
    } catch {
      continue;
    }
  }

  // The same message can arrive in two connected mailboxes. Read it once.
  //
  // Matched on the Message-ID where there is one, because a member with a CAP address and a personal one
  // that both receive squadron mail holds two copies of it with different per-mailbox ids. Falling back to
  // the per-mailbox id keeps the old behaviour for mail that states no Message-ID.
  const seen = new Set<string>();
  return messages.filter((message) => {
    const key = message.internetId || message.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function suggestFromMail(userId: string): Promise<{ suggestions: MailSuggestion[]; read: number }> {
  const mode = await getScanMode(userId);
  const all = await everyMailbox(userId, mode);
  const messages = all.filter((message) => !fromTheHub(message));
  if (!messages.length) return { suggestions: [], read: all.length };

  // Read several to a request, and a few requests at once.
  //
  // One message per request meant thirty-nine emails took two and a half minutes, nearly all of it spent
  // waiting. That was tolerable while the scan only ever looked at unread mail; it is not once members ask
  // for every folder, and it is what stands between the squadron and reading further back than ninety days.
  //
  // What it must not cost is accuracy. Every answer is still checked against the one message it claims to be
  // about - the quote has to appear in that message and the date has to be in that message's words - so an
  // assistant that muddles two emails in one prompt produces an answer that fails its own check rather than
  // a task about the wrong thing.
  const batches: MailMessage[][] = [];
  for (let at = 0; at < messages.length; at += PER_REQUEST) {
    batches.push(messages.slice(at, at + PER_REQUEST));
  }

  const suggestions: MailSuggestion[] = [];
  for (let at = 0; at < batches.length; at += AT_ONCE) {
    const answered = await Promise.all(
      batches.slice(at, at + AT_ONCE).map((batch) => readBatch(userId, batch).catch(() => []))
    );
    answered.forEach((found) => suggestions.push(...found));
  }
  return { suggestions, read: messages.length };
}

/** How many emails go in one request, and how many of those requests run at once. */
const PER_REQUEST = 6;
const AT_ONCE = 3;

/**
 * Reads a handful of emails in one request and returns what each of them asks for.
 *
 * The emails are numbered in the prompt and the answers come back carrying those numbers, so an answer can
 * be tied to the message it belongs to. Anything referring to a number that was not sent is dropped: that is
 * the shape a muddled answer takes, and there is no safe way to guess which email it meant.
 */
async function readBatch(userId: string, batch: MailMessage[]): Promise<MailSuggestion[]> {
  const system = [
    "You read a squadron's emails and say, for each one, whether it asks somebody to do something.",
    "The emails are numbered. Answer about every one of them, using its number.",
    'Reply with JSON only: {"emails": [{"n": 1, "actionable": true|false, "title": "...", "dueOn": "YYYY-MM-DD" or null, "because": "<a short quote from that email>"}]}',
    "Rules:",
    "- title is what a person must DO, in plain words, starting with a verb. Not the subject line.",
    "- dueOn only when that email states or clearly implies a date. Never guess one.",
    "- because must be words that actually appear in that same email.",
    "- Never mix details between the emails. Each answer is about its own number only.",
    "- Newsletters, receipts, confirmations and thank-yous are not actionable.",
    "Today is " + today() + "."
  ].join("\n");

  const content = batch
    .map((message, at) => [
      "### Email " + (at + 1),
      "From: " + message.from,
      "Subject: " + message.subject,
      "",
      // Shorter than a single-message read, because several share the request. The parts of an email that
      // ask for something are near the top; what is cut is usually signatures and quoted history.
      message.body.slice(0, 1500)
    ].join("\n"))
    .join("\n\n");

  const raw = await aiChatFor(userId, [
    { role: "system", content: system },
    { role: "user", content }
  ], { json: true, maxTokens: 220 * batch.length });

  const parsed = parseJsonReply<{ emails?: unknown }>(raw, {});
  const answers = Array.isArray(parsed.emails) ? parsed.emails : [];

  const out: MailSuggestion[] = [];
  for (const answer of answers) {
    if (!answer || typeof answer !== "object") continue;
    const said = answer as { n?: unknown; actionable?: unknown; title?: unknown; dueOn?: unknown; because?: unknown };

    // The number has to be one that was sent. An answer about email 9 in a batch of six is the assistant
    // losing track, and there is nothing sensible to do with it.
    const n = typeof said.n === "number" ? said.n : Number(said.n);
    const message = Number.isInteger(n) && n >= 1 && n <= batch.length ? batch[n - 1] : null;
    if (!message) continue;

    const title = typeof said.title === "string" ? said.title.trim() : "";
    const actionable = said.actionable === true && title.length > 2;
    const dueOn = typeof said.dueOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(said.dueOn) ? said.dueOn : null;

    // Checked against this message, not the batch. A quote or a date borrowed from the email next to it in
    // the prompt fails here, which is the whole reason reading several at once is safe to do.
    const quoted = typeof said.because === "string" ? said.because.trim().slice(0, 200) : "";
    const because = quoted && message.body.toLowerCase().includes(quoted.slice(0, 40).toLowerCase()) ? quoted : "";
    const dueVerified = dueOn ? dateIsInTheText(dueOn, message.subject + "|" + message.body) : false;

    out.push({
      messageId: message.id,
      from: message.from,
      subject: message.subject,
      date: message.date,
      because,
      title: actionable ? title.slice(0, 300) : "",
      dueOn,
      dueVerified,
      internetId: message.internetId,
      actionable
    });
  }
  return out;
}

