import { NextResponse } from "next/server";
import { getCloudflareEnv, getDatabase } from "@/lib/cloudflare";
import { readPendingDocuments } from "@/lib/regs/library";

// Reading the squadron's documents without anybody being there.
//
// The library could only be filled by a signed-in person pressing a button and keeping the tab open, and so
// two hundred regulations sat unread for months and everything built on top of them had nothing to work from.
// A job that needs a human to babysit it is a job that does not happen.
//
// It runs on the same schedule as everything else and stops when there is nothing pending, so once the backlog
// is gone it costs a request and does nothing. New documents added to the Drive are picked up the same way.

/** The scheduler's own credential, compared in full and only ever compared. */
function isScheduler(request: Request): boolean {
  const expected = getCloudflareEnv().INTERNAL_SYNC_TOKEN;
  if (!expected) return false;
  const offered = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (offered.length !== expected.length) return false;
  let same = 0;
  for (let at = 0; at < expected.length; at += 1) {
    same |= expected.charCodeAt(at) ^ offered.charCodeAt(at);
  }
  return same === 0;
}

/**
 * Whose Google credentials to read the Drive with.
 *
 * An unattended run has no signed-in member, so it borrows a stored one. Owners first and most recently
 * refreshed first, because that credential is the likeliest to still work - a member who has not signed in for
 * a month may have had their authorisation revoked, and trying theirs first would waste the run.
 *
 * This reads the squadron's Shared Drive as somebody who already has access to it, and only ever reads. It is
 * a stopgap: the service account is the right answer and does not depend on any one person still being in the
 * squadron, and this moves to it as soon as that account is granted access to the drive.
 */
async function credentialToUse(): Promise<string | null> {
  const row = await getDatabase()
    .prepare(
      "SELECT o.user_id FROM user_google_oauth o JOIN users u ON u.id = o.user_id " +
      "WHERE o.refresh_token_encrypted IS NOT NULL AND u.status = 'APPROVED' " +
      "ORDER BY CASE u.global_role WHEN 'SYSTEM_OWNER' THEN 0 WHEN 'ADMINISTRATOR' THEN 1 ELSE 2 END, " +
      "o.token_expires_at DESC LIMIT 1"
    )
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

export async function POST(request: Request) {
  if (!isScheduler(request)) {
    return NextResponse.json({ message: "That request was refused." }, { status: 403 });
  }

  const db = getDatabase();
  const pending = await db
    .prepare("SELECT COUNT(*) AS n FROM reg_documents WHERE status = 'PENDING'")
    .first<{ n: number }>();

  if (!pending?.n) {
    return NextResponse.json({ ok: true, read: 0, remaining: 0, message: "Nothing waiting to be read." });
  }

  const userId = await credentialToUse();
  if (!userId) {
    return NextResponse.json(
      { ok: false, message: "No stored Google credential can reach the Shared Drive." },
      { status: 400 }
    );
  }

  try {
    // A smaller bite than somebody pressing the button takes, and a tighter budget. This runs every hour with
    // nobody watching, so finishing cleanly matters more than finishing quickly, and the backlog clears either
    // way. Duties are left out: the text is what makes the library searchable, and asking a model to read every
    // document for duties unattended would cost far more than it returns.
    const result = await readPendingDocuments(userId, { limit: 12, withDuties: false, msBudget: 18_000 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message.slice(0, 200) : "The documents could not be read." },
      { status: 500 }
    );
  }
}
