import Image from "next/image";
import { Check, ExternalLink, FolderLock, ShieldCheck } from "lucide-react";

export function LoginForm({ error }: { error?: string }) {
  return (
    <section className="auth-shell">
      <aside className="auth-brand-panel">
        <div className="auth-brand">
          <Image src="/tn170-logo.png" alt="TN-170 emblem" width={64} height={64} priority />
          <div>
            <strong>TN-170 Oak Ridge</strong>
            <span>Composite Squadron</span>
          </div>
        </div>

        <div className="auth-brand-copy">
          <p>Squadron Operations Hub</p>
          <h1>One secure home for squadron operations.</h1>
          <span>Documents, staff workflows, readiness, and communications—connected through the tools our members already use.</span>
        </div>

        <ul className="auth-assurance-list">
          <li><Check size={16} /> Google-verified identity</li>
          <li><Check size={16} /> Existing Shared Drive permissions</li>
          <li><Check size={16} /> Hub-specific role controls</li>
        </ul>

        <div className="auth-brand-footer">
          <ShieldCheck size={17} />
          <span>TN-170 systems • Authorized members only</span>
        </div>
      </aside>

      <div className="auth-form">
        <div className="auth-icon"><FolderLock size={25} /></div>
        <div className="auth-heading">
          <p className="auth-eyebrow">Member access</p>
          <h2>Welcome to the Hub</h2>
          <p className="auth-description">Sign in with the verified Google account that has access to the TN-170 Shared Drive.</p>
        </div>

        {error ? <div className="auth-message" role="alert">{errorMessage(error)}</div> : null}

        <a className="auth-google-button" href="/api/auth/google/start">
          <GoogleMark />
          <span>Continue with Google</span>
          <ExternalLink size={16} />
        </a>

        <div className="auth-access-note">
          <ShieldCheck size={18} />
          <p><strong>Access follows Google Drive.</strong><span>If your account cannot open the squadron Shared Drive, ask command staff to grant access there.</span></p>
        </div>

        <p className="auth-footer-copy">By continuing, you agree to use this system only for authorized Civil Air Patrol activities.</p>
      </div>
    </section>
  );
}

function GoogleMark() {
  return (
    <svg className="auth-google-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.39 13.93A6.02 6.02 0 0 1 6.08 12c0-.67.11-1.32.31-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.55l3.35-2.62Z" />
      <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z" />
    </svg>
  );
}

function errorMessage(error: string): string {
  if (error === "unverified") return "Google could not verify this account's email address.";
  if (error === "drive_access") return "Google denied access to the squadron Shared Drive. Ask squadron command staff to grant access through Google Drive.";
  if (error === "google_denied") return "Google sign-in was canceled or denied.";
  if (error === "configuration") return "Google sign-in is not configured.";
  return "Google sign-in could not be completed. Please try again.";
}
