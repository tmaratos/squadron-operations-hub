import { getDatabase } from "@/lib/cloudflare";
import { notify } from "@/lib/notify/notifications";
import { mailConfigured, sendMail } from "@/lib/notify/mail";
import { addressesForCapid } from "@/lib/org/roster";

// Telling a department something, when a department is a group of people rather than an account.
//
// A goal that belongs to Cadet Programs has to reach whoever holds a Cadet Programs post. There is no inbox
// for a department and there should not be one: post holders change, and a shared address is how a thing ends
// up being nobody's.
//
// The awkward part, and the reason this is not three lines: several posts in TN-170 are held by members with
// no Hub account. Notifying only the accounts would silently miss them - and the ones missed are exactly the
// members least likely to notice, because they are not in the Hub to see it. Every member has a CAP address
// whether or not they have ever signed in, so they get an email even when there is nothing to notify.

export interface DepartmentMember {
  userId: string | null;
  capid: string | null;
  fullName: string;
  dutyTitle: string;
}

/**
 * Who currently holds a post in this department.
 *
 * Only posts that have not ended, and one row per person however many posts they hold - somebody who is both
 * the Testing Officer and the Education and Training Officer is one person to tell, not two.
 */
export async function peopleInDepartment(areaKey: string): Promise<DepartmentMember[]> {
  const rows = await getDatabase()
    .prepare(
      "SELECT COALESCE(d.user_id, u.id) AS user_id, p.capid, " +
      "COALESCE(p.full_name, u.full_name) AS full_name, d.duty_title " +
      "FROM duty_assignments d " +
      "LEFT JOIN personnel_members p ON p.id = d.personnel_member_id " +
      "LEFT JOIN users u ON u.capid = p.capid AND u.status = 'APPROVED' " +
      "WHERE d.functional_area_key = ? AND d.ends_on IS NULL " +
      // The primary post first, so the title shown against somebody is the one they would call themselves.
      "ORDER BY d.is_primary DESC, d.duty_title"
    )
    .bind(areaKey)
    .all<{ user_id: string | null; capid: string | null; full_name: string | null; duty_title: string }>();

  const seen = new Set<string>();
  const people: DepartmentMember[] = [];

  for (const row of rows.results) {
    const name = row.full_name?.trim();
    if (!name) continue;
    // Keyed by CAPID where there is one, because the same person can appear through a post held by their
    // account and another held only by their roster record.
    const key = row.capid ?? row.user_id ?? name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    people.push({ userId: row.user_id, capid: row.capid, fullName: name, dutyTitle: row.duty_title });
  }

  return people;
}

export interface TellResult {
  told: number;
  /** Reached only by email because they have no Hub account. Worth saying: they cannot reply in the Hub. */
  emailedOnly: number;
  names: string[];
}

/**
 * Tells a department something, by email and in the Hub.
 *
 * Members with an account get it both ways, and their own address choices apply - see lib/notify/addresses.ts,
 * where a member decides which of their addresses receive things. Members without an account get the email at
 * their CAP address, because that is the one CAP guarantees exists.
 */
export async function tellDepartment(input: {
  areaKey: string;
  areaName: string;
  title: string;
  body: string;
  url?: string | null;
  actorUserId?: string | null;
}): Promise<TellResult> {
  const people = await peopleInDepartment(input.areaKey);
  if (!people.length) return { told: 0, emailedOnly: 0, names: [] };

  const withAccounts = people.filter((person) => person.userId);
  const withoutAccounts = people.filter((person) => !person.userId && person.capid);

  if (withAccounts.length) {
    await notify(
      withAccounts.map((person) => ({
        userId: person.userId as string,
        kind: "ASSIGNED" as const,
        title: input.title,
        body: input.body,
        url: input.url ?? null,
        actorUserId: input.actorUserId ?? null,
        // One notice per person per thing, so re-running whatever caused this does not stack up duplicates.
        dedupeKey: "dept:" + input.areaKey + ":" + input.title
      }))
    );
  }

  // Sent one at a time rather than as one message with everybody in the To line, so no member learns the
  // others' personal addresses from a goal being set.
  if (mailConfigured()) {
    for (const person of withoutAccounts) {
      const to = await addressesForCapid(person.capid as string);
      if (!to.length) continue;
      await sendMail({
        to,
        subject: input.areaName + ": " + input.title,
        name: person.fullName,
        notices: [
          {
            title: input.title,
            body:
              input.body +
              "\n\nYou are receiving this because you hold the " + person.dutyTitle + " post. " +
              "You do not have a Hub account yet, so this came to your CAP address.",
            url: input.url ?? null
          }
        ]
      }).catch(() => undefined);
    }
  }

  return {
    told: people.length,
    emailedOnly: withoutAccounts.length,
    names: people.map((person) => person.fullName)
  };
}

/** A department's proper name, or null when the key is not one. */
export async function departmentName(areaKey: string): Promise<string | null> {
  const row = await getDatabase()
    .prepare("SELECT name FROM functional_areas WHERE key = ?")
    .bind(areaKey)
    .first<{ name: string }>();
  return row?.name ?? null;
}
