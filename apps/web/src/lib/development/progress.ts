import { getDatabase } from "@/lib/cloudflare";
import { recordAuditEvent } from "@/lib/db/audit";
import { notify } from "@/lib/notify/notifications";

// Where each senior member stands, and what would move them forward.
//
// The rule that matters: never suggest something CAPWATCH already says is done. A leader prodding somebody
// about a level they finished two years ago does more damage than saying nothing - it tells the member the
// system is not worth reading, and they stop reading it.
//
// So the current level always comes from CAPWATCH where CAPWATCH knows it, and the next step is worked out
// from that rather than from anything typed in. Where CAPWATCH does not know, this says so plainly instead
// of guessing at a starting point.

export type Level = "LV1" | "LV2" | "LV3" | "LV4" | "LV5";

const ORDER: Level[] = ["LV1", "LV2", "LV3", "LV4", "LV5"];

/**
 * What each level is called and what finishing it is worth.
 *
 * The names are CAP's, kept so a member reads the same words here as in eServices. What this deliberately
 * does NOT do is enumerate each level's requirements: those change, they are set by regulation rather than
 * by this squadron, and a list of them invented here would be a member sent down the wrong path for months.
 * The duties catalogue already holds requirements with the regulation quoted beside them, and that is where
 * they belong.
 */
const LEVELS: Record<Level, { name: string; award: string }> = {
  LV1: { name: "Level I", award: "Membership and orientation" },
  LV2: { name: "Level II", award: "Technician rating and the Benjamin O. Davis Jr. Award" },
  LV3: { name: "Level III", award: "Senior rating and the Grover Loening Award" },
  LV4: { name: "Level IV", award: "Master rating and the Paul E. Garber Award" },
  LV5: { name: "Level V", award: "The Gill Robb Wilson Award" }
};

export interface Progress {
  capid: string;
  fullName: string;
  /** Null when CAPWATCH has no level for this member, which is a real and common state. */
  level: Level | null;
  levelName: string | null;
  nextLevel: Level | null;
  nextLevelName: string | null;
  track: string | null;
  rating: string | null;
  dutyPosition: string | null;
  /** Where this came from, so a hand-typed guess is never mistaken for CAP's own record. */
  source: string;
  /** One sentence a leader could actually send. Null when there is nothing honest to say. */
  nextAction: string | null;
}

function nextAfter(level: Level | null): Level | null {
  if (!level) return "LV1";
  const at = ORDER.indexOf(level);
  if (at < 0 || at === ORDER.length - 1) return null;
  return ORDER[at + 1];
}

function asLevel(value: string | null): Level | null {
  const wanted = (value ?? "").toUpperCase().trim();
  return (ORDER as string[]).includes(wanted) ? (wanted as Level) : null;
}

/** Everybody's standing, for the development page. */
export async function allProgress(): Promise<Progress[]> {
  try {
    const rows = await getDatabase()
      .prepare(
        "SELECT p.capid, p.full_name, d.pd_level, d.specialty_track, d.track_rating, d.duty_position, " +
        "COALESCE(d.source, 'MANUAL') AS source " +
        "FROM personnel_members p LEFT JOIN member_development d ON d.capid = p.capid " +
        "WHERE p.member_type = 'SENIOR' AND p.capid IS NOT NULL AND p.status = 'ACTIVE' " +
        "ORDER BY p.full_name COLLATE NOCASE"
      )
      .all<{
        capid: string; full_name: string; pd_level: string | null; specialty_track: string | null;
        track_rating: string | null; duty_position: string | null; source: string;
      }>();

    return rows.results.map((row) => describe({
      capid: row.capid,
      fullName: row.full_name,
      level: asLevel(row.pd_level),
      track: row.specialty_track,
      rating: row.track_rating,
      dutyPosition: row.duty_position,
      source: row.source
    }));
  } catch {
    return [];
  }
}

