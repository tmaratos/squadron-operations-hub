import { getCloudflareEnv } from "@/lib/cloudflare";
import { mayEmail, whyNotSent, type MailPurpose } from "./squadron-switch";

// Sending email from the Hub itself, so "as things happen" means now rather than at the next quarter hour,
// and so a member can prove their setup works without waiting for tomorrow morning.
// The notifier worker carries the same providers; whichever key is set is the one used.

export interface MailNotice {
  title: string;
  body?: string | null;
  url?: string | null;
}

export async function sendMail(input: {
  to: string[];
  subject: string;
  name?: string;
  notices: MailNotice[];
  /**
   * What this message is for. Left out it counts as a notification, which is the cautious reading: a caller
   * added later and not thought about here is held back by the squadron switch rather than escaping it.
   */
  purpose?: MailPurpose;
  /**
   * Whose message this is. Given it, that member's own answer decides - which is the whole point of letting
   * somebody opt back in to email the squadron has switched off, or out of email it has switched on.
   *
   * Left out, only the squadron setting applies. That is right for the few messages addressed to somebody the
   * Hub has no account for, such as a post holder reached at their CAP address.
   */
  forUserId?: string | null;
}): Promise<{ ok: boolean; provider: string | null; error: string | null; heldBack?: boolean }> {
  const env = getCloudflareEnv();
  const from = env.NOTIFY_FROM;
  if (!from) return { ok: false, provider: null, error: "No sending address is configured yet." };
  if (!input.to.length) return { ok: false, provider: null, error: "There is nowhere to send it." };

  // The squadron-wide switch, checked in the one place every message passes through rather than at each of
  // the five call sites - a rule enforced in five places is a rule with five chances to be forgotten.
  const purpose = input.purpose ?? "NOTIFICATION";
  if (!(await mayEmail(input.forUserId ?? null, purpose))) {
    // Not an error. Nothing went wrong and nothing should be retried; this was asked for, by the squadron or
    // by the member themselves.
    return { ok: false, provider: null, error: await whyNotSent(input.forUserId ?? null), heldBack: true };
  }

  const html = renderEmail(input.name ?? "", input.notices);
  const text = input.notices.map((notice) => "- " + notice.title + (notice.url ? "\n  " + notice.url : "")).join("\n\n");

  if (env.RESEND_API_KEY) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: input.to, subject: input.subject, html, text })
    });
    if (response.ok) return { ok: true, provider: "resend", error: null };
    return { ok: false, provider: "resend", error: (await response.text()).slice(0, 300) };
  }

  if (env.BREVO_API_KEY) {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: { email: addressOf(from), name: nameOf(from) },
        to: input.to.map((address) => ({ email: address })),
        subject: input.subject,
        htmlContent: html,
        textContent: text
      })
    });
    if (response.ok) return { ok: true, provider: "brevo", error: null };
    return { ok: false, provider: "brevo", error: (await response.text()).slice(0, 300) };
  }

  return { ok: false, provider: null, error: "Email is not switched on yet. An administrator needs to add the sending key." };
}

export function mailConfigured(): boolean {
  const env = getCloudflareEnv();
  return Boolean(env.NOTIFY_FROM && (env.RESEND_API_KEY || env.BREVO_API_KEY));
}

function renderEmail(name: string, notices: MailNotice[]): string {
  const appUrl = (getCloudflareEnv().APP_URL || "").replace(/\/+$/, "");
  const rows = notices.map((notice) => `
    <tr><td style="padding:12px 0;border-bottom:1px solid #e7ebf2">
      <div style="font:600 15px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif;color:#122247">${escapeHtml(notice.title)}</div>
      ${notice.body ? `<div style="font:14px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;color:#52514e;margin-top:3px">${escapeHtml(notice.body)}</div>` : ""}
      ${notice.url ? `<a href="${escapeHtml(notice.url)}" style="font:600 13px system-ui,sans-serif;color:#7b68ee;text-decoration:none">Open it &rarr;</a>` : ""}
    </td></tr>`).join("");

  return `<!doctype html><html><body style="margin:0;background:#f5f6f8;padding:24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:12px;padding:24px" cellpadding="0" cellspacing="0">
      <tr><td style="font:700 17px system-ui,-apple-system,'Segoe UI',sans-serif;color:#122247;padding-bottom:4px">TN-170 Operations Hub</td></tr>
      <tr><td style="font:14px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;color:#52514e;padding-bottom:8px">${escapeHtml(name)}, here is what needs you.</td></tr>
      ${rows}
      <tr><td style="padding-top:18px;font:12px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;color:#898781">
        You are getting this because you are assigned this work in the Hub.
        <a href="${appUrl}/notifications" style="color:#898781">Change what you get emailed about</a>.
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function addressOf(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return match ? match[1] : value.trim();
}

function nameOf(value: string): string {
  const match = value.match(/^\s*"?([^"<]+?)"?\s*</);
  return match ? match[1].trim() : "Squadron Operations Hub";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] as string);
}
