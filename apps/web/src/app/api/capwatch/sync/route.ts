import { NextResponse } from "next/server";
import { getCloudflareEnv, getDatabase } from "@/lib/cloudflare";
import { getCurrentUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/security/origin";
import { fetchExtract, inBlackout } from "@/lib/capwatch/capwatch";
import { decryptToken } from "@/lib/auth/token-encryption";
import { parseExtract } from "@/lib/capwatch/parse";
import { reconcile } from "@/lib/capwatch/reconcile";
import { BrokenArchive } from "@/lib/capwatch/zip";
import type { GlobalRole } from "@/lib/auth/types";

// Running a CAPWATCH sync: on a schedule, or because somebody pressed the button.
//
// Two callers, authenticated differently. The scheduler is another Worker with a shared secret and no
// person behind it; an administrator is a signed-in session. Neither path is allowed to skip the other's
// checks, and nothing else can reach this.
//
// Everything before the write is allowed to fail freely - a refused credential, an unreachable CAP, a
// damaged archive - because failing before the write leaves the previous sync's data exactly where it is.
// That is the whole design: the member directory is never emptied by a bad download.

function canSyncByHand(role: GlobalRole): boolean {
  return role === "SYSTEM_OWNER" || role === "ADMINISTRATOR";
}

/** The scheduler's own credential. Compared in full, and only ever compared. */
function isScheduler(request: Request): boolean {
  const expected = getCloudflareEnv().INTERNAL_SYNC_TOKEN;
  if (!expected) return false;
  const offered = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (offered.length !== expected.length) return false;
  // Constant-time-ish: compare every character regardless of where the first difference is.
  let same = 0;
  for (let at = 0; at < expected.length; at += 1) {
    same |= expected.charCodeAt(at) ^ offered.charCodeAt(at);
  }
  return same === 0;
}

export async function POST(request: Request) {
  const scheduled = isScheduler(request);

  let actorId: string | null = null;
  let actorName = "the scheduler";

  if (!scheduled) {
    // A person, then. Same-origin and role are both required; the scheduler skips these because it is not
    // a browser and has no session.
    try {
      assertSameOrigin(request);
    } catch {
      return NextResponse.json({ message: "That request was refused." }, { status: 403 });
    }
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (!canSyncByHand(user.globalRole)) {
      return NextResponse.json({ message: "You cannot run a CAPWATCH sync." }, { status: 403 });
    }
    actorId = user.id;
    actorName = user.fullName;
  }

  const db = getDatabase();
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  const finish = async (status: string, message: string, extra?: {
    bytes?: number; tables?: number; members?: number; tableNames?: string[];
  }) => {
    await db
      .prepare(
        "UPDATE capwatch_syncs SET finished_at = ?, status = ?, message = ?, bytes_downloaded = ?, " +
        "tables_found = ?, members_seen = ?, table_names = ? WHERE id = ?"
      )
      .bind(new Date().toISOString(), status, message, extra?.bytes ?? null, extra?.tables ?? null,
            extra?.members ?? null, extra?.tableNames ? extra.tableNames.join(",") : null, runId)
      .run();
  };

  // CAP closes CAPWATCH nightly. A scheduled run that lands in the window is not a failure and should not
  // be recorded as one, or the health page will show a fault every time it happens.
  if (inBlackout()) {
    return NextResponse.json({
      ok: false,
      skipped: true,
      message: "CAPWATCH is closed between midnight and 02:30 Central. Nothing was attempted."
    });
  }

  const settings = await db
    .prepare("SELECT capid, password_encrypted, org_id, unit_only FROM capwatch_settings WHERE id = 1")
    .first<{ capid: string | null; password_encrypted: string | null; org_id: string; unit_only: number }>();

  if (!settings?.capid || !settings.password_encrypted) {
    return NextResponse.json(
      { ok: false, message: "No CAPWATCH credential is configured." },
      { status: 400 }
    );
  }

  await db
    .prepare("INSERT INTO capwatch_syncs (id, started_at, status, kind, triggered_by) VALUES (?, ?, 'RUNNING', 'SYNC', ?)")
    .bind(runId, startedAt, actorId)
    .run();

  const attempt = await fetchExtract({
    capid: settings.capid,
    password: await decryptToken(settings.password_encrypted),
    orgId: settings.org_id,
    unitOnly: Boolean(settings.unit_only)
  });

  if (!attempt.ok) {
    await finish(attempt.status, attempt.message);
    return NextResponse.json({ ok: false, message: attempt.message }, { status: 400 });
  }

  let extract;
  try {
    extract = await parseExtract(attempt.archive);
  } catch (error) {
    const message = error instanceof BrokenArchive ? error.message : "The extract could not be read.";
    await finish("BAD_ARCHIVE", message, { bytes: attempt.archive.byteLength });
    // Nothing has been written. The previous sync's records are untouched.
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }

  const report = await reconcile(extract, actorId);

  await db
    .prepare("UPDATE capwatch_settings SET last_auth_ok_at = ?, updated_at = ? WHERE id = 1")
    .bind(new Date().toISOString(), new Date().toISOString())
    .run();

  await finish("OK", "Synced by " + actorName + ".", {
    bytes: attempt.archive.byteLength,
    tables: extract.tableCount,
    tableNames: extract.tableNames,
    members: extract.seniors.length + extract.cadets.length
  });

  return NextResponse.json({
    ok: true,
    message:
      report.seniorsSeen + " senior members and " + report.cadetsSeen + " cadets. " +
      report.dutiesRecorded + " duty positions, " + report.developmentUpdated + " development records, " +
      report.recordsWritten + " service records." +
      (report.markedNoLongerCurrent
        ? " " + report.markedNoLongerCurrent + " no longer listed by CAPWATCH."
        : "") +
      (report.needingReview.length
        ? " " + report.needingReview.length + " of those still hold Hub access and need review."
        : ""),
    report
  });
}
