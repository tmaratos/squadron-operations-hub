import type { AuthUser, Env } from "./types";
import { HttpError } from "./utils";

export async function sendMagicLink(env: Env, user: AuthUser, link: string): Promise<void> {
  if (env.MAIL_MODE === "log") {
    console.log(`Magic link for ${user.email}: ${link}`);
    return;
  }

  if (!env.MAILGUN_API_KEY || !env.MAILGUN_DOMAIN || !env.MAIL_FROM) {
    throw new HttpError(500, "Email delivery is not configured.");
  }

  const form = new FormData();
  form.set("from", env.MAIL_FROM);
  form.set("to", `${user.fullName} <${user.email}>`);
  form.set("subject", "Your TN-170 Squadron Operations Hub sign-in link");
  form.set("text", [
    `Hello ${user.rank} ${user.fullName},`,
    "",
    "Use the secure link below to sign in to the TN-170 Squadron Operations Hub.",
    link,
    "",
    "The link expires in 15 minutes and can only be used once.",
    "If you did not request this link, you can ignore this message."
  ].join("\n"));
  form.set("html", `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#172033">
      <h2>TN-170 Squadron Operations Hub</h2>
      <p>Hello ${escapeHtml(user.rank)} ${escapeHtml(user.fullName)},</p>
      <p>Use the secure button below to sign in. This link expires shortly and can only be used once.</p>
      <p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:white;text-decoration:none;border-radius:7px">Sign in securely</a></p>
      <p style="color:#667085;font-size:13px">If you did not request this link, no action is required.</p>
    </div>
  `);

  const base = env.MAILGUN_BASE_URL || "https://api.mailgun.net";
  const response = await fetch(`${base}/v3/${encodeURIComponent(env.MAILGUN_DOMAIN)}/messages`, {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`api:${env.MAILGUN_API_KEY}`)}`
    },
    body: form
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("Mailgun delivery failed", response.status, detail);
    throw new HttpError(502, "The sign-in email could not be delivered.");
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character] || character);
}
