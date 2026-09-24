import { getDatabase } from "@/lib/cloudflare";
import { nowIso, WORKSPACE_ID } from "./structure";

// The duty catalog: what each role owes, how often, and the evidence for it.
// Occurrence dates are worked out from the rules, so the five year outlook is always current and nothing is stored twice.

export type Cadence = "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL" | "EVERY_N_YEARS" | "ONE_TIME";
export type Confidence = "UNVERIFIED" | "CONFIRMED" | "REJECTED";

export interface RoleDuty {
  id: string;
  role: string;
  title: string;
  detail: string | null;
  cadence: Cadence;
  intervalYears: number | null;
  dueMonth: number | null;
  dueDay: number | null;
  anchorDate: string | null;
  leadDays: number;
  sourceCitation: string | null;
  sourceUrl: string | null;
  sourceItemId: string | null;
  sourceDocumentId: string | null;
  sourceQuote: string | null;
  confidence: Confidence;
  active: boolean;
  updatedAt: string;
}

export interface DutyInput {
  role: string;
  title: string;
  detail?: string | null;
  cadence: Cadence;
  intervalYears?: number | null;
  dueMonth?: number | null;
  dueDay?: number | null;
  anchorDate?: string | null;
  leadDays?: number;
  sourceCitation?: string | null;
  sourceUrl?: string | null;
  sourceItemId?: string | null;
  sourceDocumentId?: string | null;
  sourceQuote?: string | null;
}

interface DutyRow {
  id: string;
  role: string;
  title: string;
  detail: string | null;
  cadence: Cadence;
  interval_years: number | null;
  due_month: number | null;
  due_day: number | null;
  anchor_date: string | null;
  lead_days: number;
  source_citation: string | null;
  source_url: string | null;
  source_item_id: string | null;
  source_document_id: string | null;
  source_quote: string | null;
  confidence: Confidence;
  active: number;
  updated_at: string;
}

const COLUMNS = "id, role, title, detail, cadence, interval_years, due_month, due_day, anchor_date, lead_days, source_citation, source_url, source_item_id, source_document_id, source_quote, confidence, active, updated_at";

function toDuty(row: DutyRow): RoleDuty {
  return {
    id: row.id,
    role: row.role,
    title: row.title,
    detail: row.detail,
    cadence: row.cadence,
    intervalYears: row.interval_years,
    dueMonth: row.due_month,
    dueDay: row.due_day,
    anchorDate: row.anchor_date,
    leadDays: row.lead_days,
    sourceCitation: row.source_citation,
    sourceUrl: row.source_url,
    sourceItemId: row.source_item_id,
    sourceDocumentId: row.source_document_id,
    sourceQuote: row.source_quote,
    confidence: row.confidence,
    active: Boolean(row.active),
    updatedAt: row.updated_at
  };
}

function missingTable(error: unknown): boolean {
  return error instanceof Error && /no such table/i.test(error.message);
}

export async function listDuties(options: { includeRejected?: boolean } = {}): Promise<RoleDuty[]> {
  try {
    const result = await getDatabase()
      .prepare(
        "SELECT " + COLUMNS + " FROM role_duties WHERE workspace_id = ?" +
        (options.includeRejected ? "" : " AND confidence != 'REJECTED'") +
        " ORDER BY role COLLATE NOCASE, title COLLATE NOCASE"
      )
      .bind(WORKSPACE_ID)
      .all<DutyRow>();
    return result.results.map(toDuty);
  } catch (error) {
    if (missingTable(error)) return [];
    throw error;
  }
}

/**
 * Adds a duty.
 *
 * `confidence` is the difference between a duty a person entered and one a machine proposed. A proposal
 * read out of a regulation starts UNVERIFIED and does nothing until somebody confirms it, because the
 * reader can misread. A duty typed in by a member is already confirmed: the typing was the confirming,
 * and asking them to agree with themselves a second time left the catalogue at zero confirmed duties -
 * so nothing was ever routed, however much had been entered.
 */
export async function createDuty(input: DutyInput, userId: string, confidence: Confidence = "UNVERIFIED"): Promise<string> {
  const id = crypto.randomUUID();
  const now = nowIso();
  await getDatabase()
    .prepare(
      "INSERT INTO role_duties (id, workspace_id, role, title, detail, cadence, interval_years, due_month, due_day, anchor_date, lead_days, " +
      "source_citation, source_url, source_item_id, source_document_id, source_quote, confidence, confirmed_by, confirmed_at, created_by, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      id, WORKSPACE_ID, input.role.trim(), input.title.trim(), input.detail?.trim() || null, input.cadence,
      input.intervalYears ?? null, input.dueMonth ?? null, input.dueDay ?? null, input.anchorDate ?? null, input.leadDays ?? 30,
      input.sourceCitation?.trim() || null, input.sourceUrl?.trim() || null, input.sourceItemId ?? null,
      input.sourceDocumentId ?? null, input.sourceQuote?.trim()?.slice(0, 600) || null,
      confidence, confidence === "CONFIRMED" ? userId : null, confidence === "CONFIRMED" ? now : null,
      userId, now, now
    )
    .run();
  return id;
}

