import { getCloudflareEnv } from "@/lib/cloudflare";

interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendMagicLinkEmail(input: {
  to: string;
  name: string;
  link: string;
  expiresMinutes: number;
}): Promise<boolean> {
  return sendEmail({
    to: input.to,
    subject: "Your secure Squadron Operations Hub sign-in link",
    text: `Hello ${input.name},\n\nUse this one-time link to sign in:\n${input.link}\n\nThis link expires in ${input.expiresMinutes} minutes and can only be used once. If you did not request it, ignore this message.`,
    html: `<p>Hello ${escapeHtml(input.name)},</p><p>Use the button below to sign in to Squadron Operations Hub.</p><p><a href="${escapeHtml(input.link)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#2f68ed;color:#fff;text-decoration:none;font-weight:700">Sign in securely</a></p><p>This one-time link expires in ${input.expiresMinutes} minutes. If you did not request it, ignore this message.</p>`
  });
}

export async function sendAccessRequestNotification(input: {
  applicantName: string;
  applicantEmail: string;
  capid?: string;
  dutyTitle?: string;
}): Promise<void> {
  const env = getCloudflareEnv();
  const recipients = (env.APPROVER_NOTIFICATION_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!recipients.length) return;

  await Promise.all(
    recipients.map((recipient) =>
      sendEmail({
        to: recipient,
        subject: `Access request from ${input.applicantName}`,
        text: `${input.applicantName} (${input.applicantEmail}) requested access to Squadron Operations Hub. CAPID: ${input.capid ?? "Not provided"}. Duty position: ${input.dutyTitle ?? "Not provided"}.`,
        html: `<p><strong>${escapeHtml(input.applicantName)}</strong> requested access to Squadron Operations Hub.</p><ul><li>Email: ${escapeHtml(input.applicantEmail)}</li><li>CAPID: ${escapeHtml(input.capid ?? "Not provided")}</li><li>Duty position: ${escapeHtml(input.dutyTitle ?? "Not provided")}</li></ul>`
      })
    )
  );
}

export async function sendApprovalEmail(input: { to: string; name: string }): Promise<void> {
  const env = getCloudflareEnv();
  const loginUrl = `${env.APP_URL.replace(/\/$/, "")}/login`;
  await sendEmail({
    to: input.to,
    subject: "Your Squadron Operations Hub access was approved",
    text: `Hello ${input.name},\n\nYour account was approved. Request a secure sign-in link at ${loginUrl}`,
    html: `<p>Hello ${escapeHtml(input.name)},</p><p>Your Squadron Operations Hub access request was approved.</p><p><a href="${escapeHtml(loginUrl)}">Request a secure sign-in link</a></p>`
  });
}

async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const env = getCloudflareEnv();
  if (!env.MAILGUN_API_KEY || !env.MAILGUN_DOMAIN || !env.EMAIL_FROM) return false;

  const body = new FormData();
  body.set("from", env.EMAIL_FROM);
  body.set("to", input.to);
  body.set("subject", input.subject);
  body.set("text", input.text);
  body.set("html", input.html);

  const authorization = btoa(`api:${env.MAILGUN_API_KEY}`);
  const response = await fetch(`https://api.mailgun.net/v3/${env.MAILGUN_DOMAIN}/messages`, {
    method: "POST",
    headers: { Authorization: `Basic ${authorization}` },
    body
  });

  if (!response.ok) {
    console.error("Mailgun send failed", response.status, await response.text());
    return false;
  }
  return true;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    };
    return replacements[character] ?? character;
  });
}
