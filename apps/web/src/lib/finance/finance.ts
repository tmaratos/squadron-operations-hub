import { getDatabase } from "@/lib/cloudflare";
import { WORKSPACE_ID } from "@/lib/work/structure";

// The squadron's money.
//
// Everything here is arithmetic. The tracker never offers an opinion about whether a purchase was wise; it
// reports what was recorded, what the unit budgeted, and which entries are in a state they should not still
// be in. That distinction is deliberate - a finance page that editorialises gets ignored, and one that
// quietly guesses at a number is worse than a notebook.

export type Direction = "INCOME" | "EXPENSE";
export type TxStatus = "RECORDED" | "SUBMITTED" | "CLEARED" | "VOID";

/**
 * CAP's fiscal year, which is not the calendar year.
 *
 * 1 October to 30 September, named for the year it ends in. Getting this wrong makes every budget comparison
 * quietly meaningless, which is the kind of wrong nobody notices until the year is over.
 */
export function fiscalYearOf(date: Date | string): number {
  const value = typeof date === "string" ? new Date(date.length === 10 ? date + "T12:00:00Z" : date) : date;
  const month = value.getUTCMonth(); // 0 = January, 9 = October
  return month >= 9 ? value.getUTCFullYear() + 1 : value.getUTCFullYear();
}

export function fiscalQuarterOf(date: Date | string): number {
  const value = typeof date === "string" ? new Date(date.length === 10 ? date + "T12:00:00Z" : date) : date;
  // October starts Q1, so shift by three months and divide.
  return Math.floor(((value.getUTCMonth() + 3) % 12) / 3) + 1;
}

/** The first and last day of a fiscal year, as plain dates. */
export function fiscalYearRange(year: number): { start: string; end: string } {
  return { start: year - 1 + "-10-01", end: year + "-09-30" };
}

export function currentFiscalYear(): number {
  return fiscalYearOf(new Date());
}

/**
 * The categories a squadron's money actually moves through.
 *
 * Deliberately CAP's vocabulary and not a generic chart of accounts: a unit does not spend on "operations",
 * it spends on cadet activities, aerospace education materials, encampment fees and vehicle fuel, and it
 * takes money in as dues, fundraising, donations and wing reimbursements. Somebody filing a receipt should
 * recognise the list without being taught it.
 */
export interface CategoryDefinition {
  code: string;
  label: string;
  direction: Direction;
  /** Why an entry would land here, said in the form so nobody has to guess between two near neighbours. */
  hint: string;
}

export const CATEGORIES: CategoryDefinition[] = [
  { code: "DUES", label: "Dues and unit fees", direction: "INCOME", hint: "Squadron activity fees and member contributions collected locally." },
  { code: "FUNDRAISING", label: "Fundraising", direction: "INCOME", hint: "Approved fundraising takings. Approval comes before the event, not after." },
  { code: "DONATION", label: "Donations and grants", direction: "INCOME", hint: "Gifts to the unit, including in-kind valued at cost." },
  { code: "WING_REIMBURSEMENT", label: "Wing reimbursement", direction: "INCOME", hint: "Money coming back from wing for something the unit paid for." },
  { code: "ACTIVITY_INCOME", label: "Activity receipts", direction: "INCOME", hint: "Fees collected for a specific event, encampment or trip." },
  { code: "OTHER_INCOME", label: "Other income", direction: "INCOME", hint: "Anything that does not fit, described in the purpose." },

  { code: "CADET_PROGRAMS", label: "Cadet programs", direction: "EXPENSE", hint: "Cadet activities, promotions, awards, testing materials." },
  { code: "AEROSPACE", label: "Aerospace education", direction: "EXPENSE", hint: "AEX materials, models, rocketry, AE textbooks." },
  { code: "EMERGENCY_SERVICES", label: "Emergency services", direction: "EXPENSE", hint: "ES training, exercise costs, ground team equipment." },
  { code: "SAFETY", label: "Safety", direction: "EXPENSE", hint: "Safety programme materials and equipment." },
  { code: "TRAINING", label: "Training and professional development", direction: "EXPENSE", hint: "Courses, conferences, SLS and CLC costs." },
  { code: "ENCAMPMENT", label: "Encampment and activities", direction: "EXPENSE", hint: "Fees paid onward for encampment, NCSA and wing activities." },
  { code: "VEHICLE", label: "Vehicle and fuel", direction: "EXPENSE", hint: "Corporate vehicle fuel, cleaning and consumables." },
  { code: "AIRCRAFT", label: "Aircraft and flying", direction: "EXPENSE", hint: "Flight costs the unit carries rather than wing." },
  { code: "SUPPLIES", label: "Supplies and equipment", direction: "EXPENSE", hint: "Office supplies, printing, tools, small equipment." },
  { code: "UNIFORMS", label: "Uniforms and insignia", direction: "EXPENSE", hint: "Unit-funded uniform items and insignia." },
  { code: "FACILITY", label: "Meeting facility", direction: "EXPENSE", hint: "Anything paid towards the place the squadron meets." },
  { code: "RECOGNITION", label: "Awards and recognition", direction: "EXPENSE", hint: "Banquet, plaques, certificates, challenge coins." },
  { code: "ASSESSMENT", label: "Wing and region assessments", direction: "EXPENSE", hint: "Amounts owed upward that the unit has to pay." },
  { code: "OTHER_EXPENSE", label: "Other expense", direction: "EXPENSE", hint: "Anything that does not fit, described in the purpose." }
];

