"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { BadgeCheck, Mail, UserRound } from "lucide-react";
import { TurnstileWidget } from "./turnstile-widget";

export function RequestAccessForm({ turnstileSiteKey }: { turnstileSiteKey?: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await fetch("/api/access/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: data.get("fullName"),
        email: data.get("email"),
        capid: data.get("capid"),
        dutyTitle: data.get("dutyTitle"),
        note: data.get("note"),
        turnstileToken: data.get("cf-turnstile-response")
      })
    });
    const result = (await response.json()) as { message?: string };
    setMessage(result.message ?? "Your request was submitted for review.");
    if (response.ok) form.reset();
    setSubmitting(false);
  }

  return (
    <form className="auth-form auth-form--wide" onSubmit={submit}>
      <div className="auth-icon"><BadgeCheck size={26} /></div>
      <div>
        <p className="auth-eyebrow">Manual approval required</p>
        <h1>Request access</h1>
        <p className="auth-description">New accounts are not created automatically. Tristan Maratos, Steven Mellard, or another authorized account approver must verify and approve the request.</p>
      </div>
      <div className="auth-form-grid">
        <label>
          Full name
          <span className="auth-input"><UserRound size={17} /><input name="fullName" required minLength={2} maxLength={120} /></span>
        </label>
        <label>
          Email address
          <span className="auth-input"><Mail size={17} /><input name="email" type="email" autoComplete="email" required /></span>
        </label>
        <label>CAPID<input name="capid" inputMode="numeric" maxLength={12} /></label>
        <label>Duty position or role<input name="dutyTitle" maxLength={120} /></label>
      </div>
      <label>Reason for access or note<textarea name="note" rows={4} maxLength={1000} /></label>
      <TurnstileWidget siteKey={turnstileSiteKey} />
      <button className="button button--primary auth-submit" disabled={submitting} type="submit">{submitting ? "Submitting…" : "Submit for approval"}</button>
      {message ? <div className="auth-message" role="status">{message}</div> : null}
      <p className="auth-footer-copy">Already approved? <Link href="/login">Sign in</Link></p>
    </form>
  );
}
