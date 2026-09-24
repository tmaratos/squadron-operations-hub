import { getDatabase } from "@/lib/cloudflare";

// Who holds what, how far along they are, and what would move them forward.
//
// Mel Osborne asked whether the Hub could work out who is in which position, see where they are in
// professional development, and prompt them to advance. It can do all three - but only from what it has
// actually been told. CAP holds this in eServices and squadron accounts cannot read it automatically, so
// the position and level are pasted in or set by hand, and the requirements come from the regulation in
// the squadron's own Drive rather than from a model's recollection of CAP policy.

export const LEVELS = ["I", "II", "III", "IV", "V"] as const;
export type Level = (typeof LEVELS)[number];

export interface MemberDevelopment {
  capid: string;
  fullName: string;
  dutyPosition: string | null;
  /** Where the position came from: set here, or read from the squadron's staff records. */
  positionSource: "SET" | "CHART" | null;
  /** The staff record's version, kept visible even when it is being ignored. */
  chartPosition: string | null;
  ignoreSource: boolean;
  pdLevel: string | null;
  specialtyTrack: string | null;
  trackRating: string | null;
  hasAccount: boolean;
  userId: string | null;
}

export interface DevelopmentStep {
  id: string;
  fromLevel: string;
  toLevel: string;
  title: string;
  detail: string | null;
  sourceCitation: string | null;
  sourceQuote: string | null;
  confidence: "UNVERIFIED" | "CONFIRMED" | "REJECTED";
}

export async function listDevelopment(): Promise<MemberDevelopment[]> {
  try {
    const rows = await getDatabase()
      .prepare(
        // The squadron already records who holds which position on the staff page. Asking for it a second
        // time would be the Hub making somebody type what it already knows, so that is the default and
        // anything set here only overrides it.
        "SELECT p.capid, p.full_name, p.user_id, d.pd_level, d.specialty_track, d.track_rating, " +
        "d.duty_position AS set_position, COALESCE(d.ignore_source, 0) AS ignore_source, " +
        // Every position they hold, not the first one. Taking one meant the Logistics Officer read as
        // Deputy Commander for Seniors and the Administration Officer as Finance Officer, so work
        // belonging to a real, filled role looked like it belonged to nobody.
        "(SELECT GROUP_CONCAT(pos.title, '; ') FROM (SELECT title, incumbent_id FROM personnel_positions ORDER BY display_order) pos " +
        "WHERE pos.incumbent_id = p.id) AS chart_position " +
        "FROM personnel_members p LEFT JOIN member_development d ON d.capid = p.capid " +
        "WHERE p.capid IS NOT NULL AND p.status = 'ACTIVE' ORDER BY p.full_name COLLATE NOCASE"
      )
      .all<{ capid: string; full_name: string; user_id: string | null; set_position: string | null; chart_position: string | null; ignore_source: number; pd_level: string | null; specialty_track: string | null; track_rating: string | null }>();

    // The chart is a starting point, not the truth. What was set here wins, and either the whole chart or
    // one person's entry can be told to stay out of it.
    const ignoreChart = (await getSetting("ignore_position_chart")) === "1";
    return rows.results.map((row) => {
      const ignoreSource = Boolean(row.ignore_source) || ignoreChart;
      const fromChart = ignoreSource ? null : row.chart_position;
      return {
      capid: row.capid,
      fullName: row.full_name,
      userId: row.user_id,
      hasAccount: Boolean(row.user_id),
      dutyPosition: row.set_position ?? fromChart,
      positionSource: row.set_position ? ("SET" as const) : fromChart ? ("CHART" as const) : null,
      chartPosition: row.chart_position,
      ignoreSource,
      pdLevel: row.pd_level,
      specialtyTrack: row.specialty_track,
      trackRating: row.track_rating
      };
    });
  } catch {
    return [];
  }
}