export function categoryLabel(code: string): string {
  return CATEGORIES.find((entry) => entry.code === code)?.label ?? code;
}

export function categoryDirection(code: string): Direction {
  return CATEGORIES.find((entry) => entry.code === code)?.direction ?? "EXPENSE";
}

export interface Transaction {
  id: string;
  direction: Direction;
  amountCents: number;
  occurredOn: string;
  category: string;
  categoryLabel: string;
  purpose: string;
  counterparty: string | null;
  status: TxStatus;
  submittedOn: string | null;
  clearedOn: string | null;
  wingReference: string | null;
  receiptFileId: string | null;
  receiptName: string | null;
  approvedBy: string | null;
  approverName: string | null;
  approvedOn: string | null;
  itemId: string | null;
  itemTitle: string | null;
  notes: string | null;
  /** A gift of goods or services rather than money. Never counted in any cash figure. */
  inKind: boolean;
  /** What was actually given. */
  itemDetail: string | null;
  /** How the worth was arrived at, because a value nobody can justify is not a value. */
  valueBasis: string | null;
  fiscalYear: number;
  fiscalQuarter: number;
}

interface TxRow {
  id: string;
  direction: Direction;
  amount_cents: number;
  occurred_on: string;
  category: string;
  purpose: string;
  counterparty: string | null;
  status: TxStatus;
  submitted_on: string | null;
  cleared_on: string | null;
  wing_reference: string | null;
  receipt_file_id: string | null;
  receipt_name: string | null;
  approved_by: string | null;
  approver_name: string | null;
  approved_on: string | null;
  item_id: string | null;
  item_title: string | null;
  notes: string | null;
  in_kind: number | null;
  item_detail: string | null;
  value_basis: string | null;
}

function mapTx(row: TxRow): Transaction {
  return {
    id: row.id,
    direction: row.direction,
    amountCents: row.amount_cents,
    occurredOn: row.occurred_on,
    category: row.category,
    categoryLabel: categoryLabel(row.category),
    purpose: row.purpose,
    counterparty: row.counterparty,
    status: row.status,
    submittedOn: row.submitted_on,
    clearedOn: row.cleared_on,
    wingReference: row.wing_reference,
    receiptFileId: row.receipt_file_id,
    receiptName: row.receipt_name,
    approvedBy: row.approved_by,
    approverName: row.approver_name,
    approvedOn: row.approved_on,
    itemId: row.item_id,
    itemTitle: row.item_title,
    notes: row.notes,
    inKind: Boolean(row.in_kind),
    itemDetail: row.item_detail,
    valueBasis: row.value_basis,
    fiscalYear: fiscalYearOf(row.occurred_on),
    fiscalQuarter: fiscalQuarterOf(row.occurred_on)
  };
}

