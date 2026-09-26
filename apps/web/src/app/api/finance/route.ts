import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/db/audit";
import { assertSameOrigin } from "@/lib/security/origin";
import {
  budgetFor,
  currentFiscalYear,
  listMeetings,
  listObligations,
  listTransactions,
  openingBalance,
  recordObligation,
  recordMeeting,
  recordTransaction,
  setBudgetLine,
  setOpeningBalance,
  settleObligation,
  updateTransaction,
  voidTransaction,
  writeOffObligation
} from "@/lib/finance/finance";
import { findings, summarise } from "@/lib/finance/findings";
import { createItem, updateItem } from "@/lib/work/items";

// The ledger's one endpoint.
//
// Money is the part of this app where a silent failure is least acceptable, so every write is audited with
// the amount in the summary. An audit line saying who recorded what, for how much, is the thing that makes a
// shared ledger usable by more than one person.

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const direction = z.enum(["INCOME", "EXPENSE"]);
const status = z.enum(["RECORDED", "SUBMITTED", "CLEARED"]);
// Cents, as an integer. The browser sends dollars; the form converts before it gets here, so nothing in the
// request body is ever a fraction.
const cents = z.number().int().min(1).max(1_000_000_00);

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("record"),
    direction,
    amountCents: cents,
    occurredOn: date,
    category: z.string().trim().min(2).max(40),
    purpose: z.string().trim().min(3).max(300),
    counterparty: z.string().trim().max(160).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    itemId: z.string().trim().max(80).nullable().optional(),
    inKind: z.boolean().optional(),
    itemDetail: z.string().trim().max(300).nullable().optional(),
    valueBasis: z.string().trim().max(300).nullable().optional()
  }),
  z.object({
    action: z.literal("update"),
    id: z.string().trim().min(1).max(80),
    amountCents: cents.optional(),
    occurredOn: date.optional(),
    category: z.string().trim().min(2).max(40).optional(),
    purpose: z.string().trim().min(3).max(300).optional(),
    counterparty: z.string().trim().max(160).nullable().optional(),
    status: status.optional(),
    wingReference: z.string().trim().max(80).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    approvedBy: z.string().trim().max(80).nullable().optional(),
    itemDetail: z.string().trim().max(300).nullable().optional(),
    valueBasis: z.string().trim().max(300).nullable().optional()
  }),
  z.object({
    action: z.literal("void"),
    id: z.string().trim().min(1).max(80),
    reason: z.string().trim().min(3).max(300)
  }),
  z.object({
    action: z.literal("budget"),
    fiscalYear: z.number().int().min(2000).max(2100),
    category: z.string().trim().min(2).max(40),
    plannedCents: z.number().int().min(0).max(1_000_000_00),
    note: z.string().trim().max(300).nullable().optional()
  }),
  z.object({
    action: z.literal("owe"),
    direction,
    amountCents: cents,
    counterparty: z.string().trim().min(1).max(160),
    purpose: z.string().trim().min(3).max(300),
    category: z.string().trim().min(2).max(40),
    dueOn: date.nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional()
  }),
  z.object({ action: z.literal("settle"), id: z.string().trim().min(1).max(80), occurredOn: date }),
  z.object({ action: z.literal("writeOff"), id: z.string().trim().min(1).max(80), reason: z.string().trim().min(3).max(300) }),
  z.object({
    action: z.literal("opening"),
    fiscalYear: z.number().int().min(2000).max(2100),
    cents: z.number().int().min(0).max(10_000_000_00),
    source: z.string().trim().max(200).nullable().optional()
  }),
  z.object({
    action: z.literal("meeting"),
    metOn: date,
    attendees: z.string().trim().max(600).nullable().optional(),
    decisions: z.string().trim().max(3000).nullable().optional()
  }),
  // A finding offers a task; a person makes it. The Hub never quietly creates work off its own arithmetic.
  z.object({
    action: z.literal("task"),
    listId: z.string().trim().min(1).max(80),
    title: z.string().trim().min(3).max(200),
    detail: z.string().trim().max(2000).optional()
  })
]);

function dollars(amountCents: number): string {
  return "$" + (amountCents / 100).toFixed(2);
}

