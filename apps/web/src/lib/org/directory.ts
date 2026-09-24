import { getUserGoogleAccessToken } from "@/lib/auth/google-oauth";
import { getCloudflareEnv, getDatabase } from "@/lib/cloudflare";
import { capidFromLookup, rosterLookup } from "./roster";

// The org directory answers "who can I give this to?" the way Gmail does: you type a name, you pick a person.
// Two sources are merged. Hub accounts are people who can already be assigned work. The TN-170 Shared Drive
// membership is everyone command staff has given squadron access to, which is the real roster — those people
// may not have signed into the Hub yet, so choosing one creates their account on the spot (see ensurePerson).
const DRIVE_API = "https://www.googleapis.com/drive/v3";

export interface DirectoryPerson {
  /** Present when the person already has a Hub account and can be assigned work immediately. */
  userId: string | null;
  email: string;
  fullName: string;
  dutyTitle: string | null;
  /** Where we learned about them. "drive" means Shared Drive access but no Hub account yet. */
  source: "hub" | "drive";
  /** A Hub account that exists but has never been signed into. */
  pending: boolean;
  /** From the eServices roster, when the address can be tied to a CAPID. */
  capid: string | null;
  rank: string | null;
  /** Every other address that reaches the same person, so one member is one row in the list. */
  alsoKnownAs: string[];
  /**
   * Whether work can be given to them at all. Somebody recorded on leave or inactive is still in the
   * directory - they are still a member, and hiding them only raises "why is this person missing" - but
   * they must not be handed new work while they are away.
   */
  availability?: "ACTIVE" | "LEAVE" | "INACTIVE";
}

interface DrivePermission {
  emailAddress?: string;
  displayName?: string;
  type?: string;
  deleted?: boolean;
}

export interface DirectoryResult {
  people: DirectoryPerson[];
  /** Set when Shared Drive membership could not be read; the Hub accounts are still returned. */
  driveNote: string | null;
}

export async function listDirectory(actorUserId: string, query = ""): Promise<DirectoryResult> {
  const [hub, drive, roster] = await Promise.all([hubPeople(), drivePeople(actorUserId), rosterLookup()]);

  const byEmail = new Map<string, DirectoryPerson>();
  hub.forEach((person) => byEmail.set(person.email, person));
  drive.people.forEach((person) => {
    if (byEmail.has(person.email)) return;
    byEmail.set(person.email, person);
  });

  // Name people the way CAP does. Google's display names are inconsistent, and some are just the CAPID.
  byEmail.forEach((person) => {
    const capid = capidFromLookup(person.email, roster);
    const member = capid ? roster.byCapid.get(capid) : null;
    person.capid = capid;
    if (!member) return;
    person.fullName = member.fullName;
    person.rank = member.rank || null;
  });

  // One member, one row. Somebody with a CAP address, a personal address and a Drive share is one person,
  // and showing them three times is exactly the confusion this list exists to remove.
  const byPerson = new Map<string, DirectoryPerson>();
  byEmail.forEach((person) => {
    const key = person.capid ? "capid:" + person.capid : "email:" + person.email;
    const held = byPerson.get(key);
    if (!held) {
      byPerson.set(key, person);
      return;
    }
    // Prefer the entry that can be assigned work right now; keep the other address against the name.
    const keep = held.userId ? held : person.userId ? person : held;
    const drop = keep === held ? person : held;
    keep.alsoKnownAs = [...new Set([...keep.alsoKnownAs, ...drop.alsoKnownAs, drop.email])].filter((email) => email !== keep.email);
    keep.dutyTitle = keep.dutyTitle ?? drop.dutyTitle;
    byPerson.set(key, keep);
  });

  // Who is away. Recorded against the personnel record, so it is found by CAPID rather than by address.
  const away = await awayByCapid();
  byPerson.forEach((person) => {
    person.availability = (person.capid ? away.get(person.capid) : undefined) ?? "ACTIVE";
  });

  const needle = query.trim().toLowerCase();
  const people = [...byPerson.values()]
    .filter((person) => !needle || [person.fullName, person.email, person.capid ?? "", ...person.alsoKnownAs].some((value) => value.toLowerCase().includes(needle)))
    .sort((left, right) => {
      // People who can be assigned right now come first; then alphabetical, so the list never reshuffles oddly.
      const leftAway = left.availability && left.availability !== "ACTIVE";
      const rightAway = right.availability && right.availability !== "ACTIVE";
      if (leftAway !== rightAway) return leftAway ? 1 : -1;
      if (Boolean(left.userId) !== Boolean(right.userId)) return left.userId ? -1 : 1;
      return surname(left.fullName).localeCompare(surname(right.fullName)) || left.fullName.localeCompare(right.fullName);
    });

  return { people, driveNote: drive.note };
}

/**
 * Of the accounts given, the ones that must not be handed new work, with the reason.
 *
 * The picker greys these out, but a greyed button is a courtesy and not a rule: the same assignment can
 * arrive from the bulk bar, the assistant, or anything else that calls the API. This is where it is
 * actually refused.
 */
