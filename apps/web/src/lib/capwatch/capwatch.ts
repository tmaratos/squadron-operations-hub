import { getDatabase } from "@/lib/cloudflare";
import { decryptToken, encryptToken } from "@/lib/auth/token-encryption";
import { recordAuditEvent } from "@/lib/db/audit";
import { asText, BrokenArchive, readZip } from "./zip";

// Talking to CAPWATCH, from the Hub's own backend and nowhere else.
//
// CAP supplies a PowerShell script. It is a reference for the protocol, not a runtime: nothing here depends
// on anybody's PC, PowerShell, or a person remembering to run something. The script builds a Basic
// authorization header from the authorised member's CAPID and eServices password, asks for a ZIP over
// TLS 1.2, and writes it to disk. This does the same request from a Worker and keeps the archive in memory.
//
// The one thing deliberately not copied is the script's password handling. It encrypts the password on disk
// with ConvertTo-SecureString using a hardcoded key of (1..16), which is obfuscation rather than encryption
// - anyone with the file can reverse it. The credential here is encrypted with the key that already protects
// OAuth tokens, which is held in Cloudflare's secret store and never in the database.

const ENDPOINT = "https://www.capnhq.gov/CAP.CapWatchAPI.Web/api/cw";

export interface CapwatchStatus {
  configured: boolean;
  capid: string | null;
  orgId: string;
  unitOnly: boolean;
  credentialUpdatedAt: string | null;
  lastAuthOkAt: string | null;
  lastSync: {
    startedAt: string;
    finishedAt: string | null;
    status: string;
    kind: string;
    message: string | null;
    membersSeen: number | null;
    tablesFound: number | null;
  } | null;
}

/**
 * What the settings page is allowed to know.
 *
 * Says whether a credential exists and never what it is. There is no path in this module that returns the
 * password, encrypted or otherwise, to anything that could reach a browser.
 */
export async function capwatchStatus(): Promise<CapwatchStatus> {
  const db = getDatabase();
  try {
    const row = await db
      .prepare(
        "SELECT capid, org_id, unit_only, credential_updated_at, last_auth_ok_at, " +
        "CASE WHEN password_encrypted IS NULL OR password_encrypted = '' THEN 0 ELSE 1 END AS has_password " +
        "FROM capwatch_settings WHERE id = 1"
      )
      .first<{
        capid: string | null; org_id: string; unit_only: number;
        credential_updated_at: string | null; last_auth_ok_at: string | null; has_password: number;
      }>();

    const last = await db
      .prepare(
        "SELECT started_at, finished_at, status, kind, message, members_seen, tables_found " +
        "FROM capwatch_syncs ORDER BY started_at DESC LIMIT 1"
      )
      .first<{
        started_at: string; finished_at: string | null; status: string; kind: string;
        message: string | null; members_seen: number | null; tables_found: number | null;
      }>();

    return {
      configured: Boolean(row?.has_password && row?.capid),
      capid: row?.capid ?? null,
      orgId: row?.org_id ?? "1370",
      unitOnly: Boolean(row?.unit_only),
      credentialUpdatedAt: row?.credential_updated_at ?? null,
      lastAuthOkAt: row?.last_auth_ok_at ?? null,
      lastSync: last
        ? {
            startedAt: last.started_at,
            finishedAt: last.finished_at,
            status: last.status,
            kind: last.kind,
            message: last.message,
            membersSeen: last.members_seen,
            tablesFound: last.tables_found
          }
        : null
    };
  } catch {
    return {
      configured: false, capid: null, orgId: "1370", unitOnly: false,
      credentialUpdatedAt: null, lastAuthOkAt: null, lastSync: null
    };
  }
}

/**
 * CAPWATCH is down between midnight and 02:30 Central, every day, by CAP's own notice.
 *
 * Asking during the window produces a failure that looks exactly like a broken credential, which is the
 * worst possible confusion for the person whose job is to keep this working. So it is refused before the
 * request is made, and named as what it is.
 *
 * The window is widened to 05:00-09:00 UTC on purpose. CAP writes CST, but central time is CDT for most of
 * the year, and the Hub has no timezone database to resolve which is in force today. Half an hour either
 * side costs a sync that could have run at two in the morning; guessing wrong costs a failure nobody can
 * explain.
 */
export function inBlackout(now: Date = new Date()): boolean {
  const hour = now.getUTCHours();
  const minutes = hour * 60 + now.getUTCMinutes();
  return minutes >= 5 * 60 && minutes < 9 * 60;
}

interface Credential {
  capid: string;
  password: string;
  orgId: string;
  unitOnly: boolean;
}

/** Decrypts the stored credential. The only function in the application that can. */
async function storedCredential(): Promise<Credential | null> {
  try {
    const row = await getDatabase()
      .prepare("SELECT capid, password_encrypted, org_id, unit_only FROM capwatch_settings WHERE id = 1")
      .first<{ capid: string | null; password_encrypted: string | null; org_id: string; unit_only: number }>();
    if (!row?.capid || !row.password_encrypted) return null;
    return {
      capid: row.capid,
      password: await decryptToken(row.password_encrypted),
      orgId: row.org_id,
      unitOnly: Boolean(row.unit_only)
    };
  } catch {
    return null;
  }
}

