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
