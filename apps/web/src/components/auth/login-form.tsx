import { ShieldCheck } from "lucide-react";

export function LoginForm({ error }: { error?: string }) {
  return (
    <div className="auth-form">
      <div className="auth-icon"><ShieldCheck size={26} /></div>
      <div>
        <p className="auth-eyebrow">CAP members only</p>
        <h1>Sign in securely</h1>
        <p className="auth-description">Use the verified Google account that has access to the squadron Shared Drive.</p>
      </div>
      <a className="button button--primary auth-submit" href="/api/auth/google/start">Sign in with Google</a>
      {error ? <div className="auth-message" role="alert">{errorMessage(error)}</div> : null}
      <p className="auth-footer-copy">Need access? Squadron command staff must grant it through Google Drive.</p>
    </div>
  );
}

function errorMessage(error: string): string {
  if (error === "unverified") return "Google could not verify this account's email address.";
  if (error === "drive_access") return "Google denied access to the squadron Shared Drive. Ask squadron command staff to grant access through Google Drive.";
  if (error === "google_denied") return "Google sign-in was canceled or denied.";
  if (error === "configuration") return "Google sign-in is not configured.";
  return "Google sign-in could not be completed. Please try again.";
}