export async function unavailableAssignees(userIds: string[]): Promise<Array<{ userId: string; fullName: string; status: "LEAVE" | "INACTIVE" }>> {
  if (!userIds.length) return [];
  try {
    const marks = userIds.map(() => "?").join(",");
    const rows = await getDatabase()
      .prepare(
        "SELECT user_id, full_name, status FROM personnel_members " +
        "WHERE user_id IN (" + marks + ") AND status IN ('LEAVE','INACTIVE')"
      )
      .bind(...userIds)
      .all<{ user_id: string; full_name: string; status: "LEAVE" | "INACTIVE" }>();
    return rows.results.map((row) => ({ userId: row.user_id, fullName: row.full_name, status: row.status }));
  } catch {
    return [];
  }
}

/** CAPIDs of members who are on leave or inactive, so the caller can say who cannot take work. */
export async function awayByCapid(): Promise<Map<string, "LEAVE" | "INACTIVE">> {
  const away = new Map<string, "LEAVE" | "INACTIVE">();
  try {
    const rows = await getDatabase()
      .prepare("SELECT capid, status FROM personnel_members WHERE capid IS NOT NULL AND status IN ('LEAVE','INACTIVE')")
      .all<{ capid: string; status: "LEAVE" | "INACTIVE" }>();
    rows.results.forEach((row) => away.set(row.capid, row.status));
  } catch {
    // No personnel records yet is not a reason to stop the directory working.
  }
  return away;
}

async function hubPeople(): Promise<DirectoryPerson[]> {
  const result = await getDatabase()
    .prepare(
      "SELECT id, email, full_name, duty_title, status FROM users WHERE status IN ('APPROVED','PENDING') ORDER BY full_name COLLATE NOCASE"
    )
    .all<{ id: string; email: string; full_name: string; duty_title: string | null; status: string }>();
  return result.results.map((row) => ({
    userId: row.id,
    email: row.email.toLowerCase(),
    fullName: row.full_name,
    dutyTitle: row.duty_title,
    source: "hub" as const,
    pending: row.status === "PENDING",
    capid: null,
    rank: null,
    alsoKnownAs: []
  }));
}

async function drivePeople(actorUserId: string): Promise<{ people: DirectoryPerson[]; note: string | null }> {
  const driveId = getCloudflareEnv().GOOGLE_SHARED_DRIVE_ID;
  if (!driveId) return { people: [], note: "The squadron Shared Drive is not configured, so only Hub accounts are listed." };

  try {
    const token = await getUserGoogleAccessToken(actorUserId);
    const people: DirectoryPerson[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(DRIVE_API + "/files/" + encodeURIComponent(driveId) + "/permissions");
      url.searchParams.set("supportsAllDrives", "true");
      url.searchParams.set("pageSize", "100");
      url.searchParams.set("fields", "nextPageToken,permissions(emailAddress,displayName,type,deleted)");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const response = await fetch(url, { headers: { Authorization: "Bearer " + token } });
      if (!response.ok) {
        // Reading drive membership needs organizer rights. Anyone else still gets the Hub accounts.
        return {
          people: [],
          note: response.status === 403 || response.status === 404
            ? "Shared Drive membership is only readable by drive managers, so this list shows Hub accounts only."
            : "Shared Drive membership could not be read just now, so this list shows Hub accounts only."
        };
      }

      const payload = await response.json<{ permissions?: DrivePermission[]; nextPageToken?: string }>();
      (payload.permissions ?? []).forEach((permission) => {
        if (permission.deleted) return;
        if (permission.type !== "user") return; // groups and domain-wide grants are not a person you can assign to
        const email = permission.emailAddress?.toLowerCase();
        if (!email) return;
        people.push({
          userId: null,
          email,
          fullName: permission.displayName?.trim() || email.split("@")[0],
          dutyTitle: null,
          source: "drive",
          pending: false,
          capid: null,
          rank: null,
          alsoKnownAs: []
        });
      });
      pageToken = payload.nextPageToken;
    } while (pageToken);

    return { people, note: null };
  } catch {
    return { people: [], note: "Reconnect Google Drive to see everyone with squadron access; this list shows Hub accounts only." };
  }
}

/**
 * Turns a directory entry into something assignable. A Hub account is returned as-is; a Shared Drive person
 * gets a PENDING account, which joins up with their Google sign-in automatically on the email address.
 */
export async function ensurePerson(input: { email: string; fullName: string }): Promise<{ userId: string; created: boolean }> {
  const email = input.email.trim().toLowerCase();
  const db = getDatabase();
  const existing = await db.prepare("SELECT id FROM users WHERE lower(email) = ?").bind(email).first<{ id: string }>();
  if (existing) return { userId: existing.id, created: false };

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      "INSERT INTO users (id, email, full_name, capid, duty_title, status, global_role, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, 'PENDING', 'STAFF_MEMBER', ?, ?)"
    )
    .bind(id, email, input.fullName.trim() || email.split("@")[0], now, now)
    .run();
  return { userId: id, created: true };
}

function surname(name: string): string {
  const parts = name.replace(/,.*$/, "").split(/\s+/).filter((part) => part && !/^(jr|sr|ii|iii|iv)\.?$/i.test(part));
  return (name.includes(",") ? name.split(",")[0] : parts[parts.length - 1] ?? name).toLowerCase();
}
