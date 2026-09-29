import { asText, BrokenArchive, readZip, type ZipEntry } from "./zip";

// Reading a CAPWATCH extract, and deliberately reading very little of it.
//
// The archive holds sixty-three tables, and far more about each member than the squadron asked for or
// declared. Member.txt alone carries date of birth for all fifty people in TN-170 - twenty-eight of them
// cadets, who are mostly minors - and MbrContact.txt carries their parents' email addresses and phone
// numbers.
//
// The unit's CAPWATCH request says senior member information only, no contact data, and no cadet CAP IDs
// anywhere in the application. Its security attestation says the Hub holds no dates of birth, no home
// addresses and no telephone numbers. Those statements are true today, and this file is where they stay
// true: the columns that would falsify them are never read out of the archive, so they cannot reach the
// database by accident later.
//
// Cadets are the sharpest case. They appear on the organisation chart by name and grade so senior members
// can see the roster, and they are matched between syncs by name rather than by CAPID - because holding a
// cadet's CAPID is exactly what the unit told CAP it would not do.

export interface SeniorRecord {
  capid: string;
  fullName: string;
  rank: string;
  /** ACTIVE or the membership status CAP reports; anything but ACTIVE means no longer current. */
  status: string;
  unit: string;
  expiration: string | null;
}

export interface CadetRecord {
  fullName: string;
  rank: string;
  status: string;
}

export interface DutyRecord {
  capid: string;
  duty: string;
  functionalArea: string;
  isAssistant: boolean;
}

export interface DevelopmentRecord {
  capid: string;
  /** LV1 to LV5 as CAP writes it, or null when the member has no level recorded. */
  level: string | null;
  track: string | null;
  /** TECHNICIAN, SENIOR or MASTER. NONE is treated as no rating rather than as a rating called none. */
  rating: string | null;
}

/** One thing a member has done: a briefing, a course, an achievement, an award, a task qualification. */
export interface MemberRecord {
  capid: string;
  kind: "SAFETY" | "TRAINING" | "ACHIEVEMENT" | "AWARD" | "TASK";
  code: string;
  title: string | null;
  functionalArea: string | null;
  completedOn: string | null;
  expiresOn: string | null;
  status: string | null;
}

export interface Extract {
  downloadedOn: string | null;
  seniors: SeniorRecord[];
  cadets: CadetRecord[];
  duties: DutyRecord[];
  development: DevelopmentRecord[];
  records: MemberRecord[];
  /** Every table the archive held, for reporting rather than for reading. */
  tableCount: number;
  /**
   * Every file the archive held, whether or not the Hub reads it.
   *
   * Kept because "does CAPWATCH contain X" keeps being asked - the van, aircraft, equipment - and answering it
   * from memory is how a feature gets built on a table that was never in the download. This makes the answer
   * something the health page can show rather than something somebody has to remember.
   */
  tableNames: string[];
}

