import { getDatabase } from "@/lib/cloudflare";

// The squadron roster, keyed by CAPID. It is what turns "577946@tncap.us" into "2d Lt Guy R Cooper".
// Loaded from what eServices already shows every member (Personnel > Member Email Addresses), pasted in as-is.

const CAP_DOMAIN = "tncap.us";

// Longest first, so "Lt Col" is not read as "Col" and "1st Lt" not as "Lt".
const RANKS = [
  "Maj Gen", "Brig Gen", "Lt Col", "1st Lt", "2d Lt", "C/Lt Col", "C/Maj", "C/Capt", "C/1st Lt", "C/2d Lt",
  "C/CMSgt", "C/SMSgt", "C/MSgt", "C/TSgt", "C/SSgt", "C/SrA", "C/A1C", "C/Amn", "C/AB", "C/Col",
  "CMSgt", "SMSgt", "MSgt", "TSgt", "SSgt", "SFO", "TFO", "CWO", "Capt", "Col", "Maj", "FO", "SM", "Amn"
].sort((left, right) => right.length - left.length);

export interface RosterEntry {
  capid: string;
  rank: string;
  fullName: string;
  memberType: "SENIOR" | "CADET";
}

export interface RosterMember extends RosterEntry {
  userId: string | null;
}

/** Reads the text of the eServices member list: one "CAPID  Rank First M Last" per line. Everything else is ignored. */
export function parseRoster(text: string): RosterEntry[] {
  const entries = new Map<string, RosterEntry>();
  text.split(/\r?\n/).forEach((line) => {
    const match = line.trim().match(/^(\d{5,7})\s+(.+)$/);
    if (!match) return;
    const capid = match[1];
    const rest = match[2].replace(/\s+/g, " ").trim();
    const rank = RANKS.find((candidate) => rest === candidate || rest.startsWith(candidate + " ")) ?? "";
    const fullName = (rank ? rest.slice(rank.length) : rest).trim();
    if (!fullName) return;
    entries.set(capid, { capid, rank, fullName, memberType: rank.startsWith("C/") ? "CADET" : "SENIOR" });
  });
  return [...entries.values()];
}

function firstAndLast(name: string): string {
  // "Steven Mellard", "Steven C Mellard" and "Mellard, Steven" are one person; "Jr" is not a surname.
  const cleaned = name.includes(",") ? name.split(",").reverse().join(" ") : name;
  const parts = cleaned.toLowerCase().replace(/[^a-z\s-]/g, " ").split(/\s+/).filter((part) => part && !["jr", "sr", "ii", "iii", "iv"].includes(part));
  if (parts.length < 2) return parts.join(" ");
  return parts[0] + " " + parts[parts.length - 1];
}

export async function importRoster(entries: RosterEntry[]): Promise<{ added: number; updated: number; linked: number }> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const existing = await db
    .prepare("SELECT id, capid, full_name FROM personnel_members")
    .all<{ id: string; capid: string | null; full_name: string }>();

  const byCapid = new Map(existing.results.filter((row) => row.capid).map((row) => [row.capid as string, row]));
  const byName = new Map(existing.results.filter((row) => !row.capid).map((row) => [firstAndLast(row.full_name), row]));

  let added = 0;
  let updated = 0;
  const statements: Array<ReturnType<typeof db.prepare>> = [];

  entries.forEach((entry) => {
    // Earlier records were entered by hand without a CAPID; adopt them by name rather than creating a duplicate.
    const match = byCapid.get(entry.capid) ?? byName.get(firstAndLast(entry.fullName));
    if (match) {
      byName.delete(firstAndLast(match.full_name));
      statements.push(
        db.prepare("UPDATE personnel_members SET capid = ?, rank = ?, full_name = ?, member_type = ?, status = 'ACTIVE', source_date = ?, updated_at = ? WHERE id = ?")
          .bind(entry.capid, entry.rank, entry.fullName, entry.memberType, today, now, match.id)
      );
      updated += 1;
    } else {
      statements.push(
        db.prepare("INSERT INTO personnel_members (id, capid, rank, full_name, member_type, status, source_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)")
          .bind("pm-" + entry.capid, entry.capid, entry.rank, entry.fullName, entry.memberType, today, now, now)
      );
      added += 1;
    }
  });

  for (let index = 0; index < statements.length; index += 50) {
    await db.batch(statements.slice(index, index + 50));
  }
  const linked = await linkAccountsToRoster();
  return { added, updated, linked };
}

/** The CAPID an address belongs to: a squadron address carries it, anything else must have been linked by a person. */
export async function capidForEmail(email: string): Promise<string | null> {
  const address = email.trim().toLowerCase();
  const own = address.match(new RegExp("^(\\d{5,7})@" + CAP_DOMAIN.replace(".", "\\.") + "$"));
  if (own) return own[1];
  try {
    const row = await getDatabase().prepare("SELECT capid FROM member_email_links WHERE email = ?").bind(address).first<{ capid: string }>();
    return row?.capid ?? null;
  } catch {
    return null;
  }
}

