import { getDatabase } from "@/lib/cloudflare";

export type ComplianceStatus = "ACTIVE" | "PAUSED" | "RETIRED";
export type RecurrenceRule = "FREQ=DAILY" | "FREQ=WEEKLY" | "FREQ=MONTHLY" | "FREQ=QUARTERLY" | "FREQ=ANNUALLY";

export interface ComplianceRequirementRecord {
  id: string;
  name: string;
  description: string | null;
  governingSource: string | null;
  functionalAreaKey: string;
  functionalAreaName: string;
  responsibleUserId: string | null;
  responsibleName: string | null;
  recurrenceRule: string | null;
  nextDueOn: string | null;
  requiredEvidence: string[];
  status: ComplianceStatus;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

interface ComplianceRow {
  id: string;
  name: string;
  description: string | null;
  governing_source: string | null;
  functional_area_key: string;
  functional_area_name: string;
  responsible_user_id: string | null;
  responsible_name: string | null;
  recurrence_rule: string | null;
  next_due_on: string | null;
  required_evidence_json: string | null;
  status: ComplianceStatus;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

const requirementSelect = `
  SELECT
    compliance_requirements.id,
    compliance_requirements.name,
    compliance_requirements.description,
    compliance_requirements.governing_source,
    compliance_requirements.functional_area_key,
    functional_areas.name AS functional_area_name,
    compliance_requirements.responsible_user_id,
    responsible.full_name AS responsible_name,
    compliance_requirements.recurrence_rule,
    compliance_requirements.next_due_on,
    compliance_requirements.required_evidence_json,
    compliance_requirements.status,
    compliance_requirements.created_by,
    creator.full_name AS created_by_name,
    compliance_requirements.created_at,
    compliance_requirements.updated_at
  FROM compliance_requirements
  JOIN functional_areas ON functional_areas.key = compliance_requirements.functional_area_key
  LEFT JOIN users responsible ON responsible.id = compliance_requirements.responsible_user_id
  JOIN users creator ON creator.id = compliance_requirements.created_by
`;

export async function listComplianceRequirements(): Promise<ComplianceRequirementRecord[]> {
  const result = await getDatabase()
    .prepare(
      `${requirementSelect}
       ORDER BY
         CASE compliance_requirements.status WHEN 'ACTIVE' THEN 0 WHEN 'PAUSED' THEN 1 ELSE 2 END,
         CASE WHEN compliance_requirements.next_due_on IS NULL THEN 1 ELSE 0 END,
         compliance_requirements.next_due_on ASC,
         compliance_requirements.name COLLATE NOCASE ASC`
    )
    .all<ComplianceRow>();
  return result.results.map(mapRequirement);
}

export async function findComplianceRequirementById(id: string): Promise<ComplianceRequirementRecord | null> {
  const row = await getDatabase()
    .prepare(`${requirementSelect} WHERE compliance_requirements.id = ? LIMIT 1`)
    .bind(id)
    .first<ComplianceRow>();
  return row ? mapRequirement(row) : null;
}

export async function createComplianceRequirement(input: {
  name: string;
  description?: string | null;
  governingSource?: string | null;
  functionalAreaKey: string;
  responsibleUserId?: string | null;
  recurrenceRule?: RecurrenceRule | null;
  nextDueOn?: string | null;
  requiredEvidence?: string[];
  createdBy: string;
}): Promise<ComplianceRequirementRecord> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await getDatabase()
    .prepare(
      `INSERT INTO compliance_requirements (
        id, name, description, governing_source, functional_area_key,
        responsible_user_id, recurrence_rule, next_due_on, required_evidence_json,
        status, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`
    )
    .bind(
      id,
      input.name.trim(),
      input.description?.trim() || null,
      input.governingSource?.trim() || null,
      input.functionalAreaKey,
      input.responsibleUserId || null,
      input.recurrenceRule || null,
      normalizeDate(input.nextDueOn),
      input.requiredEvidence?.length ? JSON.stringify(input.requiredEvidence.map((item) => item.trim()).filter(Boolean)) : null,
      input.createdBy,
      now,
      now
    )
    .run();

  const requirement = await findComplianceRequirementById(id);
  if (!requirement) throw new Error("The requirement was created but could not be loaded.");
  return requirement;
}

export async function setComplianceStatus(id: string, status: ComplianceStatus): Promise<ComplianceRequirementRecord> {
  await getDatabase()
    .prepare("UPDATE compliance_requirements SET status = ?, updated_at = ? WHERE id = ?")
    .bind(status, new Date().toISOString(), id)
    .run();
  const requirement = await findComplianceRequirementById(id);
  if (!requirement) throw new Error("Requirement not found.");
  return requirement;
}

export async function deleteComplianceRequirement(id: string): Promise<void> {
  await getDatabase().prepare("DELETE FROM compliance_requirements WHERE id = ?").bind(id).run();
}

function normalizeDate(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error("Date must use YYYY-MM-DD format.");
  return normalized;
}

function mapRequirement(row: ComplianceRow): ComplianceRequirementRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    governingSource: row.governing_source,
    functionalAreaKey: row.functional_area_key,
    functionalAreaName: row.functional_area_name,
    responsibleUserId: row.responsible_user_id,
    responsibleName: row.responsible_name,
    recurrenceRule: row.recurrence_rule,
    nextDueOn: row.next_due_on,
    requiredEvidence: parseEvidence(row.required_evidence_json),
    status: row.status,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseEvidence(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