function describe(input: {
  capid: string; fullName: string; level: Level | null; track: string | null;
  rating: string | null; dutyPosition: string | null; source: string;
}): Progress {
  const next = nextAfter(input.level);

  // Said only when it is true. "Start Level I" for somebody CAPWATCH simply has no record of would be a
  // guess dressed as a fact, so that case asks for the record to be checked instead.
  const nextAction = input.level === null
    ? (input.source === "ESERVICES"
        ? "No professional development level is recorded in CAPWATCH yet. Level I is the place to start."
        : "No level is recorded. Check eServices, or run a CAPWATCH sync so this comes from CAP's own record.")
    : next
      ? "Working towards " + LEVELS[next].name + " - " + LEVELS[next].award + "."
      : null;

  return {
    capid: input.capid,
    fullName: input.fullName,
    level: input.level,
    levelName: input.level ? LEVELS[input.level].name : null,
    nextLevel: next,
    nextLevelName: next ? LEVELS[next].name : null,
    track: input.track,
    rating: input.rating,
    dutyPosition: input.dutyPosition,
    source: input.source,
    nextAction
  };
}

/** One member's standing, read fresh - a nudge must never be sent from a stale page. */
export async function progressFor(capid: string): Promise<Progress | null> {
  const row = await getDatabase()
    .prepare(
      "SELECT p.capid, p.full_name, d.pd_level, d.specialty_track, d.track_rating, d.duty_position, " +
      "COALESCE(d.source, 'MANUAL') AS source " +
      "FROM personnel_members p LEFT JOIN member_development d ON d.capid = p.capid WHERE p.capid = ?"
    )
    .bind(capid)
    .first<{
      capid: string; full_name: string; pd_level: string | null; specialty_track: string | null;
      track_rating: string | null; duty_position: string | null; source: string;
    }>();
  if (!row) return null;

  return describe({
    capid: row.capid,
    fullName: row.full_name,
    level: asLevel(row.pd_level),
    track: row.specialty_track,
    rating: row.track_rating,
    dutyPosition: row.duty_position,
    source: row.source
  });
}

/**
 * A leader's prod about somebody's next step - Mel's request.
 *
 * Deliberately a person pressing a button rather than a schedule. Read fresh at the moment of sending, so
 * what goes out is what CAPWATCH says now and not what a page said when it was opened this morning. If the
 * member has nothing outstanding, nothing is sent and the leader is told why.
 *
 * This ignores the automatic-reminder preference on purpose: turning off recurring nagging is not the same
 * as refusing to hear from your commander, and conflating them would make the setting frightening to use.
 */
export async function nudge(input: {
  capid: string;
  fromUserId: string;
  fromName: string;
  note?: string | null;
}): Promise<{ ok: boolean; message: string }> {
  const progress = await progressFor(input.capid);
  if (!progress) return { ok: false, message: "That member is not on the roster." };
  if (!progress.nextAction) {
    return { ok: false, message: progress.fullName + " has completed Level V. There is nothing to prompt." };
  }

  const target = await getDatabase()
    .prepare("SELECT id FROM users WHERE capid = ? AND status = 'APPROVED'")
    .bind(input.capid)
    .first<{ id: string }>();

  if (!target) {
    return {
      ok: false,
      message: progress.fullName + " has no Hub account, so there is nowhere to send this. Speak to them directly."
    };
  }
  if (target.id === input.fromUserId) {
    return { ok: false, message: "That would only prompt yourself." };
  }

  await notify([{
    userId: target.id,
    kind: "ASSIGNED",
    title: "Professional development: " + (progress.nextLevelName ?? "next step"),
    body: progress.nextAction + (input.note ? "\n\n" + input.fromName + " added: " + input.note : "") +
      "\n\nSent by " + input.fromName + ".",
    actorUserId: input.fromUserId,
    // One prod per member per level. A second is a conversation, not a notification.
    dedupeKey: "NUDGE:" + input.capid + ":" + (progress.nextLevel ?? "none")
  }]);

  await recordAuditEvent({
    actorUserId: input.fromUserId,
    action: "DEVELOPMENT_NUDGE_SENT",
    entityType: "member",
    entityId: input.capid,
    summary: input.fromName + " prompted " + progress.fullName + " about " + (progress.nextLevelName ?? "development"),
    metadata: { capid: input.capid, level: progress.level, nextLevel: progress.nextLevel, source: progress.source }
  });

  return { ok: true, message: "Sent to " + progress.fullName + "." };
}
