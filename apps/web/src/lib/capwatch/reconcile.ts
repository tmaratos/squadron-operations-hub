import { getDatabase } from "@/lib/cloudflare";
import { recordAuditEvent } from "@/lib/db/audit";
import type { Extract } from "./parse";

// Writing CAPWATCH's answer into the Hub, and writing only the parts that are CAPWATCH's to answer.
//
// Two rules shape everything here.
//
// The first is that CAPWATCH owns what CAP knows - name, grade, membership status, duty position,
// professional development - and owns none of what the squadron decided. Hub access, roles, login
// addresses, notification preferences, tasks, comments and audit history are untouched by a sync, because a
// roster import has no business revoking somebody's access or changing what they may do.
//
// The second is that a member who has left is not deleted. Their record is marked as no longer current and
// everything they did stays exactly where it is. Deleting them would silently rewrite the squadron's
// history, and the whole point of keeping records is that they survive people leaving.

/**
 * CAP's functional area codes, mapped to the squadron's own areas.
 *
 * Only the ones that are unambiguous. CAP has codes this Hub has no equivalent for - HC is the chaplain,
 * DOS is standardisation and evaluation - and inventing a home for those would file real work somewhere
 * misleading. An unmapped duty is still recorded against the member by title; it simply does not become a
 * routing assignment, and somebody can place it deliberately.
 */
const AREAS: Record<string, string> = {
  AE: "aerospace-education",
  CP: "cadet-programs",
  DP: "professional-development",
  PD: "professional-development",
  FM: "finance",
  IT: "it-systems",
  LG: "logistics",
  PA: "public-affairs",
  SE: "safety",
  EX: "command",
  DC: "command",
  CD: "command"
};

export interface ReconcileReport {
  seniorsSeen: number;
  seniorsAdded: number;
  seniorsUpdated: number;
  cadetsSeen: number;
  cadetsAdded: number;
  developmentUpdated: number;
  dutiesRecorded: number;
  recordsWritten: number;
  dutiesUnmapped: string[];
  markedNoLongerCurrent: number;
  /** Members CAPWATCH no longer lists who still hold Hub access, for an administrator to look at. */
  needingReview: Array<{ capid: string; fullName: string }>;
}

/**
 * Applies a parsed extract.
 *
 * Called only after the archive has been downloaded, unpacked and parsed successfully, so by this point the
 * data is known to be real. A failure before here leaves the previous sync's data exactly as it was, which
 * is what keeps a bad download from emptying the member directory.
 */