/** A CAPWATCH text file: comma separated, quoted fields, CRLF, with a header row. */
function parseTable(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let at = 0; at < text.length; at += 1) {
    const character = text[at];

    if (quoted) {
      if (character === '"') {
        // A doubled quote inside a quoted field is a literal quote, not the end of it.
        if (text[at + 1] === '"') {
          field += '"';
          at += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  if (!rows.length) return [];
  const header = rows[0].map((name) => name.trim());
  return rows.slice(1)
    .filter((line) => line.some((value) => value.trim().length > 0))
    .map((line) => {
      const record: Record<string, string> = {};
      header.forEach((name, index) => {
        record[name] = (line[index] ?? "").trim();
      });
      return record;
    });
}

async function table(entries: ZipEntry[], name: string, required = true): Promise<Array<Record<string, string>>> {
  const entry = entries.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
  if (!entry) {
    if (required) throw new BrokenArchive("The extract has no " + name + ", so it is not a usable CAPWATCH download.");
    return [];
  }
  return parseTable(asText(await entry.bytes()));
}

/**
 * A date, unless CAP means "never".
 *
 * CAP writes 01/01/1900 where something does not expire. Stored as a date it would make every permanent
 * qualification in the squadron look decades lapsed, so it becomes null - which is what it means.
 */
function onlyRealDate(value: string | undefined): string | null {
  const said = (value ?? "").trim();
  if (!said) return null;

  // CAP writes a date in 1900 where something does not expire, and not always the same one - 01/01/1900 and
  // 01/31/1900 both appear in TN-170's own extract. Matching the literal string caught one and missed two
  // hundred records, so this rejects the whole era instead: nothing real in a CAP service record predates
  // the organisation, and a placeholder stored as a date would make every permanent qualification in the
  // squadron read as decades lapsed.
  const year = Number(said.match(/(\d{4})/)?.[1]);
  if (Number.isFinite(year) && year < 1950) return null;

  return said;
}

function nameOf(row: Record<string, string>): string {
  return [row.NameFirst, row.NameMiddle, row.NameLast, row.NameSuffix]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * Turns the archive into the handful of facts the Hub actually keeps.
 *
 * Refuses an extract with no members rather than reporting an empty unit, because "nobody is in TN-170" and
 * "the download went wrong" look identical downstream and only one of them should ever reach the database.
 */
export async function parseExtract(archive: ArrayBuffer): Promise<Extract> {
  const entries = readZip(archive);

  const members = await table(entries, "Member.txt");
  if (!members.length) throw new BrokenArchive("The extract contains no members.");

  const seniors: SeniorRecord[] = [];
  const cadets: CadetRecord[] = [];
  const seniorIds = new Set<string>();

  for (const row of members) {
    const type = (row.Type ?? "").toUpperCase();
    const rank = (row.Rank ?? "").trim();
    const status = (row.MbrStatus ?? "").trim().toUpperCase() || "UNKNOWN";
    const fullName = nameOf(row);
    if (!fullName) continue;

    if (type === "CADET") {
      // Name, grade and status. No CAPID, no date of birth, nothing else - see the note at the top.
      cadets.push({ fullName, rank, status });
      continue;
    }

    const capid = (row.CAPID ?? "").trim();
    if (!capid) continue;
    seniorIds.add(capid);
    seniors.push({
      capid,
      fullName,
      rank,
      status,
      unit: (row.Unit ?? "").trim(),
      expiration: (row.Expiration ?? "").trim() || null
    });
  }

  // Everything below is keyed by CAPID, so restricting it to senior CAPIDs is what keeps cadet identifiers
  // out of the Hub even though the tables themselves contain them.
  const duties: DutyRecord[] = (await table(entries, "DutyPosition.txt", false))
    .filter((row) => seniorIds.has((row.CAPID ?? "").trim()))
    .map((row) => ({
      capid: row.CAPID.trim(),
      duty: (row.Duty ?? "").trim(),
      functionalArea: (row.FunctArea ?? "").trim(),
      // CAP writes the assistant flag as 1, or leaves it empty.
      isAssistant: (row.Asst ?? "").trim() === "1"
    }))
    .filter((duty) => duty.duty.length > 0);

  const levels = new Map<string, string>();
  for (const row of await table(entries, "SeniorLevel.txt", false)) {
    const capid = (row.CAPID ?? "").trim();
    if (!seniorIds.has(capid)) continue;
    const level = (row.Lvl ?? "").trim().toUpperCase();
    if (!level) continue;
    // A member holds several rows as they progress; the highest is where they are.
    const held = levels.get(capid);
    if (!held || level > held) levels.set(capid, level);
  }

  const tracks = new Map<string, { track: string; rating: string | null }>();
  for (const row of await table(entries, "SpecTrack.txt", false)) {
    const capid = (row.CAPID ?? "").trim();
    if (!seniorIds.has(capid)) continue;
    const track = (row.Track ?? "").trim();
    const rating = (row.TrackLevel ?? "").trim().toUpperCase();
    if (!track) continue;
    const scored = rating === "MASTER" ? 3 : rating === "SENIOR" ? 2 : rating === "TECHNICIAN" ? 1 : 0;
    const held = tracks.get(capid);
    const heldScore = held?.rating === "MASTER" ? 3 : held?.rating === "SENIOR" ? 2 : held?.rating === "TECHNICIAN" ? 1 : 0;
    // The track they have got furthest in is the one worth showing.
    if (!held || scored > heldScore) {
      tracks.set(capid, { track, rating: scored > 0 ? rating : null });
    }
  }

  const development: DevelopmentRecord[] = [...seniorIds].map((capid) => ({
    capid,
    level: levels.get(capid) ?? null,
    track: tracks.get(capid)?.track ?? null,
    rating: tracks.get(capid)?.rating ?? null
  })).filter((record) => record.level || record.track);

  // ---------------------------------------------------------------- service record
  //
  // Everything below is keyed by CAPID and filtered to senior members, which is what keeps cadet records -
  // and with them any question about holding data on minors - out of this entirely.
  const records: MemberRecord[] = [];

  const achievementNames = new Map<string, { name: string; area: string | null }>();
  for (const row of await table(entries, "Achievements.txt", false)) {
    const id = (row.AchvID ?? "").trim();
    if (id) achievementNames.set(id, { name: (row.Achv ?? "").trim(), area: (row.FunctionalArea ?? "").trim() || null });
  }

  const taskNames = new Map<string, { name: string; area: string | null }>();
  for (const row of await table(entries, "Tasks.txt", false)) {
    const id = (row.TaskID ?? "").trim();
    if (id) taskNames.set(id, { name: (row.TaskName ?? "").trim(), area: (row.FunctionalArea ?? "").trim() || null });
  }

  for (const row of await table(entries, "SafetyBriefingsMonthly.txt", false)) {
    const capid = (row.CAPID ?? "").trim();
    if (!seniorIds.has(capid)) continue;
    const code = (row.BriefingID ?? "").trim();
    if (!code) continue;
    records.push({
      capid,
      kind: "SAFETY",
      code,
      title: (row.Title ?? "").trim() || (row.OtherBriefings ?? "").trim() || null,
      functionalArea: null,
      completedOn: onlyRealDate(row.DateCompleted),
      expiresOn: onlyRealDate(row.ExpirationDate),
      status: null
    });
  }

  for (const row of await table(entries, "Training.txt", false)) {
    const capid = (row.CAPID ?? "").trim();
    if (!seniorIds.has(capid)) continue;
    const code = (row.TypeCrs ?? "").trim();
    if (!code) continue;
    records.push({
      capid, kind: "TRAINING", code,
      title: code,
      functionalArea: (row.HowComplete ?? "").trim() || null,
      completedOn: onlyRealDate(row.Completed),
      expiresOn: null,
      status: null
    });
  }

  for (const row of await table(entries, "MbrAchievements.txt", false)) {
    const capid = (row.CAPID ?? "").trim();
    if (!seniorIds.has(capid)) continue;
    const code = (row.AchvID ?? "").trim();
    if (!code) continue;
    const known = achievementNames.get(code);
    records.push({
      capid, kind: "ACHIEVEMENT", code,
      title: known?.name ?? null,
      functionalArea: known?.area ?? null,
      completedOn: onlyRealDate(row.Completed) ?? onlyRealDate(row.OriginallyAccomplished),
      expiresOn: onlyRealDate(row.Expiration),
      status: (row.Status ?? "").trim() || null
    });
  }

  for (const row of await table(entries, "SeniorAwards.txt", false)) {
    const capid = (row.CAPID ?? "").trim();
    if (!seniorIds.has(capid)) continue;
    const code = (row.Award ?? "").trim();
    if (!code) continue;
    records.push({
      capid, kind: "AWARD", code, title: code, functionalArea: null,
      completedOn: onlyRealDate(row.Completed), expiresOn: null, status: null
    });
  }

  for (const row of await table(entries, "MbrTasks.txt", false)) {
    const capid = (row.CAPID ?? "").trim();
    if (!seniorIds.has(capid)) continue;
    const code = (row.TaskID ?? "").trim();
    if (!code) continue;
    const known = taskNames.get(code);
    records.push({
      capid, kind: "TASK", code,
      title: known?.name ?? null,
      functionalArea: known?.area ?? null,
      completedOn: onlyRealDate(row.Completed),
      expiresOn: onlyRealDate(row.Expiration),
      status: (row.Status ?? "").trim() || null
    });
  }

  let downloadedOn: string | null = null;
  const stamp = entries.find((entry) => entry.name.toLowerCase() === "downloaddate.txt");
  if (stamp) {
    const lines = asText(await stamp.bytes()).split(/\r?\n/).filter(Boolean);
    downloadedOn = lines.length > 1 ? lines[1].trim() : null;
  }

  return {
    downloadedOn, seniors, cadets, duties, development, records,
    tableCount: entries.length,
    tableNames: entries.map((entry) => entry.name).sort()
  };
}