export async function getSetting(key: string): Promise<string | null> {
  try {
    const row = await getDatabase().prepare("SELECT value FROM hub_settings WHERE key = ?").bind(key).first<{ value: string }>();
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export async function setSetting(key: string, value: string, userId: string): Promise<void> {
  await getDatabase()
    .prepare(
      "INSERT INTO hub_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at"
    )
    .bind(key, value, userId, new Date().toISOString())
    .run();
}

export async function saveDevelopment(input: {
  capid: string;
  dutyPosition?: string | null;
  /** True clears what was set here, so the staff record shows through again. */
  clearPosition?: boolean;
  ignoreSource?: boolean;
  pdLevel?: string | null;
  specialtyTrack?: string | null;
  trackRating?: string | null;
  source?: "ESERVICES" | "MANUAL";
  updatedBy: string;
}): Promise<void> {
  const now = new Date().toISOString();
  await getDatabase()
    .prepare(
      "INSERT INTO member_development (capid, duty_position, pd_level, specialty_track, track_rating, ignore_source, source, updated_by, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(capid) DO UPDATE SET " +
      (input.clearPosition ? "duty_position = NULL, " : "duty_position = COALESCE(excluded.duty_position, member_development.duty_position), ") +
      (input.ignoreSource === undefined ? "" : "ignore_source = excluded.ignore_source, ") +
      "pd_level = COALESCE(excluded.pd_level, member_development.pd_level), " +
      "specialty_track = COALESCE(excluded.specialty_track, member_development.specialty_track), " +
      "track_rating = COALESCE(excluded.track_rating, member_development.track_rating), " +
      "source = excluded.source, updated_by = excluded.updated_by, updated_at = excluded.updated_at"
    )
    .bind(
      input.capid,
      input.dutyPosition ?? null,
      input.pdLevel ?? null,
      input.specialtyTrack ?? null,
      input.trackRating ?? null,
      input.ignoreSource ? 1 : 0,
      input.source ?? "MANUAL",
      input.updatedBy,
      now
    )
    .run();

  // A duty position on a member is also what tells the duty generator who owns that position's work.
  if (input.dutyPosition) {
    await getDatabase()
      .prepare("UPDATE users SET duty_title = ?, updated_at = ? WHERE capid = ?")
      .bind(input.dutyPosition, now, input.capid)
      .run();
  }
}

export async function listSteps(includeUnverified = true): Promise<DevelopmentStep[]> {
  try {
    const rows = await getDatabase()
      .prepare(
        "SELECT id, from_level, to_level, title, detail, source_citation, source_quote, confidence FROM development_steps " +
        (includeUnverified ? "WHERE active = 1 " : "WHERE active = 1 AND confidence = 'CONFIRMED' ") +
        "ORDER BY from_level, title"
      )
      .all<{ id: string; from_level: string; to_level: string; title: string; detail: string | null; source_citation: string | null; source_quote: string | null; confidence: DevelopmentStep["confidence"] }>();
    return rows.results.map((row) => ({
      id: row.id,
      fromLevel: row.from_level,
      toLevel: row.to_level,
      title: row.title,
      detail: row.detail,
      sourceCitation: row.source_citation,
      sourceQuote: row.source_quote,
      confidence: row.confidence
    }));
  } catch {
    return [];
  }
}

export async function saveStep(input: {
  fromLevel: string;
  toLevel: string;
  title: string;
  detail?: string | null;
  sourceCitation?: string | null;
  userId: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  // Entered by a person, so it is confirmed by definition - unlike anything a model proposes.
  await getDatabase()
    .prepare(
      "INSERT INTO development_steps (id, from_level, to_level, title, detail, source_citation, source_quote, confidence, active, created_by, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, NULL, 'CONFIRMED', 1, ?, ?, ?)"
    )
    .bind(id, input.fromLevel, input.toLevel, input.title.trim(), input.detail?.trim() || null, input.sourceCitation?.trim() || null, input.userId, now, now)
    .run();
  return id;
}

export async function setStepConfidence(stepId: string, confidence: DevelopmentStep["confidence"]): Promise<void> {
  await getDatabase()
    .prepare("UPDATE development_steps SET confidence = ?, updated_at = ? WHERE id = ?")
    .bind(confidence, new Date().toISOString(), stepId)
    .run();
}

export async function deleteStep(stepId: string): Promise<void> {
  await getDatabase().prepare("UPDATE development_steps SET active = 0 WHERE id = ?").bind(stepId).run();
}

/** What this member would do next. Empty when nobody has told the Hub their level, or recorded the ladder. */
export function nextStepsFor(member: MemberDevelopment, steps: DevelopmentStep[]): DevelopmentStep[] {
  if (!member.pdLevel) return [];
  return steps.filter((step) => step.confidence === "CONFIRMED" && step.fromLevel === member.pdLevel);
}

/**
 * Reads the eServices duty position listing. Each line carries a CAPID and a position; anything else in
 * the paste is ignored, the same way the roster import works.
 */
export function parseDutyPositions(text: string): Array<{ capid: string; dutyPosition: string }> {
  const found = new Map<string, string>();
  text.split(/\r?\n/).forEach((line) => {
    const match = line.trim().match(/^(\d{5,7})[\s\t]+(.+)$/);
    if (!match) return;
    // The line is "CAPID <name> <position>" or "CAPID <position>"; the position is what follows a run of
    // at least two spaces or a tab, which is how eServices separates its columns.
    const rest = match[2];
    const columns = rest.split(/\t|\s{2,}/).map((part) => part.trim()).filter(Boolean);
    const position = columns.length > 1 ? columns[columns.length - 1] : columns[0];
    if (!position || position.length < 3 || /^\d+$/.test(position)) return;
    found.set(match[1], position.slice(0, 120));
  });
  return [...found.entries()].map(([capid, dutyPosition]) => ({ capid, dutyPosition }));
}
