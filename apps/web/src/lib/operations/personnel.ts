import { getDatabase } from "@/lib/cloudflare";

export interface PersonnelMemberRecord {
  id: string;
  userId: string | null;
  rank: string;
  fullName: string;
  status: "ACTIVE" | "LEAVE" | "INACTIVE";
  statusNote: string | null;
  sourceDate: string;
}

export interface PersonnelPositionRecord {
  id: string;
  title: string;
  functionalAreaKey: string;
  functionalAreaName: string;
  incumbentId: string | null;
  incumbentName: string | null;
  incumbentRank: string | null;
  incumbentStatus: PersonnelMemberRecord["status"] | null;
  reportsToPositionId: string | null;
  reportsToTitle: string | null;
  assignmentStatus: "FILLED" | "ACTING" | "VACANT";
  notes: string | null;
  sourceDate: string;
  displayOrder: number;
}

export interface PersonnelCommitteeRecord {
  id: string;
  name: string;
  sourceDate: string;
  members: Array<{
    personnelMemberId: string;
    rank: string;
    fullName: string;
    role: "CHAIR" | "MEMBER";
  }>;
}

interface MemberRow {
  id: string;
  user_id: string | null;
  rank: string;
  full_name: string;
  status: PersonnelMemberRecord["status"];
  status_note: string | null;
  source_date: string;
}

interface PositionRow {
  id: string;
  title: string;
  functional_area_key: string;
  functional_area_name: string;
  incumbent_id: string | null;
  incumbent_name: string | null;
  incumbent_rank: string | null;
  incumbent_status: PersonnelMemberRecord["status"] | null;
  reports_to_position_id: string | null;
  reports_to_title: string | null;
  assignment_status: PersonnelPositionRecord["assignmentStatus"];
  notes: string | null;
  source_date: string;
  display_order: number;
}

interface CommitteeRow {
  committee_id: string;
  committee_name: string;
  source_date: string;
  personnel_member_id: string;
  rank: string;
  full_name: string;
  committee_role: "CHAIR" | "MEMBER";
}

export async function listPersonnelMembers(): Promise<PersonnelMemberRecord[]> {
  const result = await getDatabase()
    .prepare("SELECT id, user_id, rank, full_name, status, status_note, source_date FROM personnel_members ORDER BY full_name COLLATE NOCASE")
    .all<MemberRow>();
  return result.results.map((row) => ({
    id: row.id,
    userId: row.user_id,
    rank: row.rank,
    fullName: row.full_name,
    status: row.status,
    statusNote: row.status_note,
    sourceDate: row.source_date
  }));
}

export async function listPersonnelPositions(): Promise<PersonnelPositionRecord[]> {
  const result = await getDatabase()
    .prepare(
      `SELECT
        position.id, position.title, position.functional_area_key,
        area.name AS functional_area_name,
        position.incumbent_id, incumbent.full_name AS incumbent_name,
        incumbent.rank AS incumbent_rank, incumbent.status AS incumbent_status,
        position.reports_to_position_id, supervisor.title AS reports_to_title,
        position.assignment_status, position.notes, position.source_date, position.display_order
      FROM personnel_positions position
      JOIN functional_areas area ON area.key = position.functional_area_key
      LEFT JOIN personnel_members incumbent ON incumbent.id = position.incumbent_id
      LEFT JOIN personnel_positions supervisor ON supervisor.id = position.reports_to_position_id
      ORDER BY position.display_order, position.title COLLATE NOCASE`
    )
    .all<PositionRow>();
  return result.results.map((row) => ({
    id: row.id,
    title: row.title,
    functionalAreaKey: row.functional_area_key,
    functionalAreaName: row.functional_area_name,
    incumbentId: row.incumbent_id,
    incumbentName: row.incumbent_name,
    incumbentRank: row.incumbent_rank,
    incumbentStatus: row.incumbent_status,
    reportsToPositionId: row.reports_to_position_id,
    reportsToTitle: row.reports_to_title,
    assignmentStatus: row.assignment_status,
    notes: row.notes,
    sourceDate: row.source_date,
    displayOrder: row.display_order
  }));
}