async function state(fiscalYear: number) {
  const transactions = await listTransactions(fiscalYear);
  const [budget, meetings, opening, obligations] = await Promise.all([
    budgetFor(fiscalYear, transactions),
    listMeetings(fiscalYear),
    openingBalance(fiscalYear),
    listObligations()
  ]);
  const openingCents = opening?.cents ?? null;
  return {
    fiscalYear,
    transactions,
    budget,
    meetings,
    obligations,
    openingSource: opening?.source ?? null,
    summary: summarise(transactions, budget, fiscalYear, openingCents, obligations),
    findings: findings({ transactions, budget, meetings, fiscalYear, openingCents, obligations })
  };
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  const asked = Number(new URL(request.url).searchParams.get("fy"));
  const fiscalYear = Number.isFinite(asked) && asked > 2000 && asked < 2100 ? asked : currentFiscalYear();
  return NextResponse.json(await state(fiscalYear));
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (user.globalRole === "READ_ONLY") {
      return NextResponse.json({ message: "Read-only accounts cannot change the ledger." }, { status: 403 });
    }

    const input = schema.parse(await request.json());

    if (input.action === "record") {
      const id = await recordTransaction({ ...input, userId: user.id });
      await recordAuditEvent({
        actorUserId: user.id,
        action: "FINANCE_RECORDED",
        entityType: "finance_transaction",
        entityId: id,
        summary: user.fullName + " recorded " + (input.direction === "INCOME" ? "income of " : "an expense of ") + dollars(input.amountCents) + " for " + input.purpose,
        metadata: { amountCents: input.amountCents, category: input.category, occurredOn: input.occurredOn }
      });
      return NextResponse.json({ ...(await state(currentFiscalYearOf(input.occurredOn))), message: "Recorded " + dollars(input.amountCents) + "." });
    }

    if (input.action === "update") {
      const { action: _action, id, ...patch } = input;
      await updateTransaction(id, patch);
      await recordAuditEvent({
        actorUserId: user.id,
        action: "FINANCE_UPDATED",
        entityType: "finance_transaction",
        entityId: id,
        summary: user.fullName + " changed a finance entry" + (patch.status ? ", marking it " + patch.status.toLowerCase() : ""),
        metadata: patch as Record<string, unknown>
      });
      return NextResponse.json({ ...(await state(currentFiscalYear())), message: "Saved." });
    }

    if (input.action === "void") {
      await voidTransaction(input.id, input.reason);
      await recordAuditEvent({
        actorUserId: user.id,
        action: "FINANCE_VOIDED",
        entityType: "finance_transaction",
        entityId: input.id,
        summary: user.fullName + " voided a finance entry: " + input.reason,
        metadata: { reason: input.reason }
      });
      return NextResponse.json({ ...(await state(currentFiscalYear())), message: "Voided. It stays on the ledger and counts for nothing." });
    }

    if (input.action === "budget") {
      await setBudgetLine(input);
      await recordAuditEvent({
        actorUserId: user.id,
        action: "FINANCE_BUDGET_SET",
        entityType: "finance_budget",
        entityId: input.fiscalYear + ":" + input.category,
        summary: user.fullName + " set the FY" + input.fiscalYear + " " + input.category + " budget to " + dollars(input.plannedCents),
        metadata: { plannedCents: input.plannedCents }
      });
      return NextResponse.json({ ...(await state(input.fiscalYear)), message: "Budget set." });
    }

    if (input.action === "owe") {
      const id = await recordObligation({ ...input, userId: user.id });
      await recordAuditEvent({
        actorUserId: user.id,
        action: "FINANCE_OWED_RECORDED",
        entityType: "finance_obligation",
        entityId: id,
        summary: user.fullName + " recorded " + dollars(input.amountCents) + (input.direction === "INCOME" ? " owed to the squadron by " : " owed by the squadron to ") + input.counterparty,
        metadata: { amountCents: input.amountCents, dueOn: input.dueOn ?? null }
      });
      return NextResponse.json({ ...(await state(currentFiscalYear())), message: "Recorded as outstanding. It is not in the balance until it moves." });
    }

    if (input.action === "settle") {
      const transactionId = await settleObligation(input.id, { occurredOn: input.occurredOn, userId: user.id });
      if (!transactionId) return NextResponse.json({ message: "That is already settled." }, { status: 404 });
      await recordAuditEvent({
        actorUserId: user.id,
        action: "FINANCE_OWED_SETTLED",
        entityType: "finance_obligation",
        entityId: input.id,
        summary: user.fullName + " settled an outstanding amount, which is now on the ledger",
        metadata: { transactionId, occurredOn: input.occurredOn }
      });
      return NextResponse.json({ ...(await state(currentFiscalYearOf(input.occurredOn))), message: "Settled, and on the ledger." });
    }

    if (input.action === "writeOff") {
      await writeOffObligation(input.id, input.reason);
      await recordAuditEvent({
        actorUserId: user.id,
        action: "FINANCE_OWED_WRITTEN_OFF",
        entityType: "finance_obligation",
        entityId: input.id,
        summary: user.fullName + " wrote off an outstanding amount: " + input.reason,
        metadata: { reason: input.reason }
      });
      return NextResponse.json({ ...(await state(currentFiscalYear())), message: "Written off. It never becomes a ledger entry." });
    }

    if (input.action === "opening") {
      await setOpeningBalance({ ...input, userId: user.id });
      await recordAuditEvent({
        actorUserId: user.id,
        action: "FINANCE_OPENING_SET",
        entityType: "finance_opening",
        entityId: String(input.fiscalYear),
        summary: user.fullName + " set the FY" + input.fiscalYear + " opening balance to " + dollars(input.cents),
        metadata: { cents: input.cents, source: input.source ?? null }
      });
      return NextResponse.json({ ...(await state(input.fiscalYear)), message: "Opening balance set." });
    }

    if (input.action === "meeting") {
      const id = await recordMeeting({ ...input, userId: user.id });
      await recordAuditEvent({
        actorUserId: user.id,
        action: "FINANCE_MEETING_RECORDED",
        entityType: "finance_meeting",
        entityId: id,
        summary: user.fullName + " recorded a finance committee meeting held on " + input.metOn,
        metadata: { metOn: input.metOn }
      });
      return NextResponse.json({ ...(await state(currentFiscalYearOf(input.metOn))), message: "Meeting recorded." });
    }

    const itemId = await createItem({ listId: input.listId, title: input.title, userId: user.id });
    if (input.detail) await updateItem(itemId, { description: input.detail });
    return NextResponse.json({ itemId, message: "Task made." });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ message: "That entry was not valid." }, { status: 400 });
    console.error(error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "That could not be saved." }, { status: 500 });
  }
}

/** The year a date belongs to, so recording something in September does not return an empty October. */
function currentFiscalYearOf(date: string): number {
  const month = Number(date.slice(5, 7));
  return month >= 10 ? Number(date.slice(0, 4)) + 1 : Number(date.slice(0, 4));
}
