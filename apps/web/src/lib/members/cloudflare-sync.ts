import { getCloudflareEnv, getDatabase } from "@/lib/cloudflare";
import { recordAuditEvent } from "@/lib/db/audit";

// Keeping Cloudflare's guest list in step with the Hub's own decisions.
//
// Two systems have to agree about who may sign in: the Hub, which is where administrators actually work,
// and Cloudflare Access, which is the door. Asking a squadron officer to keep both in step by hand would
// guarantee they drift, and the drift that matters is the dangerous direction - somebody restricted here who
// is still on the list there.
//
// So the Hub writes to Cloudflare, never the other way round. This file is the only thing that does.
//
// The rule when Cloudflare is unreachable is the important part, and it is deliberately lopsided. A local
// decision is never rolled back because the sync failed: a member restricted in the Hub is refused by the
// Hub at sign-in regardless of what Cloudflare thinks, because the application checks its own authorisation
// on every request. Cloudflare being out of date can leave somebody able to reach the door; it cannot let
// them through it.

const API = "https://api.cloudflare.com/client/v4";

interface Configured {
  token: string;
  accountId: string;
  policyId: string;
}

function configuration(): Configured | null {
  const env = getCloudflareEnv();
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID || !env.CF_ACCESS_POLICY_ID) return null;
  return { token: env.CF_API_TOKEN, accountId: env.CF_ACCOUNT_ID, policyId: env.CF_ACCESS_POLICY_ID };
}

export function syncConfigured(): boolean {
  return configuration() !== null;
}

/** The addresses the Hub says may sign in: everyone authorised, with an address to sign in at. */
async function authorisedAddresses(): Promise<string[]> {
  const rows = await getDatabase()
    .prepare(
      "SELECT login_email FROM member_access " +
      "WHERE status = 'AUTHORIZED' AND login_email IS NOT NULL AND login_email <> '' ORDER BY login_email"
    )
    .all<{ login_email: string }>();
  return rows.results.map((row) => row.login_email.toLowerCase());
}

export interface SyncOutcome {
  ok: boolean;
  message: string;
  /** How many addresses Cloudflare now admits, when the sync succeeded. */
  count?: number;
}

/**
 * Rewrites the Access policy to exactly the Hub's authorised list.
 *
 * Replacing rather than adding and removing individually, on purpose: a list built from the Hub's own state
 * cannot drift, while a sequence of individual edits can leave somebody behind if one call fails halfway.
 * The cost is that anything added to this policy by hand in the Cloudflare dashboard is removed, which is
 * the intended behaviour - the Hub is the record of who may sign in.
 */
export async function syncAccessList(input?: { actorId?: string; reason?: string }): Promise<SyncOutcome> {
  const config = configuration();
  if (!config) {
    return {
      ok: false,
      message: "Cloudflare synchronisation is not configured, so the Access list was not updated."
    };
  }

  const emails = await authorisedAddresses();

  // An empty include list would be rejected by Cloudflare, and a policy that admits nobody is not something
  // to create by accident. Refusing here is safer than sending it.
  if (!emails.length) {
    return {
      ok: false,
      message: "No member is authorised with a login address, so the Access list was left as it is."
    };
  }

  let response: Response;
  try {
    response = await fetch(
      API + "/accounts/" + config.accountId + "/access/policies/" + config.policyId,
      {
        method: "PUT",
        headers: {
          Authorization: "Bearer " + config.token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: "TN-170 Hub members",
          decision: "allow",
          include: emails.map((email) => ({ email: { email } }))
        })
      }
    );
  } catch {
    await note(input?.actorId, false, "Cloudflare could not be reached.", emails.length);
    return { ok: false, message: "Cloudflare could not be reached. The Hub's own decision still stands." };
  }

  if (!response.ok) {
    const said = await response.text().catch(() => "");
    await note(input?.actorId, false, said.slice(0, 200), emails.length);
    return {
      ok: false,
      message: "Cloudflare refused the update (" + response.status + "). The Hub's own decision still stands."
    };
  }

  await note(input?.actorId, true, null, emails.length);
  return { ok: true, message: "Cloudflare now admits " + emails.length + " addresses.", count: emails.length };
}

async function note(actorId: string | undefined, ok: boolean, detail: string | null, count: number): Promise<void> {
  await recordAuditEvent({
    actorUserId: actorId ?? null,
    action: ok ? "CLOUDFLARE_SYNC_OK" : "CLOUDFLARE_SYNC_FAILED",
    entityType: "integration",
    entityId: "cloudflare-access",
    summary: ok
      ? "The Cloudflare Access list was updated to " + count + " addresses"
      : "The Cloudflare Access list could not be updated",
    // No token, no header, nothing credential-shaped - only what happened and how many.
    metadata: { count, detail }
  }).catch(() => undefined);
}
