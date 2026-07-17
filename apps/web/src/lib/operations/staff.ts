import { getDatabase } from "@/lib/cloudflare";

export interface DutyAssignmentRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  functionalAreaKey: string;
  functionalAreaName: string;
  dutyTitle: string;
  isPrimary: boolean;
  startsOn: string;
  endsOn: string | null;
  assignedBy: string;
  assignedByName: string;
  createdAt: string;
  updatedAt: string;
}

interface DutyAssignmentRow {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  functional_area_key: string;
  functional_area_name: string;
  duty_title: string;
  is_primary: number;
  starts_on: string;
  ends_on: string | null;
  assigned_by: string;
  assigned_by_name: string;
  created_at: string;
  updated_at: string;
}

const assignmentSelect = `
  SELECT
    duty_assignments.id,
    duty_assignments.user_id,
    assignee.full_name AS user_name,
    assignee.email AS user_email,
    duty_assignments.functional_area_key,
    functional_areas.name AS functional_area_name,
    duty_assignments.duty_title,
    duty_assignments.is_primary,
    duty_assignments.starts_on,
    duty_assignments.ends_on,
    duty_assignments.assigned_by,
    assigner.full_name AS assigned_by_name,
    duty_assignments.created_at,
    duty_assignments.updated_at
  FROM duty_assignments
  JOIN users assignee ON assignee.id = duty_assignments.user_id
  JOIN users assigner ON assigner.id = duty_assignments.assigned_by
  JOIN functional_areas ON functional_areas.key = duty_assignments.functional_area_key
`;

export async function listDutyAssignments(options?: { includeEnded?: boolean }): Promise<DutyAssignmentRecord[]> {
  const where = options?.includeEnded ? "" : "WHERE duty_assignments.ends_on IS NULL OR duty_assignments.ends_on >= date('now')";
  const result = await getDatabase()
    .prepare(
      `${assignmentSelect}
       ${where}
       ORDER BY functional_areas.display_order ASC, duty_assignments.is_primary DESC, assignee.full_name COLLATE NOCASE ASC`
    )
    .all<DutyAssignmentRow>();
  return result.results.map(mapAssignment);
}

export async function findDutyAssignmentById(id: string): Promise<DutyAssignmentRecord | null> {
  const row = await getDatabase()
    .prepare(`${assignmentSelect} WHERE duty_assignments.id = ? LIMIT 1`)
    .bind(id)
    .first<DutyAssignmentRow>();
  return row ? mapAssignment(row) : null;
}

export async function createDutyAssignment(input: {
  userId: string;
  functionalAreaKey: string;
  dutyTitle: string;
  isPrimary?: boolean;
  startsOn: string;
  assignedBy: string;
}): Promise<DutyAssignmentRecord> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  if (input.isPrimary) {
    await getDatabase()
      .prepare(
        `UPDATE duty_assignments SET is_primary = 0, updated_at = ?
         WHERE functional_area_key = ? AND (ends_on IS NULL OR ends_on >= date('now'))`
      )
      .bind(now, input.functionalAreaKey)
      .run();
  }

  await getDatabase()
    .prepare(
      `INSERT INTO duty_assignments (
        id, user_id, functional_area_key, duty_title, is_primary,
        starts_on, assigned_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      input.userId,
      input.functionalAreaKey,
      input.dutyTitle.trim(),
      input.isPrimary ? 1 : 0,
      normalizeDate(input.startsOn),
      input.assignedBy,
      now,
      now
    )
    .run();

  const assignment = await findDutyAssignmentById(id);
  if (!assignment) throw new Error("The duty assignment was created but could not be loaded.");
  return assignment;
}

export async function endDutyAssignment(id: string, endsOn: string): Promise<DutyAssignmentRecord> {
  await getDatabase()
    .prepare("UPDATE duty_assignments SET ends_on = ?, is_primary = 0, updated_at = ? WHERE id = ?")
    .bind(normalizeDate(endsOn), new Date().toISOString(), id)
    .run();
  const assignment = await findDutyAssignmentById(id);
  if (!assignment) throw new Error("Duty assignment not found.");
  return assignment;
}

export async function deleteDutyAssignment(id: string): Promise<void> {
  await getDatabase().prepare("DELETE FROM duty_assignments WHERE id = ?").bind(id).run();
}

function normalizeDate(value: string): string {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error("Date must use YYYY-MM-DD format.");
  return normalized;
}

function mapAssignment(row: DutyAssignmentRow): DutyAssignmentRecord {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    functionalAreaKey: row.functional_area_key,
    functionalAreaName: row.functional_area_name,
    dutyTitle: row.duty_title,
    isPrimary: Boolean(row.is_primary),
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    assignedBy: row.assigned_by,
    assignedByName: row.assigned_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