export async function listTransactions(fiscalYear: number): Promise<Transaction[]> {
  const { start, end } = fiscalYearRange(fiscalYear);
  try {
    const rows = await getDatabase()
      .prepare(
        "SELECT t.*, u.full_name AS approver_name, i.title AS item_title " +
        "FROM finance_transactions t " +
        "LEFT JOIN users u ON u.id = t.approved_by " +
        "LEFT JOIN items i ON i.id = t.item_id " +
        "WHERE t.workspace_id = ? AND t.occurred_on >= ? AND t.occurred_on <= ? " +
        "ORDER BY t.occurred_on DESC, t.created_at DESC"
      )
      .bind(WORKSPACE_ID, start, end)
      .all<TxRow>();
    return rows.results.map(mapTx);
  } catch {
    // The table arrives with a migration; an unmigrated database shows an empty ledger rather than an error.
    return [];
  }
}

/** Which fiscal years have anything in them, so the year picker offers real years and not a guess. */
export async function fiscalYearsWithActivity(): Promise<number[]> {
  const years = new Set<number>([currentFiscalYear()]);
  try {
    const rows = await getDatabase()
      .prepare("SELECT DISTINCT occurred_on FROM finance_transactions WHERE workspace_id = ?")
      .bind(WORKSPACE_ID)
      .all<{ occurred_on: string }>();
    rows.results.forEach((row) => years.add(fiscalYearOf(row.occurred_on)));
  } catch { /* not migrated yet */ }
  return [...years].sort((left, right) => right - left);
}