export async function reconcile(extract: Extract, actorId?: string | null): Promise<ReconcileReport> {
  const db = getDatabase();
  const now = new Date().toISOString();

  // Everything the loops below would otherwise ask the database for, one member at a time.
  //
  // A sync touches around three thousand rows. Asking for each member's id as it came to them meant three
  // thousand sequential round trips in a single request - fifteen seconds of pure waiting at a generous
  // five milliseconds each, and a sync that would not finish before the Worker gave up. These are read once
  // and held.
  const memberIdByCapid = new Map<string, string>();
  const memberIdByName = new Map<string, string>();
  const userIdByCapid = new Map<string, string>();

  const known = await db
    .prepare("SELECT id, capid, full_name, member_type FROM personnel_members")
    .all<{ id: string; capid: string | null; full_name: string; member_type: string }>();
  for (const row of known.results) {
    if (row.capid) memberIdByCapid.set(row.capid, row.id);
    if (row.member_type === "CADET") memberIdByName.set(row.full_name.toLowerCase(), row.id);
  }

  const accounts = await db
    .prepare("SELECT id, capid FROM users WHERE capid IS NOT NULL")
    .all<{ id: string; capid: string }>();
  for (const row of accounts.results) userIdByCapid.set(row.capid, row.id);

  /** Sends statements in batches rather than one at a time. D1 runs each batch as a single round trip. */
  const inBatches = async (statements: D1PreparedStatement[]) => {
    for (let at = 0; at < statements.length; at += 40) {
      await db.batch(statements.slice(at, at + 40));
    }
  };

  const report: ReconcileReport = {
    seniorsSeen: extract.seniors.length,
    seniorsAdded: 0,
    seniorsUpdated: 0,
    cadetsSeen: extract.cadets.length,
    cadetsAdded: 0,
    developmentUpdated: 0,
    dutiesRecorded: 0,
    recordsWritten: 0,
    dutiesUnmapped: [],
    markedNoLongerCurrent: 0,
    needingReview: []
  };

  // ---------------------------------------------------------------- senior members, matched by CAPID
  const writes: D1PreparedStatement[] = [];

  for (const senior of extract.seniors) {
    const existing = memberIdByCapid.get(senior.capid) ? { id: memberIdByCapid.get(senior.capid)! } : null;
    const status = senior.status === "ACTIVE" ? "ACTIVE" : "INACTIVE";

    if (existing) {
      // Only CAP's own fields. status_note, and anything a person set, is left alone.
      writes.push(db
        .prepare(
          "UPDATE personnel_members SET full_name = ?, rank = ?, status = ?, member_type = 'SENIOR', " +
          "source = 'CAPWATCH', capwatch_synced_at = ?, updated_at = ? WHERE id = ?"
        )
        .bind(senior.fullName, senior.rank, status, now, now, existing.id));
      report.seniorsUpdated += 1;
    } else {
      const id = crypto.randomUUID();
      memberIdByCapid.set(senior.capid, id);
      writes.push(db
        .prepare(
          "INSERT INTO personnel_members (id, capid, full_name, rank, status, member_type, source, " +
          "capwatch_synced_at, source_date, created_at, updated_at) " +
          "VALUES (?, ?, ?, ?, ?, 'SENIOR', 'CAPWATCH', ?, ?, ?, ?)"
        )
        .bind(id, senior.capid, senior.fullName, senior.rank, status, now, now, now, now));
      report.seniorsAdded += 1;
    }
  }

  // ---------------------------------------------------------------- cadets, matched by name
  //
  // By name because the Hub holds no cadet CAPID, which is what the unit told CAP. The cost is that a cadet
  // who changes their name reads as a new person until somebody tidies it; the alternative was holding
  // identifiers for minors that the squadron said it would not hold.
  for (const cadet of extract.cadets) {
    const existingId = memberIdByName.get(cadet.fullName.toLowerCase()) ?? null;
    const status = cadet.status === "ACTIVE" ? "ACTIVE" : "INACTIVE";

    if (existingId) {
      writes.push(db
        .prepare(
          "UPDATE personnel_members SET rank = ?, status = ?, source = 'CAPWATCH', capwatch_synced_at = ?, " +
          "updated_at = ? WHERE id = ?"
        )
        .bind(cadet.rank, status, now, now, existingId));
    } else {
      writes.push(db
        .prepare(
          "INSERT INTO personnel_members (id, capid, full_name, rank, status, member_type, source, " +
          "capwatch_synced_at, source_date, created_at, updated_at) " +
          "VALUES (?, NULL, ?, ?, ?, 'CADET', 'CAPWATCH', ?, ?, ?, ?)"
        )
        .bind(crypto.randomUUID(), cadet.fullName, cadet.rank, status, now, now, now, now));
      report.cadetsAdded += 1;
    }
  }

  // ---------------------------------------------------------------- the account records follow
  //
  // A member's name and grade live in three places: the roster, their Hub account, and the organisation
  // chart. CAP is right about all three, so a sync that updated only the roster would leave somebody
  // promoted on one page and not on another - which is worse than not syncing at all, because now the Hub
  // disagrees with itself and nobody knows which page to believe.
  //
  // Only the facts CAP owns. Email, role, status and everything the squadron decided are untouched.
  for (const senior of extract.seniors) {
    if (!userIdByCapid.has(senior.capid)) continue;
    writes.push(db
      .prepare("UPDATE users SET full_name = ?, updated_at = ? WHERE capid = ? AND full_name <> ?")
      .bind(senior.fullName, now, senior.capid, senior.fullName));
  }

  // The organisation chart names its incumbents from personnel_members, so pointing each position at the
  // right member keeps the chart, the roster and the duty list telling the same story.
  for (const duty of extract.duties) {
    if (duty.isAssistant) continue;
    const memberId = memberIdByCapid.get(duty.capid);
    if (!memberId) continue;
    writes.push(db
      .prepare(
        "UPDATE personnel_positions SET incumbent_id = ?, assignment_status = 'FILLED', updated_at = ? " +
        "WHERE lower(title) = lower(?) AND (incumbent_id IS NULL OR incumbent_id <> ?)"
      )
      .bind(memberId, now, duty.duty, memberId));
  }

  // ---------------------------------------------------------------- professional development
  const dutyTitles = new Map<string, string>();
  for (const duty of extract.duties) {
    // The primary title is the one without an assistant flag, where there is one.
    if (!duty.isAssistant || !dutyTitles.has(duty.capid)) dutyTitles.set(duty.capid, duty.duty);
  }

  for (const record of extract.development) {
    writes.push(db
      .prepare(
        "INSERT INTO member_development (capid, duty_position, pd_level, specialty_track, track_rating, " +
        "source, updated_at) VALUES (?, ?, ?, ?, ?, 'ESERVICES', ?) " +
        "ON CONFLICT(capid) DO UPDATE SET duty_position = excluded.duty_position, " +
        "pd_level = excluded.pd_level, specialty_track = excluded.specialty_track, " +
        // notes stay: they are somebody's words about this member, not CAP's.
        "track_rating = excluded.track_rating, source = 'ESERVICES', updated_at = excluded.updated_at"
      )
      .bind(
        record.capid,
        dutyTitles.get(record.capid) ?? null,
        record.level,
        record.track,
        record.rating,
        now
      ));
    report.developmentUpdated += 1;
  }

  // ---------------------------------------------------------------- duty positions
  // Kept apart from the rest because assigned_by is required and references a real user; an
  // unattended sync has nobody to name, so these are attempted separately and a refusal costs the
  // assignments rather than the whole sync.
  const dutyWrites: D1PreparedStatement[] = [];

  for (const duty of extract.duties) {
    const area = AREAS[duty.functionalArea.toUpperCase()];
    if (!area) {
      if (!report.dutiesUnmapped.includes(duty.functionalArea)) report.dutiesUnmapped.push(duty.functionalArea);
      continue;
    }

    const memberId = memberIdByCapid.get(duty.capid);
    if (!memberId) continue;
    const userId = userIdByCapid.get(duty.capid) ?? null;

    try {
      dutyWrites.push(db
        .prepare(
          "INSERT INTO duty_assignments (id, user_id, personnel_member_id, functional_area_key, duty_title, " +
          "is_primary, starts_on, assigned_by, created_at, updated_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING"
        )
        .bind(
          crypto.randomUUID(),
          userId,
          memberId,
          area,
          duty.duty,
          duty.isAssistant ? 0 : 1,
          now.slice(0, 10),
          // Recorded as CAP's doing rather than a person's, because that is what it is.
          actorId ?? null,
          now,
          now
        ));
      report.dutiesRecorded += 1;
    } catch {
      // assigned_by is required and references a user; when the sync runs unattended there is nobody to
      // name, so the assignment is skipped rather than attributed to whoever happens to be an owner.
      continue;
    }
  }

  // ---------------------------------------------------------------- service record
  //
  // Safety briefings, courses, achievements, awards and task qualifications. All of it about adults, all of
  // it the member's own record of service. The parser never reads the columns the unit told CAP it would not
  // hold, so nothing sensitive can arrive here even if this loop were changed carelessly later.
  for (const record of extract.records) {
    writes.push(db
      .prepare(
        "INSERT INTO member_records (capid, kind, code, title, functional_area, completed_on, expires_on, " +
        "status, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CAPWATCH', ?) " +
        "ON CONFLICT(capid, kind, code) DO UPDATE SET title = excluded.title, " +
        "functional_area = excluded.functional_area, completed_on = excluded.completed_on, " +
        "expires_on = excluded.expires_on, status = excluded.status, updated_at = excluded.updated_at"
      )
      .bind(
        record.capid, record.kind, record.code, record.title, record.functionalArea,
        record.completedOn, record.expiresOn, record.status, now
      ));
    report.recordsWritten += 1;
  }

  // Everything above has only been prepared. This is where it lands, in batches rather than one at a time.
  await inBatches(writes);

  try {
    await inBatches(dutyWrites);
  } catch {
    report.dutiesRecorded = 0;
  }

  // ---------------------------------------------------------------- who CAPWATCH no longer lists
  const present = new Set(extract.seniors.map((senior) => senior.capid));
  const held = await db
    .prepare("SELECT capid, full_name FROM personnel_members WHERE member_type = 'SENIOR' AND capid IS NOT NULL AND status = 'ACTIVE'")
    .all<{ capid: string; full_name: string }>();

  for (const row of held.results) {
    if (present.has(row.capid)) continue;

    await db
      .prepare("UPDATE personnel_members SET status = 'INACTIVE', capwatch_synced_at = ?, updated_at = ? WHERE capid = ?")
      .bind(now, now, row.capid)
      .run();
    report.markedNoLongerCurrent += 1;

    // Their Hub access is deliberately NOT changed. Leaving the squadron and losing access to the
    // application are different decisions, and the second belongs to an administrator.
    const access = await db
      .prepare("SELECT status FROM member_access WHERE capid = ? AND status = 'AUTHORIZED'")
      .bind(row.capid)
      .first<{ status: string }>();
    if (access) report.needingReview.push({ capid: row.capid, fullName: row.full_name });
  }

  await recordAuditEvent({
    actorUserId: actorId ?? null,
    action: "CAPWATCH_RECONCILED",
    entityType: "integration",
    entityId: "capwatch",
    summary:
      "CAPWATCH sync: " + report.seniorsSeen + " senior members, " + report.cadetsSeen + " cadets, " +
      report.dutiesRecorded + " duty positions, " + report.developmentUpdated + " development records, " + report.recordsWritten + " service records",
    metadata: {
      seniorsAdded: report.seniorsAdded,
      cadetsAdded: report.cadetsAdded,
      markedNoLongerCurrent: report.markedNoLongerCurrent,
      needingReview: report.needingReview.length,
      unmappedAreas: report.dutiesUnmapped
    }
  });

  return report;
}
