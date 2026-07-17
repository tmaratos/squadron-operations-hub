"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Mail, ShieldCheck } from "lucide-react";
import { TurnstileWidget } from "./turnstile-widget";

export function LoginForm({ turnstileSiteKey }: { turnstileSiteKey?: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [debugLink, setDebugLink] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setDebugLink(null);

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formData.get("email"),
        turnstileToken: formData.get("cf-turnstile-response")
      })
    });
    const result = (await response.json()) as { message?: string; debugLink?: string };
    setMessage(result.message ?? "Check your email for a secure sign-in link.");
    setDebugLink(result.debugLink ?? null);
    setSubmitting(false);
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <div className="auth-icon"><ShieldCheck size={26} /></div>
      <div>
        <p className="auth-eyebrow">Approved members only</p>
        <h1>Sign in securely</h1>
        <p className="auth-description">Enter your approved email address. We will send a single-use sign-in link. No password is stored.</p>
      </div>
      <label>
        Email address
        <span className="auth-input"><Mail size={17} /><input name="email" type="email" autoComplete="email" required placeholder="name@tncap.us" /></span>
      </label>
      <TurnstileWidget siteKey={turnstileSiteKey} />
      <button className="button button--primary auth-submit" disabled={submitting} type="submit">
        {submitting ? "Sending…" : "Send secure sign-in link"}
      </button>
      {message ? <div className="auth-message" role="status">{message}</div> : null}
      {debugLink ? <a className="auth-debug-link" href={debugLink}>Development sign-in link</a> : null}
      <p className="auth-footer-copy">Not approved yet? <Link href="/request-access">Request access</Link></p>
    </form>
  );
}
