import { getUserGoogleAccessToken } from "@/lib/auth/google-oauth";
import { getCloudflareEnv, getDatabase } from "@/lib/cloudflare";

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
  const [hub, drive] = await Promise.all([hubPeople(), drivePeople(actorUserId)]);

  const byEmail = new Map<string, DirectoryPerson>();
  hub.forEach((person) => byEmail.set(person.email, person));
  drive.people.forEach((person) => {
    if (byEmail.has(person.email)) return;
    byEmail.set(person.email, person);
  });

  const needle = query.trim().toLowerCase();
  const people = [...byEmail.values()]
    .filter((person) => !needle || person.fullName.toLowerCase().includes(needle) || person.email.toLowerCase().includes(needle))
    .sort((left, right) => {
      // People who can be assigned right now come first; then alphabetical, so the list never reshuffles oddly.
      if (Boolean(left.userId) !== Boolean(right.userId)) return left.userId ? -1 : 1;
      return left.fullName.localeCompare(right.fullName);
    });

  return { people, driveNote: drive.note };
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
    pending: row.status === "PENDING"
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
          pending: false
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