export async function listPersonnelCommittees(): Promise<PersonnelCommitteeRecord[]> {
  const result = await getDatabase()
    .prepare(
      `SELECT committee.id AS committee_id, committee.name AS committee_name, committee.source_date,
        member.personnel_member_id, person.rank, person.full_name, member.committee_role
      FROM personnel_committees committee
      JOIN personnel_committee_members member ON member.committee_id = committee.id
      JOIN personnel_members person ON person.id = member.personnel_member_id
      ORDER BY committee.display_order, member.display_order`
    )
    .all<CommitteeRow>();

  const committees = new Map<string, PersonnelCommitteeRecord>();
  for (const row of result.results) {
    const committee = committees.get(row.committee_id) ?? {
      id: row.committee_id,
      name: row.committee_name,
      sourceDate: row.source_date,
      members: []
    };
    committee.members.push({
      personnelMemberId: row.personnel_member_id,
      rank: row.rank,
      fullName: row.full_name,
      role: row.committee_role
    });
    committees.set(row.committee_id, committee);
  }
  return [...committees.values()];
}

export async function linkPersonnelMemberToUser(userId: string, fullName: string): Promise<void> {
  await getDatabase()
    .prepare(
      `UPDATE personnel_members
       SET user_id = ?, updated_at = ?
       WHERE user_id IS NULL AND lower(trim(full_name)) = lower(trim(?))`
    )
    .bind(userId, new Date().toISOString(), fullName)
    .run();
}

/**
 * Changes who holds a position, or empties it.
 *
 * The organisation chart arrived as seeded records dated April 2026 and there was no way to change it in
 * the app at all - which is untenable for the one thing that goes out of date every time somebody swaps
 * jobs. A position also decides who the Hub chases about that job's recurring work, so a stale chart is
 * not a cosmetic problem.
 */
export async function setPositionHolder(input: {
  positionId: string;
  incumbentId: string | null;
  assignmentStatus: "FILLED" | "ACTING" | "VACANT";
  notes?: string | null;
}): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  // Emptying a position means it is vacant, whatever was asked for.
  const status = input.incumbentId ? input.assignmentStatus : "VACANT";

  await db
    .prepare(
      "UPDATE personnel_positions SET incumbent_id = ?, assignment_status = ?, notes = ?, source_date = ?, updated_at = ? WHERE id = ?"
    )
    .bind(input.incumbentId, status, input.notes?.trim() || null, now.slice(0, 10), now, input.positionId)
    .run();

  // The member's Hub account carries the duty title, because that is what tells the duty generator whose
  // recurring work this is. Cleared from whoever held it, set on whoever holds it now.
  const position = await db.prepare("SELECT title FROM personnel_positions WHERE id = ?").bind(input.positionId).first<{ title: string }>();
  if (!position) return;

  await db
    .prepare("UPDATE users SET duty_title = NULL, updated_at = ? WHERE duty_title = ?")
    .bind(now, position.title)
    .run();

  if (input.incumbentId) {
    const member = await db.prepare("SELECT user_id FROM personnel_members WHERE id = ?").bind(input.incumbentId).first<{ user_id: string | null }>();
    if (member?.user_id) {
      await db.prepare("UPDATE users SET duty_title = ?, updated_at = ? WHERE id = ?").bind(position.title, now, member.user_id).run();
    }
  }
}

export async function createPosition(input: {
  title: string;
  functionalAreaKey: string;
  reportsToPositionId?: string | null;
}): Promise<string> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const order = await db.prepare("SELECT COALESCE(MAX(display_order), 0) + 1 AS next FROM personnel_positions").first<{ next: number }>();
  await db
    .prepare(
      "INSERT INTO personnel_positions (id, title, functional_area_key, incumbent_id, reports_to_position_id, assignment_status, notes, source_date, display_order, created_at, updated_at) " +
      "VALUES (?, ?, ?, NULL, ?, 'VACANT', NULL, ?, ?, ?, ?)"
    )
    .bind(id, input.title.trim(), input.functionalAreaKey, input.reportsToPositionId ?? null, now.slice(0, 10), order?.next ?? 100, now, now)
    .run();
  return id;
}

export async function removePosition(positionId: string): Promise<void> {
  await getDatabase().prepare("DELETE FROM personnel_positions WHERE id = ?").bind(positionId).run();
}

/**
 * Sets whether a member is active, on leave, or inactive, and the note that goes with it.
 *
 * The note is free text and clearing it must actually clear it: "on leave, covered by Johnson" stops being
 * true the day the cover ends, and a note nobody can delete is worse than no note.
 */
export async function setMemberStatus(input: {
  memberId: string;
  status: "ACTIVE" | "LEAVE" | "INACTIVE";
  statusNote?: string | null;
}): Promise<void> {
  await getDatabase()
    .prepare("UPDATE personnel_members SET status = ?, status_note = ?, updated_at = ? WHERE id = ?")
    .bind(input.status, input.statusNote?.trim() || null, new Date().toISOString(), input.memberId)
    .run();
}