export async function recordTransaction(input: {
  direction: Direction;
  amountCents: number;
  occurredOn: string;
  category: string;
  purpose: string;
  counterparty?: string | null;
  notes?: string | null;
  itemId?: string | null;
  inKind?: boolean;
  itemDetail?: string | null;
  valueBasis?: string | null;
  userId: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await getDatabase()
    .prepare(
      "INSERT INTO finance_transactions (id, workspace_id, direction, amount_cents, occurred_on, category, purpose, counterparty, notes, item_id, in_kind, item_detail, value_basis, created_by, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      id, WORKSPACE_ID, input.direction, Math.round(input.amountCents), input.occurredOn, input.category,
      input.purpose.trim(), input.counterparty?.trim() || null, input.notes?.trim() || null,
      input.itemId ?? null, input.inKind ? 1 : 0, input.itemDetail?.trim() || null,
      input.valueBasis?.trim() || null, input.userId, now, now
    )
    .run();
  return id;
}

/** Field by field, so a correction is a correction and not a delete and re-enter. */
export async function updateTransaction(id: string, patch: {
  amountCents?: number;
  occurredOn?: string;
  category?: string;
  purpose?: string;
  counterparty?: string | null;
  status?: TxStatus;
  wingReference?: string | null;
  notes?: string | null;
  approvedBy?: string | null;
  itemDetail?: string | null;
  valueBasis?: string | null;
  receipt?: { fileId: string; name: string } | null;
}): Promise<void> {
  const now = new Date().toISOString();
  const sets: string[] = ["updated_at = ?"];
  const values: Array<string | number | null> = [now];
  const put = (column: string, value: string | number | null) => { sets.push(column + " = ?"); values.push(value); };

  if (patch.amountCents !== undefined) put("amount_cents", Math.round(patch.amountCents));
  if (patch.occurredOn !== undefined) put("occurred_on", patch.occurredOn);
  if (patch.category !== undefined) put("category", patch.category);
  if (patch.purpose !== undefined) put("purpose", patch.purpose.trim());
  if (patch.counterparty !== undefined) put("counterparty", patch.counterparty?.trim() || null);
  if (patch.wingReference !== undefined) put("wing_reference", patch.wingReference?.trim() || null);
  if (patch.notes !== undefined) put("notes", patch.notes?.trim() || null);
  if (patch.itemDetail !== undefined) put("item_detail", patch.itemDetail?.trim() || null);
  if (patch.valueBasis !== undefined) put("value_basis", patch.valueBasis?.trim() || null);
  if (patch.approvedBy !== undefined) {
    put("approved_by", patch.approvedBy || null);
    put("approved_on", patch.approvedBy ? now.slice(0, 10) : null);
  }
  if (patch.receipt !== undefined) {
    put("receipt_file_id", patch.receipt?.fileId ?? null);
    put("receipt_name", patch.receipt?.name ?? null);
  }
  if (patch.status !== undefined) {
    put("status", patch.status);
    // The date that goes with a state is set by moving into it, because a status somebody has to remember to
    // date separately is a status that is always wrong by a week.
    if (patch.status === "SUBMITTED") put("submitted_on", now.slice(0, 10));
    if (patch.status === "CLEARED") put("cleared_on", now.slice(0, 10));
  }

  values.push(id);
  await getDatabase()
    .prepare("UPDATE finance_transactions SET " + sets.join(", ") + " WHERE id = ?")
    .bind(...values)
    .run();
}

/**
 * Nothing is deleted.
 *
 * A ledger that can lose a row cannot be reconciled against a wing statement, and "it must have been a
 * mistake" is not something an audit accepts. A wrong entry is voided, stays visible, and counts for nothing.
 */
export async function voidTransaction(id: string, reason: string): Promise<void> {
  const now = new Date().toISOString();
  await getDatabase()
    .prepare("UPDATE finance_transactions SET status = 'VOID', notes = COALESCE(notes || ' | ', '') || ?, updated_at = ? WHERE id = ?")
    .bind("Voided: " + reason.trim(), now, id)
    .run();
}

export interface BudgetLine {
  category: string;
  categoryLabel: string;
  direction: Direction;
  plannedCents: number;
  actualCents: number;
  /** Planned against actual, arranged so that positive is always the good direction. */
  varianceCents: number;
  /** Uncapped, so 140 per cent of a line reads as 1.4 rather than as finished. */
  used: number;
  note: string | null;
}

export async function budgetFor(fiscalYear: number, transactions?: Transaction[]): Promise<BudgetLine[]> {
  const ledger = transactions ?? await listTransactions(fiscalYear);
  let rows: Array<{ category: string; planned_cents: number; note: string | null }> = [];
  try {
    const result = await getDatabase()
      .prepare("SELECT category, planned_cents, note FROM finance_budget_lines WHERE workspace_id = ? AND fiscal_year = ?")
      .bind(WORKSPACE_ID, fiscalYear)
      .all<{ category: string; planned_cents: number; note: string | null }>();
    rows = result.results;
  } catch { /* not migrated yet */ }

  const planned = new Map(rows.map((row) => [row.category, row]));
  const actual = new Map<string, number>();
  ledger
    // Gifts are not spending and not cash income, so a budget line is not met by one.
    .filter((entry) => entry.status !== "VOID" && !entry.inKind)
    .forEach((entry) => actual.set(entry.category, (actual.get(entry.category) ?? 0) + entry.amountCents));

  return CATEGORIES
    .map((definition) => {
      const plannedCents = planned.get(definition.code)?.planned_cents ?? 0;
      const actualCents = actual.get(definition.code) ?? 0;
      return {
        category: definition.code,
        categoryLabel: definition.label,
        direction: definition.direction,
        plannedCents,
        actualCents,
        varianceCents: definition.direction === "INCOME" ? actualCents - plannedCents : plannedCents - actualCents,
        used: plannedCents > 0 ? actualCents / plannedCents : 0,
        note: planned.get(definition.code)?.note ?? null
      };
    })
    // A category nobody has budgeted and nobody has spent is noise on the page.
    .filter((line) => line.plannedCents > 0 || line.actualCents > 0);
}

export async function setBudgetLine(input: { fiscalYear: number; category: string; plannedCents: number; note?: string | null }): Promise<void> {
  const now = new Date().toISOString();
  await getDatabase()
    .prepare(
      "INSERT INTO finance_budget_lines (id, workspace_id, fiscal_year, category, direction, planned_cents, note, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(workspace_id, fiscal_year, category) DO UPDATE SET planned_cents = excluded.planned_cents, note = excluded.note, updated_at = excluded.updated_at"
    )
    .bind(
      crypto.randomUUID(), WORKSPACE_ID, input.fiscalYear, input.category, categoryDirection(input.category),
      Math.max(0, Math.round(input.plannedCents)), input.note?.trim() || null, now, now
    )
    .run();
}

/**
 * Money promised and not yet moved, in either direction.
 *
 * Deliberately not part of the ledger. An obligation is not a transaction: counting money somebody has said
 * they will pay as though it were in the account is how a unit talks itself into a balance it does not have.
 * These sit beside the ledger, are never added to it, and become a real entry only when the money moves.
 */
export type ObligationStatus = "OPEN" | "SETTLED" | "WRITTEN_OFF";

export interface Obligation {
  id: string;
  direction: Direction;
  amountCents: number;
  counterparty: string;
  purpose: string;
  category: string;
  categoryLabel: string;
  dueOn: string | null;
  status: ObligationStatus;
  transactionId: string | null;
  settledOn: string | null;
  notes: string | null;
  /** Negative once it is past its date. Null where there is no date to be late against. */
  daysLeft: number | null;
}

export async function listObligations(includeSettled = false): Promise<Obligation[]> {
  try {
    const rows = await getDatabase()
      .prepare(
        "SELECT * FROM finance_obligations WHERE workspace_id = ?" +
        (includeSettled ? "" : " AND status = 'OPEN'") +
        " ORDER BY status, due_on IS NULL, due_on, created_at"
      )
      .bind(WORKSPACE_ID)
      .all<{
        id: string; direction: Direction; amount_cents: number; counterparty: string; purpose: string;
        category: string; due_on: string | null; status: ObligationStatus; transaction_id: string | null;
        settled_on: string | null; notes: string | null;
      }>();
    const today = new Date();
    return rows.results.map((row) => ({
      id: row.id,
      direction: row.direction,
      amountCents: row.amount_cents,
      counterparty: row.counterparty,
      purpose: row.purpose,
      category: row.category,
      categoryLabel: categoryLabel(row.category),
      dueOn: row.due_on,
      status: row.status,
      transactionId: row.transaction_id,
      settledOn: row.settled_on,
      notes: row.notes,
      daysLeft: row.due_on
        ? Math.round((new Date(row.due_on + "T12:00:00Z").getTime() - today.getTime()) / 86400000)
        : null
    }));
  } catch {
    return [];
  }
}

export async function recordObligation(input: {
  direction: Direction;
  amountCents: number;
  counterparty: string;
  purpose: string;
  category: string;
  dueOn?: string | null;
  notes?: string | null;
  userId: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await getDatabase()
    .prepare(
      "INSERT INTO finance_obligations (id, workspace_id, direction, amount_cents, counterparty, purpose, category, due_on, notes, created_by, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      id, WORKSPACE_ID, input.direction, Math.round(input.amountCents), input.counterparty.trim(),
      input.purpose.trim(), input.category, input.dueOn ?? null, input.notes?.trim() || null, input.userId, now, now
    )
    .run();
  return id;
}

/**
 * The money arrived. One step, because two would be one step too many.
 *
 * Settling writes the ledger entry and links it back, so the obligation stops being outstanding and the
 * money appears where money is counted - rather than somebody recording it twice, or once, in the wrong
 * place, a fortnight later.
 */
export async function settleObligation(id: string, input: { occurredOn: string; userId: string }): Promise<string | null> {
  const db = getDatabase();
  const row = await db
    .prepare("SELECT * FROM finance_obligations WHERE id = ? AND status = 'OPEN'")
    .bind(id)
    .first<{ direction: Direction; amount_cents: number; counterparty: string; purpose: string; category: string }>();
  if (!row) return null;

  const transactionId = await recordTransaction({
    direction: row.direction,
    amountCents: row.amount_cents,
    occurredOn: input.occurredOn,
    category: row.category,
    purpose: row.purpose,
    counterparty: row.counterparty,
    notes: "Settles an amount that was outstanding.",
    userId: input.userId
  });

  await db
    .prepare("UPDATE finance_obligations SET status = 'SETTLED', transaction_id = ?, settled_on = ?, updated_at = ? WHERE id = ?")
    .bind(transactionId, input.occurredOn, new Date().toISOString(), id)
    .run();
  return transactionId;
}

/** Given up on, rather than paid. It stays visible and never becomes a ledger entry. */
export async function writeOffObligation(id: string, reason: string): Promise<void> {
  const now = new Date().toISOString();
  await getDatabase()
    .prepare("UPDATE finance_obligations SET status = 'WRITTEN_OFF', notes = COALESCE(notes || ' | ', '') || ?, updated_at = ? WHERE id = ?")
    .bind("Written off: " + reason.trim(), now, id)
    .run();
}

/**
 * What the unit was holding on 1 October, entered by a person from the wing statement.
 *
 * Null when nobody has said. The distinction matters: a missing opening balance is not zero, and the tracker
 * has to be able to tell the difference in order to keep quiet about a balance it cannot work out.
 */
export async function openingBalance(fiscalYear: number): Promise<{ cents: number; source: string | null } | null> {
  try {
    const row = await getDatabase()
      .prepare("SELECT opening_cents, source FROM finance_year_opening WHERE workspace_id = ? AND fiscal_year = ?")
      .bind(WORKSPACE_ID, fiscalYear)
      .first<{ opening_cents: number; source: string | null }>();
    return row ? { cents: row.opening_cents, source: row.source } : null;
  } catch {
    return null;
  }
}

export async function setOpeningBalance(input: { fiscalYear: number; cents: number; source?: string | null; userId: string }): Promise<void> {
  await getDatabase()
    .prepare(
      "INSERT INTO finance_year_opening (workspace_id, fiscal_year, opening_cents, source, recorded_by, updated_at) VALUES (?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(workspace_id, fiscal_year) DO UPDATE SET opening_cents = excluded.opening_cents, source = excluded.source, recorded_by = excluded.recorded_by, updated_at = excluded.updated_at"
    )
    .bind(WORKSPACE_ID, input.fiscalYear, Math.round(input.cents), input.source?.trim() || null, input.userId, new Date().toISOString())
    .run();
}

export interface Meeting {
  id: string;
  metOn: string;
  fiscalYear: number;
  fiscalQuarter: number;
  attendees: string | null;
  decisions: string | null;
  minutesFileId: string | null;
  minutesName: string | null;
}

export async function listMeetings(fiscalYear: number): Promise<Meeting[]> {
  try {
    const rows = await getDatabase()
      .prepare("SELECT * FROM finance_meetings WHERE workspace_id = ? AND fiscal_year = ? ORDER BY met_on DESC")
      .bind(WORKSPACE_ID, fiscalYear)
      .all<{
        id: string; met_on: string; fiscal_year: number; fiscal_quarter: number;
        attendees: string | null; decisions: string | null; minutes_file_id: string | null; minutes_name: string | null;
      }>();
    return rows.results.map((row) => ({
      id: row.id,
      metOn: row.met_on,
      fiscalYear: row.fiscal_year,
      fiscalQuarter: row.fiscal_quarter,
      attendees: row.attendees,
      decisions: row.decisions,
      minutesFileId: row.minutes_file_id,
      minutesName: row.minutes_name
    }));
  } catch {
    return [];
  }
}

export async function recordMeeting(input: { metOn: string; attendees?: string | null; decisions?: string | null; userId: string }): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await getDatabase()
    .prepare(
      "INSERT INTO finance_meetings (id, workspace_id, met_on, fiscal_year, fiscal_quarter, attendees, decisions, recorded_by, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      id, WORKSPACE_ID, input.metOn, fiscalYearOf(input.metOn), fiscalQuarterOf(input.metOn),
      input.attendees?.trim() || null, input.decisions?.trim() || null, input.userId, now, now
    )
    .run();
  return id;
}
