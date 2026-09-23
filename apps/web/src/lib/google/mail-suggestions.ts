import { parseJsonReply } from "@/lib/ai/local";
import { aiChatFor } from "@/lib/ai/provider";
import { listLabelledMail, type MailMessage } from "./gmail";

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

export async function suggestFromMail(userId: string, label?: string): Promise<{ suggestions: MailSuggestion[]; read: number }> {
  const messages = await listLabelledMail(userId, label);
  if (!messages.length) return { suggestions: [], read: 0 };

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