export type FetchOutcome =
  | { ok: true; archive: ArrayBuffer }
  | { ok: false; status: "AUTH_FAILED" | "DOWNLOAD_FAILED" | "BLACKOUT" | "ERROR"; message: string };

/**
 * Asks CAP for the unit's extract.
 *
 * The credential is passed in rather than read here, so that testing a new password never requires storing
 * it first - which is what makes it possible to keep a working credential when a replacement turns out to
 * be wrong.
 */
export async function fetchExtract(credential: Credential): Promise<FetchOutcome> {
  if (inBlackout()) {
    return {
      ok: false,
      status: "BLACKOUT",
      message: "CAPWATCH is unavailable between midnight and 02:30 Central every day. Nothing was attempted."
    };
  }

  const url = ENDPOINT + "?ORGID=" + encodeURIComponent(credential.orgId) +
    "&unitOnly=" + (credential.unitOnly ? "1" : "0");

  // Exactly what the official script sends: CAPID and password, ASCII, base64, as Basic.
  const pair = credential.capid + ":" + credential.password;
  const basic = btoa(pair);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: "Basic " + basic },
      // CAP's own script allows ten minutes. A squadron extract is well under a megabyte, so this is
      // generous rather than necessary, but a slow answer is not a failure.
      signal: AbortSignal.timeout(600_000)
    });
  } catch (error) {
    return {
      ok: false,
      status: "DOWNLOAD_FAILED",
      message: "CAPWATCH could not be reached. " + (error instanceof Error ? error.message : "")
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      status: "AUTH_FAILED",
      message: "CAPWATCH refused the credential. The authorised member's eServices password has probably changed."
    };
  }
  if (!response.ok) {
    return { ok: false, status: "DOWNLOAD_FAILED", message: "CAPWATCH answered " + response.status + "." };
  }

  const archive = await response.arrayBuffer();
  if (archive.byteLength === 0) {
    return { ok: false, status: "DOWNLOAD_FAILED", message: "CAPWATCH returned an empty file." };
  }
  return { ok: true, archive };
}

export interface ExtractSummary {
  bytes: number;
  tables: number;
  members: number;
  downloadedOn: string | null;
}

/**
 * Opens the archive far enough to know it is a real extract.
 *
 * Deliberately stops short of importing anything. Proving the download is good is a different job from
 * changing the squadron's records, and the first has to be trustworthy before the second is allowed to
 * happen at all.
 */
export async function summarise(archive: ArrayBuffer): Promise<ExtractSummary> {
  const entries = readZip(archive);
  const member = entries.find((entry) => entry.name.toLowerCase() === "member.txt");
  if (!member) {
    throw new BrokenArchive("The archive has no Member.txt, so it is not a CAPWATCH extract.");
  }

  const lines = asText(await member.bytes()).split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    throw new BrokenArchive("The extract contains no members.");
  }

  let downloadedOn: string | null = null;
  const stamp = entries.find((entry) => entry.name.toLowerCase() === "downloaddate.txt");
  if (stamp) {
    const said = asText(await stamp.bytes()).split(/\r?\n/).filter(Boolean);
    downloadedOn = said.length > 1 ? said[1].trim() : null;
  }

  return { bytes: archive.byteLength, tables: entries.length, members: lines.length - 1, downloadedOn };
}

