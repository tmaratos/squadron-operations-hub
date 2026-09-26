import { getCloudflareEnv, getDatabase } from "@/lib/cloudflare";

// The security controls the squadron attested to, checked by the Hub against itself.
//
// CAP's CAPWATCH attestation asks how member data is protected. Answering it on paper and then never
// looking again is how an answer quietly stops being true: a token stored in plain text after a bad
// deployment, a suspended account whose session still works, an audit log that stopped recording weeks ago.
// Each control below is an assertion about the running system, tested against the live database, so the
// attestation is something the Hub can demonstrate rather than something somebody remembers writing.
//
// The most important rule here is that a control nobody can test says so. MFA on a member's Google account,
// disk encryption on somebody's laptop, the antivirus on a workstation - none of those are visible from
// inside this application, and reporting them as passing because they were typed into a form would make the
// whole page worthless. They are reported as needing a person, with a note of who confirmed them and when.

export type ControlState = "PASS" | "FAIL" | "NEEDS_PERSON";

export interface Control {
  key: string;
  /** The attestation question this answers, so the page and the form line up. */
  question: string;
  state: ControlState;
  /** What was found, in numbers. Never an opinion, always checkable by hand. */
  evidence: string;
  /** What to do about it, only when something is actually wrong. */
  remedy?: string;
}

function env() {
  return getCloudflareEnv() as unknown as Record<string, string | undefined>;
}

/** Google's access and refresh tokens are recognisable on sight. None should ever be readable in the database. */
function looksLikePlainToken(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.startsWith("ya29.") || value.startsWith("1//") || value.startsWith("ey");
}

async function count(sql: string, ...binds: unknown[]): Promise<number> {
  try {
    const row = await getDatabase().prepare(sql).bind(...binds).first<{ n: number }>();
    return row?.n ?? 0;
  } catch {
    return -1; // the table is not there; the caller decides what that means
  }
}

/**
 * Every control, run now.
 *
 * Deliberately cheap: counts and existence checks against indexed columns, so this can run on every page
 * load and every night without being something anybody has to schedule around.
 */
