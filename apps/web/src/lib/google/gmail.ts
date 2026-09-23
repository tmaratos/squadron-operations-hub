import { getUserGoogleAccessToken, hasGmailScope, storedScopesFor } from "@/lib/auth/google-oauth";

// Writing a message into the member's own Gmail drafts. Deliberately drafts only: the Hub composes, a
// person reads it and presses send. Nothing leaves the squadron without someone having looked at it.

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";

export async function canDraft(userId: string): Promise<boolean> {
  return hasGmailScope(await storedScopesFor(userId));
}

function encodeHeader(value: string): string {
  // Anything beyond plain ASCII has to be encoded, or the subject arrives as mojibake.
  return /^[\x20-\x7E]*$/.test(value)
    ? value
    : "=?UTF-8?B?" + btoa(String.fromCharCode(...new TextEncoder().encode(value))) + "?=";
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createGmailDraft(input: {
  userId: string;
  to: string[];
  subject: string;
  body: string;
}): Promise<{ draftId: string; url: string }> {
  if (!(await canDraft(input.userId))) {
    throw new Error("Connect Gmail in My connections first.");
  }
  const token = await getUserGoogleAccessToken(input.userId);
  const message = [
    "To: " + input.to.join(", "),
    "Subject: " + encodeHeader(input.subject),
    "Content-Type: text/plain; charset=UTF-8",
    "",
    input.body
  ].join("\r\n");

  const response = await fetch(GMAIL_API + "/users/me/drafts", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { raw: toBase64Url(message) } })
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(response.status === 403 ? "Google refused the draft. Reconnect Gmail in My connections." : "The draft could not be created. " + detail);
  }
  const payload = await response.json<{ id?: string; message?: { id?: string } }>();
  const draftId = payload.id ?? payload.message?.id ?? "";
  return { draftId, url: "https://mail.google.com/mail/u/0/#drafts" };
}