export async function setDutyConfidence(dutyId: string, confidence: Confidence, userId: string): Promise<void> {
  const now = nowIso();
  await getDatabase()
    .prepare("UPDATE role_duties SET confidence = ?, confirmed_by = ?, confirmed_at = ?, updated_at = ? WHERE id = ?")
    .bind(confidence, userId, now, now, dutyId)
    .run();
}

export async function updateDuty(dutyId: string, input: Partial<DutyInput>): Promise<void> {
  const db = getDatabase();
  const current = await db.prepare("SELECT " + COLUMNS + " FROM role_duties WHERE id = ?").bind(dutyId).first<DutyRow>();
  if (!current) throw new Error("That duty no longer exists.");
  const merged = { ...toDuty(current), ...input };
  await db
    .prepare(
      "UPDATE role_duties SET role = ?, title = ?, detail = ?, cadence = ?, interval_years = ?, due_month = ?, due_day = ?, anchor_date = ?, " +
      "lead_days = ?, source_citation = ?, source_url = ?, updated_at = ? WHERE id = ?"
    )
    .bind(
      merged.role, merged.title, merged.detail ?? null, merged.cadence, merged.intervalYears ?? null, merged.dueMonth ?? null,
      merged.dueDay ?? null, merged.anchorDate ?? null, merged.leadDays ?? 30, merged.sourceCitation ?? null, merged.sourceUrl ?? null,
      nowIso(), dutyId
    )
    .run();
}

export async function deleteDuty(dutyId: string): Promise<void> {
  await getDatabase().prepare("DELETE FROM role_duties WHERE id = ?").bind(dutyId).run();
}

export interface DutyOccurrence {
  dutyId: string;
  role: string;
  title: string;
  dueOn: string;
  confidence: Confidence;
  sourceCitation: string | null;
}

function dayString(year: number, month: number, day: number): string {
  const safeDay = Math.min(day, new Date(Date.UTC(year, month, 0)).getUTCDate());
  return year + "-" + String(month).padStart(2, "0") + "-" + String(safeDay).padStart(2, "0");
}

// Works out every date a duty falls due between two dates. Five years ahead is the normal window.
export function occurrencesFor(duty: RoleDuty, from: string, to: string): string[] {
  const dates: string[] = [];
  const startYear = Number(from.slice(0, 4));
  const endYear = Number(to.slice(0, 4));
  const day = duty.dueDay ?? 1;

  if (duty.cadence === "ONE_TIME") {
    if (duty.anchorDate && duty.anchorDate >= from && duty.anchorDate <= to) dates.push(duty.anchorDate);
    return dates;
  }

  if (duty.cadence === "EVERY_N_YEARS") {
    const interval = Math.max(1, duty.intervalYears ?? 1);
    const anchor = duty.anchorDate ?? dayString(startYear, duty.dueMonth ?? 1, day);
    let year = Number(anchor.slice(0, 4));
    const month = duty.dueMonth ?? Number(anchor.slice(5, 7));
    while (year <= endYear) {
      const candidate = dayString(year, month, day);
      if (candidate >= from && candidate <= to) dates.push(candidate);
      year += interval;
    }
    return dates;
  }

  const months = duty.cadence === "MONTHLY" ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    : duty.cadence === "QUARTERLY" ? [1, 4, 7, 10]
    : duty.cadence === "SEMIANNUAL" ? [duty.dueMonth ?? 1, ((duty.dueMonth ?? 1) + 5) % 12 + 1]
    : [duty.dueMonth ?? 1];

  for (let year = startYear; year <= endYear; year += 1) {
    months.forEach((month) => {
      const candidate = dayString(year, month, day);
      if (candidate >= from && candidate <= to) dates.push(candidate);
    });
  }
  return dates.sort();
}

export async function outlook(years = 5): Promise<DutyOccurrence[]> {
  const duties = (await listDuties()).filter((duty) => duty.active);
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + years * 365.25 * 86400000).toISOString().slice(0, 10);
  const occurrences: DutyOccurrence[] = [];
  duties.forEach((duty) => {
    occurrencesFor(duty, from, to).forEach((dueOn) => {
      occurrences.push({ dutyId: duty.id, role: duty.role, title: duty.title, dueOn, confidence: duty.confidence, sourceCitation: duty.sourceCitation });
    });
  });
  return occurrences.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}
