import { CheckCircle2, Folder } from "lucide-react";
import { hasDriveScope } from "@/lib/auth/google-oauth";

// Where a member's files come from. Members sign in with their own email now, so the squadron Shared Drive is
// reached through a Google account they attach here - whichever one the Drive was shared with.

export function FilesCard({ google, error, notice }: {
  google: { scopes: string; updatedAt: string } | null;
  error?: string;
  notice?: string;
}) {
  // Matched as a whole permission - "drive" also starts narrower Drive permissions that cannot open it.
  const hasDrive = Boolean(google && hasDriveScope(google.scopes));
  return (
    <section className="section-card" id="files">
      <header className="section-card__header">
        <div>
          <h2>Files</h2>
          <p>The squadron Shared Drive opens with the Google account it was shared with. Connect it once.</p>
        </div>
      </header>
      <div className="section-card__body fc">
        <style>{fcCss}</style>
        {error === "google_in_use" ? (
          <p className="fc-note fc-note--bad" role="alert">
            That Google account is already connected to another member. Choose a different one, or ask an
            administrator to move it.
          </p>
        ) : null}
        {notice === "no_drive" ? (
          <p className="fc-note" role="status">
            Google is connected, but that account cannot open the TN 170 Command Shared Drive. Ask command staff to
            share it with that address, or connect the account it was shared with.
          </p>
        ) : null}
        <div className="fc-row">
          <span className="fc-icon"><Folder size={20} aria-hidden="true" /></span>
          <span className="fc-text">
            <strong>Google Drive</strong>
            <small>{hasDrive ? "Connected - the squadron files appear on Documents." : "Not connected yet."}</small>
          </span>
          {hasDrive ? (
            <>
              <span className="fc-ok"><CheckCircle2 size={16} aria-hidden="true" /> Connected</span>
              <a className="button button--ghost" href="/api/auth/google/connect?scope=drive">Use another account</a>
            </>
          ) : (
            <a className="button button--primary" href="/api/auth/google/connect?scope=drive">Connect Google</a>
          )}
        </div>
      </div>
    </section>
  );
}

const fcCss = String.raw`
.fc{display:grid;gap:12px}
.fc-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface-alt)}
.fc-icon{display:grid;place-items:center;width:40px;height:40px;border-radius:10px;background:#e8f0ff;color:#2563eb;flex:none}
html[data-theme=dark] .fc-icon{background:rgba(37,99,235,.22);color:#8db4ff}
.fc-text{display:grid;gap:2px;flex:1;min-width:180px}
.fc-text strong{font-size:15px;color:var(--text)}
.fc-text small{font-size:13px;color:var(--muted)}
.fc-ok{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:650;color:#15803d}
html[data-theme=dark] .fc-ok{color:#7fe0a3}
.fc-note{margin:0;padding:10px 14px;border-radius:10px;font-size:14px;background:#e6efff;color:#1e3a8a}
.fc-note--bad{background:#fdecee;color:#9f1d2c}
html[data-theme=dark] .fc-note{background:rgba(37,99,235,.2);color:#cfe0ff}
html[data-theme=dark] .fc-note--bad{background:rgba(220,53,69,.18);color:#ffb3bb}
`;