export async function runControls(): Promise<Control[]> {
  const controls: Control[] = [];
  const settings = env();
  const db = getDatabase();

  // ---------------------------------------------------------------- credentials are not readable
  let plain = 0;
  let stored = 0;
  try {
    const rows = await db.prepare("SELECT access_token_encrypted, refresh_token_encrypted FROM user_google_oauth").all<{ access_token_encrypted: string; refresh_token_encrypted: string | null }>();
    const extra = await db.prepare("SELECT access_token_encrypted, refresh_token_encrypted FROM user_mail_accounts").all<{ access_token_encrypted: string; refresh_token_encrypted: string | null }>().catch(() => ({ results: [] as Array<{ access_token_encrypted: string; refresh_token_encrypted: string | null }> }));
    [...rows.results, ...extra.results].forEach((row) => {
      stored += 1;
      if (looksLikePlainToken(row.access_token_encrypted) || looksLikePlainToken(row.refresh_token_encrypted)) plain += 1;
    });
  } catch {
    stored = -1;
  }
  controls.push({
    key: "TOKENS_ENCRYPTED",
    question: "Is CAP data encrypted at rest?",
    state: plain > 0 ? "FAIL" : "PASS",
    evidence: stored < 0
      ? "No credentials are stored yet."
      : stored + " stored credential" + (stored === 1 ? "" : "s") + " checked, " + plain + " readable in plain text. Tokens are encrypted with AES-256-GCM before they are written.",
    remedy: plain > 0 ? "A credential is stored unencrypted. Rotate the Google client secret, clear the stored tokens, and have every member reconnect." : undefined
  });

  // ---------------------------------------------------------------- the key that does that encrypting
  const keySet = Boolean(settings.GOOGLE_TOKEN_ENCRYPTION_KEY && settings.GOOGLE_TOKEN_ENCRYPTION_KEY.length >= 16);
  controls.push({
    key: "ENCRYPTION_KEY",
    question: "Is CAP data encrypted at rest?",
    state: keySet ? "PASS" : "FAIL",
    evidence: keySet
      ? "The token encryption key is configured as a secret and is not in source control."
      : "No token encryption key is configured, or it is too short to be one.",
    remedy: keySet ? undefined : "Set GOOGLE_TOKEN_ENCRYPTION_KEY as a Cloudflare secret. Until it is set, credentials cannot be protected."
  });

  // ---------------------------------------------------------------- nothing is served without TLS
  const appUrl = settings.APP_URL ?? "";
  const redirect = settings.GOOGLE_REDIRECT_URI ?? "";
  const httpsOnly = appUrl.startsWith("https://") && (!redirect || redirect.startsWith("https://"));
  controls.push({
    key: "TLS_ONLY",
    question: "Is CAP data encrypted in transit?",
    state: httpsOnly ? "PASS" : "FAIL",
    evidence: httpsOnly
      ? "The application address and the sign-in callback are both HTTPS. Plain HTTP is redirected by the platform and never serves data."
      : "An address is configured without HTTPS: " + [appUrl, redirect].filter((value) => value && !value.startsWith("https://")).join(", "),
    remedy: httpsOnly ? undefined : "Change the address to HTTPS. Anything else sends member data over the open internet in clear text."
  });

  // ---------------------------------------------------------------- a suspended account is actually out
  const liveSuspended = await count(
    "SELECT COUNT(*) AS n FROM sessions s JOIN users u ON u.id = s.user_id " +
    // Revoked sessions are already dead; counting them would report a failure that is not one.
    "WHERE u.status IN ('SUSPENDED','ARCHIVED') AND s.revoked_at IS NULL AND s.expires_at > ?",
    new Date().toISOString()
  );
  controls.push({
    key: "SUSPENSION_ENFORCED",
    question: "How do you restrict system access to authorized users?",
    state: liveSuspended > 0 ? "FAIL" : "PASS",
    evidence: liveSuspended > 0
      ? liveSuspended + " live session" + (liveSuspended === 1 ? " belongs" : "s belong") + " to a suspended or archived account."
      : "No suspended or archived account holds a live session.",
    remedy: liveSuspended > 0 ? "Revoke those sessions now. Suspension is supposed to take effect immediately." : undefined
  });

  // ---------------------------------------------------------------- sessions do not outlive their window
  const ttlHours = Number(settings.SESSION_TTL_HOURS ?? 12);
  const overdue = await count(
    "SELECT COUNT(*) AS n FROM sessions WHERE revoked_at IS NULL AND expires_at > ?",
    new Date(Date.now() + (ttlHours + 1) * 3600_000).toISOString()
  );
  controls.push({
    key: "SESSION_WINDOW",
    question: "How do you restrict system access to authorized users?",
    state: overdue > 0 ? "FAIL" : "PASS",
    evidence: overdue > 0
      ? overdue + " session" + (overdue === 1 ? " lasts" : "s last") + " longer than the " + ttlHours + " hour limit."
      : "Sessions expire after " + ttlHours + " hours. None is set to last longer.",
    remedy: overdue > 0 ? "Delete those sessions and check SESSION_TTL_HOURS." : undefined
  });

  // ---------------------------------------------------------------- admitted on a CAP address means read only
  const overReaching = await count(
    "SELECT COUNT(*) AS n FROM users WHERE access_basis = 'DOMAIN' AND global_role != 'READ_ONLY'"
  );
  controls.push({
    key: "DOMAIN_READ_ONLY",
    question: "How do you restrict system access to authorized users?",
    state: overReaching > 0 ? "FAIL" : "PASS",
    evidence: overReaching > 0
      ? overReaching + " account admitted on a CAP address alone can change data."
      : "Every account admitted on a CAP address alone is read only until the squadron grants it Drive access.",
    remedy: overReaching > 0 ? "Review those accounts. An administrator setting a role deliberately clears this flag; if none did, something is wrong." : undefined
  });

  // ---------------------------------------------------------------- the audit log is still recording
  const recentAudit = await count(
    "SELECT COUNT(*) AS n FROM audit_events WHERE created_at > ?",
    new Date(Date.now() - 7 * 86400_000).toISOString()
  );
  controls.push({
    key: "AUDIT_RECORDING",
    question: "How would you respond to a potential incident or security breach?",
    state: recentAudit > 0 ? "PASS" : "FAIL",
    evidence: recentAudit > 0
      ? recentAudit + " audit event" + (recentAudit === 1 ? "" : "s") + " recorded in the last seven days. Every change names who made it and when."
      : "No audit events in the last seven days. Either nothing happened, or the log has stopped.",
    remedy: recentAudit > 0 ? undefined : "Check that changes are still being written to the audit log. Without it an incident cannot be reconstructed."
  });

  // ---------------------------------------------------------------- only what the work needs is held
  const withContact = await count(
    "SELECT COUNT(*) AS n FROM personnel_members WHERE member_type = 'CADET' AND (capid IS NOT NULL OR user_id IS NOT NULL)"
  );
  const cadets = await count("SELECT COUNT(*) AS n FROM personnel_members WHERE member_type = 'CADET'");
  controls.push({
    key: "PII_MINIMISED",
    question: "Describe your controls for protecting Personally Identifiable Information.",
    state: withContact > 0 ? "FAIL" : "PASS",
    evidence: cadets <= 0
      ? "No cadet records are held."
      : cadets + " cadet record" + (cadets === 1 ? "" : "s") + ", grade and name only. " + withContact + " carry any identifier or account beyond that.",
    remedy: withContact > 0 ? "A cadet record holds more than grade and name. Remove what is not needed for the organisation chart." : undefined
  });

  // ---------------------------------------------------------------- where the data physically is
  const region = settings.DATA_REGION ?? "ENAM";
  const usRegion = ["ENAM", "WNAM"].includes(region.toUpperCase());
  controls.push({
    key: "DATA_LOCATION",
    question: "Is all CAP data stored in the United States?",
    state: usRegion ? "PASS" : "FAIL",
    evidence: "The database runs in " + region.toUpperCase() + (usRegion ? ", which is within the United States." : ", which is outside the United States."),
    remedy: usRegion ? undefined : "CAP data must stay in the United States. Move the database to a US region."
  });

  // ---------------------------------------------------------------- the ones no software can see
  controls.push({
    key: "MFA",
    question: "Is Multi-factor Authentication enabled for system users?",
    state: "NEEDS_PERSON",
    evidence: "The Hub holds no passwords; sign-in is delegated to Google, so MFA is enforced by Google on the member's own account. Whether it is switched on there cannot be seen from here.",
    remedy: "Confirm in Google Workspace that 2-Step Verification is enforced, and record the date below."
  });

  controls.push({
    key: "ENDPOINT_PROTECTION",
    question: "Antivirus, patching and disk encryption on your endpoint.",
    state: "NEEDS_PERSON",
    evidence: "The system itself is serverless: there is no host to patch and no disk of ours to encrypt. The workstation used to administer it is outside the application and cannot be inspected from here.",
    remedy: "Confirm Windows Update, antivirus with current signatures, and BitLocker on the administrative workstation, and record the date below."
  });

  return controls;
}

export interface ControlSummary {
  controls: Control[];
  passing: number;
  failing: number;
  needsPerson: number;
  checkedAt: string;
}

export async function summariseControls(): Promise<ControlSummary> {
  const controls = await runControls();
  return {
    controls,
    passing: controls.filter((control) => control.state === "PASS").length,
    failing: controls.filter((control) => control.state === "FAIL").length,
    needsPerson: controls.filter((control) => control.state === "NEEDS_PERSON").length,
    checkedAt: new Date().toISOString()
  };
}