export async function rosterMemberForEmail(email: string): Promise<RosterMember | null> {
  const capid = await capidForEmail(email);
  if (!capid) return null;
  try {
    const row = await getDatabase()
      .prepare("SELECT capid, rank, full_name, member_type, user_id FROM personnel_members WHERE capid = ?")
      .bind(capid)
      .first<{ capid: string; rank: string; full_name: string; member_type: string; user_id: string | null }>();
    return row ? { capid: row.capid, rank: row.rank, fullName: row.full_name, memberType: row.member_type === "CADET" ? "CADET" : "SENIOR", userId: row.user_id } : null;
  } catch {
    return null;
  }
}

/** Everything needed to name people in one read, for lists that show many at once. */
export async function rosterLookup(): Promise<{ byCapid: Map<string, RosterMember>; linkedEmails: Map<string, string> }> {
  const db = getDatabase();
  try {
    const [members, links] = await Promise.all([
      db.prepare("SELECT capid, rank, full_name, member_type, user_id FROM personnel_members WHERE capid IS NOT NULL")
        .all<{ capid: string; rank: string; full_name: string; member_type: string; user_id: string | null }>(),
      db.prepare("SELECT email, capid FROM member_email_links").all<{ email: string; capid: string }>()
    ]);
    return {
      byCapid: new Map(members.results.map((row) => [row.capid, { capid: row.capid, rank: row.rank, fullName: row.full_name, memberType: row.member_type === "CADET" ? "CADET" : "SENIOR", userId: row.user_id }])),
      linkedEmails: new Map(links.results.map((row) => [row.email.toLowerCase(), row.capid]))
    };
  } catch {
    return { byCapid: new Map(), linkedEmails: new Map() };
  }
}

export function capidFromLookup(email: string, lookup: { linkedEmails: Map<string, string> }): string | null {
  const address = email.trim().toLowerCase();
  const own = address.match(/^(\d{5,7})@tncap\.us$/);
  return own ? own[1] : lookup.linkedEmails.get(address) ?? null;
}

/**
 * Names every Hub account after its roster entry, and records the CAPID on the account.
 * Run after an import and after a link, so a correction shows up everywhere at once.
 */
export async function linkAccountsToRoster(): Promise<number> {
  const db = getDatabase();
  const lookup = await rosterLookup();
  const users = await db.prepare("SELECT id, email, full_name, capid FROM users").all<{ id: string; email: string; full_name: string; capid: string | null }>();
  const now = new Date().toISOString();
  const statements: Array<ReturnType<typeof db.prepare>> = [];

  users.results.forEach((user) => {
    const capid = capidFromLookup(user.email, lookup);
    const member = capid ? lookup.byCapid.get(capid) : null;
    if (!capid || !member) return;
    statements.push(db.prepare("UPDATE users SET full_name = ?, capid = ?, updated_at = ? WHERE id = ?").bind(member.fullName, capid, now, user.id));
    statements.push(db.prepare("UPDATE personnel_members SET user_id = NULL WHERE user_id = ? AND (capid IS NULL OR capid <> ?)").bind(user.id, capid));
    statements.push(db.prepare("UPDATE personnel_members SET user_id = ?, updated_at = ? WHERE capid = ?").bind(user.id, now, capid));
  });

  for (let index = 0; index < statements.length; index += 60) {
    await db.batch(statements.slice(index, index + 60));
  }
  return statements.length / 3;
}

export async function linkEmailToMember(input: { email: string; capid: string; linkedBy: string }): Promise<void> {
  const db = getDatabase();
  const member = await db.prepare("SELECT capid FROM personnel_members WHERE capid = ?").bind(input.capid).first<{ capid: string }>();
  if (!member) throw new Error("That CAPID is not on the roster.");
  await db
    .prepare("INSERT INTO member_email_links (email, capid, linked_by, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET capid = excluded.capid, linked_by = excluded.linked_by, created_at = excluded.created_at")
    .bind(input.email.trim().toLowerCase(), input.capid, input.linkedBy, new Date().toISOString())
    .run();
  await linkAccountsToRoster();
}

export async function unlinkEmail(email: string): Promise<void> {
  await getDatabase().prepare("DELETE FROM member_email_links WHERE email = ?").bind(email.trim().toLowerCase()).run();
}

export async function listRoster(): Promise<RosterMember[]> {
  try {
    const rows = await getDatabase()
      .prepare("SELECT capid, rank, full_name, member_type, user_id FROM personnel_members WHERE capid IS NOT NULL AND status = 'ACTIVE' ORDER BY full_name COLLATE NOCASE")
      .all<{ capid: string; rank: string; full_name: string; member_type: string; user_id: string | null }>();
    return rows.results.map((row) => ({ capid: row.capid, rank: row.rank, fullName: row.full_name, memberType: row.member_type === "CADET" ? "CADET" : "SENIOR", userId: row.user_id }));
  } catch {
    return [];
  }
}

/**
 * A hint for a person linking an address by hand: the roster member whose surname appears in it.
 * Only ever shown as a suggestion. "alharvey199830@gmail.com" suggests Harvey; a person still decides.
 */
export function suggestMember(email: string, roster: RosterMember[]): RosterMember | null {
  const local = email.split("@")[0].toLowerCase().replace(/[^a-z]/g, "");
  if (local.length < 4) return null;
  const hits = roster.filter((member) => {
    const surname = firstAndLast(member.fullName).split(" ").pop() ?? "";
    return surname.length >= 4 && local.includes(surname);
  });
  return hits.length === 1 ? hits[0] : null;
}