/** Saves a credential only after CAP has accepted it. */
export async function replaceCredential(input: {
  capid: string;
  password: string;
  orgId?: string;
  unitOnly?: boolean;
  actorId: string;
  actorName: string;
}): Promise<{ ok: boolean; message: string; summary?: ExtractSummary }> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const runId = crypto.randomUUID();

  const existing = await db
    .prepare("SELECT capid FROM capwatch_settings WHERE id = 1")
    .first<{ capid: string | null }>();

  await db
    .prepare(
      "INSERT INTO capwatch_syncs (id, started_at, status, kind, triggered_by) VALUES (?, ?, 'RUNNING', 'TEST', ?)"
    )
    .bind(runId, now, input.actorId)
    .run();

  await recordAuditEvent({
    actorUserId: input.actorId,
    action: "CAPWATCH_CREDENTIAL_REPLACEMENT_STARTED",
    entityType: "integration",
    entityId: "capwatch",
    summary: input.actorName + " began replacing the CAPWATCH credential",
    // The CAPID is an identifier, not a secret. The password is never written anywhere near this.
    metadata: { previousCapid: existing?.capid ?? null, newCapid: input.capid }
  });

  const attempt = await fetchExtract({
    capid: input.capid,
    password: input.password,
    orgId: input.orgId ?? "1370",
    unitOnly: input.unitOnly ?? false
  });

  const finish = async (status: string, message: string, summary?: ExtractSummary) => {
    await db
      .prepare(
        "UPDATE capwatch_syncs SET finished_at = ?, status = ?, message = ?, bytes_downloaded = ?, " +
        "tables_found = ?, members_seen = ? WHERE id = ?"
      )
      .bind(
        new Date().toISOString(), status, message,
        summary?.bytes ?? null, summary?.tables ?? null, summary?.members ?? null, runId
      )
      .run();
  };

  if (!attempt.ok) {
    await finish(attempt.status, attempt.message);
    await recordAuditEvent({
      actorUserId: input.actorId,
      action: "CAPWATCH_CREDENTIAL_VALIDATION_FAILED",
      entityType: "integration",
      entityId: "capwatch",
      summary: input.actorName + " tried a CAPWATCH credential and CAP refused it",
      metadata: { capid: input.capid, status: attempt.status }
    });
    // The stored credential is untouched. A wrong new password must not cost the squadron a working one.
    return { ok: false, message: attempt.message };
  }

  let summary: ExtractSummary;
  try {
    summary = await summarise(attempt.archive);
  } catch (error) {
    const message = error instanceof BrokenArchive ? error.message : "The archive could not be read.";
    await finish("BAD_ARCHIVE", message);
    return { ok: false, message };
  }

  const encrypted = await encryptToken(input.password);
  await db
    .prepare(
      "INSERT INTO capwatch_settings (id, capid, password_encrypted, org_id, unit_only, " +
      "credential_updated_at, credential_updated_by, last_auth_ok_at, created_at, updated_at) " +
      "VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(id) DO UPDATE SET capid = excluded.capid, password_encrypted = excluded.password_encrypted, " +
      "org_id = excluded.org_id, unit_only = excluded.unit_only, " +
      "credential_updated_at = excluded.credential_updated_at, " +
      "credential_updated_by = excluded.credential_updated_by, " +
      "last_auth_ok_at = excluded.last_auth_ok_at, updated_at = excluded.updated_at"
    )
    .bind(
      input.capid, encrypted, input.orgId ?? "1370", input.unitOnly ? 1 : 0,
      now, input.actorId, new Date().toISOString(), now, new Date().toISOString()
    )
    .run();

  await finish("OK", "CAP accepted the credential.", summary);
  await recordAuditEvent({
    actorUserId: input.actorId,
    action: "CAPWATCH_CREDENTIAL_REPLACED",
    entityType: "integration",
    entityId: "capwatch",
    summary: input.actorName + " replaced the CAPWATCH credential; CAP accepted it",
    metadata: {
      capid: input.capid,
      previousCapid: existing?.capid ?? null,
      tables: summary.tables,
      members: summary.members
    }
  });

  return {
    ok: true,
    message: "CAP accepted the credential. The extract holds " + summary.members +
      " members across " + summary.tables + " tables.",
    summary
  };
}

/** Tests what is already stored, without changing it. */
export async function testStoredCredential(input: { actorId: string; actorName: string }): Promise<{
  ok: boolean;
  message: string;
  summary?: ExtractSummary;
}> {
  const credential = await storedCredential();
  if (!credential) return { ok: false, message: "No CAPWATCH credential is configured yet." };

  const db = getDatabase();
  const runId = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare("INSERT INTO capwatch_syncs (id, started_at, status, kind, triggered_by) VALUES (?, ?, 'RUNNING', 'TEST', ?)")
    .bind(runId, now, input.actorId)
    .run();

  const attempt = await fetchExtract(credential);
  if (!attempt.ok) {
    await db
      .prepare("UPDATE capwatch_syncs SET finished_at = ?, status = ?, message = ? WHERE id = ?")
      .bind(new Date().toISOString(), attempt.status, attempt.message, runId)
      .run();
    return { ok: false, message: attempt.message };
  }

  let summary: ExtractSummary;
  try {
    summary = await summarise(attempt.archive);
  } catch (error) {
    const message = error instanceof BrokenArchive ? error.message : "The archive could not be read.";
    await db
      .prepare("UPDATE capwatch_syncs SET finished_at = ?, status = 'BAD_ARCHIVE', message = ? WHERE id = ?")
      .bind(new Date().toISOString(), message, runId)
      .run();
    return { ok: false, message };
  }

  await db
    .prepare(
      "UPDATE capwatch_syncs SET finished_at = ?, status = 'OK', message = ?, bytes_downloaded = ?, " +
      "tables_found = ?, members_seen = ? WHERE id = ?"
    )
    .bind(new Date().toISOString(), "Connection good.", summary.bytes, summary.tables, summary.members, runId)
    .run();
  await db
    .prepare("UPDATE capwatch_settings SET last_auth_ok_at = ?, updated_at = ? WHERE id = 1")
    .bind(new Date().toISOString(), new Date().toISOString())
    .run();

  return {
    ok: true,
    message: "Connection good. " + summary.members + " members across " + summary.tables + " tables.",
    summary
  };
}
