import { getUserGoogleAccessToken, hasGmailReadScope, hasGmailScope, storedScopesFor } from "@/lib/auth/google-oauth";

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

// ---------------------------------------------------------------- reading

// The label a member puts on mail they want the Hub to look at. Everything else is left alone.
export const HUB_LABEL = "Hub";

export interface MailMessage {
  id: string;
  from: string;
  subject: string;
  date: string;
  body: string;
}

export async function canRead(userId: string): Promise<boolean> {
  return hasGmailReadScope(await storedScopesFor(userId));
}

function headerValue(headers: Array<{ name?: string; value?: string }>, wanted: string): string {
  return headers.find((header) => (header.name ?? "").toLowerCase() === wanted)?.value ?? "";
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

function plainTextFrom(part: GmailPart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64Url(part.body.data);
  for (const child of part.parts ?? []) {
    const found = plainTextFrom(child);
    if (found) return found;
  }
  // A message with no plain part at all is better read as stripped HTML than not at all.
  if (part.mimeType === "text/html" && part.body?.data) {
    return decodeBase64Url(part.body.data).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  }
  return "";
}

/** The messages a member has labelled for the Hub. Nothing else in the mailbox is opened. */
export async function listLabelledMail(userId: string, label = HUB_LABEL, limit = 10): Promise<MailMessage[]> {
  if (!(await canRead(userId))) throw new Error("Connect Gmail reading in My connections first.");
  const token = await getUserGoogleAccessToken(userId);
  const headers = { Authorization: "Bearer " + token };

  const query = new URLSearchParams({ q: "label:" + label, maxResults: String(limit) });
  const listResponse = await fetch(GMAIL_API + "/users/me/messages?" + query, { headers });
  if (!listResponse.ok) {
    if (listResponse.status === 403) throw new Error("Google refused. Reconnect Gmail reading in My connections.");
    throw new Error("Your mail could not be read just now.");
  }
  const listed = await listResponse.json<{ messages?: Array<{ id: string }> }>();

  const messages: MailMessage[] = [];
  for (const entry of listed.messages ?? []) {
    const detail = await fetch(GMAIL_API + "/users/me/messages/" + entry.id + "?format=full", { headers });
    if (!detail.ok) continue;
    const payload = await detail.json<{ payload?: GmailPart & { headers?: Array<{ name?: string; value?: string }> }; internalDate?: string }>();
    const mailHeaders = payload.payload?.headers ?? [];
    messages.push({
      id: entry.id,
      from: headerValue(mailHeaders, "from"),
      subject: headerValue(mailHeaders, "subject") || "(no subject)",
      date: payload.internalDate ? new Date(Number(payload.internalDate)).toISOString() : "",
      body: plainTextFrom(payload.payload).slice(0, 4000)
    });
  }
  return messages;
}
