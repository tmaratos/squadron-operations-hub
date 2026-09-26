import { CATEGORIES, fiscalQuarterOf, fiscalYearRange, type BudgetLine, type Meeting, type Transaction } from "@/lib/finance/finance";

// What the ledger says about itself.
//
// Every finding below is arithmetic on recorded numbers and dates. Nothing here is generated, inferred or
// phrased by a model, and nothing is a judgement about whether money was well spent - that is command's
// call and not the Hub's. The whole value of the thing is that a finding can be checked by hand in ten
// seconds, so a member can disagree with it and be right.
//
// This is the automated half of the tracker. A finance officer should not have to remember that a deposit
// has been sitting unsubmitted for three weeks, that a quarter closed with no committee meeting minuted, or
// that the cadet programs line went past its budget in July. The arithmetic is free; the remembering is not.

export type Severity = "ATTENTION" | "WATCH" | "SETTLED";

export interface Finding {
  code:
    | "NOT_SUBMITTED"
    | "AWAITING_WING"
    | "MISSING_RECEIPT"
    | "UNAPPROVED"
    | "OVER_BUDGET"
    | "UNBUDGETED"
    | "NO_MEETING"
    | "POSSIBLE_DUPLICATE"
    | "NEGATIVE_BALANCE";
  severity: Severity;
  /** One sentence, stating what is the case. Never advice. */
  says: string;
  /** The arithmetic behind it, so the claim can be checked rather than believed. */
  because: string;
  transactionIds: string[];
  /** Offered for the button, never acted on: the Hub suggests the task and a person makes it. */
  suggestedTask: string | null;
}

/** Spending above this with nobody recorded as having approved it is worth saying out loud. */
const APPROVAL_THRESHOLD_CENTS = 25000; // $250
const SUBMIT_WITHIN_DAYS = 14;
const WING_CLEAR_WITHIN_DAYS = 21;
const RECEIPT_WITHIN_DAYS = 14;

function money(cents: number): string {
  // The sign goes outside the dollar sign. "$-30.00" is how a spreadsheet writes it and not how anybody
  // reads it, and a finding about an overdrawn balance is a bad place to look unfinished.
  const text = "$" + (Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return cents < 0 ? "-" + text : text;
}

function daysSince(date: string, today: Date): number {
  const then = new Date(date.length === 10 ? date + "T12:00:00Z" : date).getTime();
  return Math.floor((today.getTime() - then) / 86400000);
}

function plural(count: number, one: string, many: string): string {
  return count + " " + (count === 1 ? one : many);
}

export function findings(input: {
  transactions: Transaction[];
  budget: BudgetLine[];
  meetings: Meeting[];
  fiscalYear: number;
  /** What the unit held on 1 October, or null where nobody has entered it. Null means no claim is made. */
  openingCents?: number | null;
  today?: Date;
}): Finding[] {
  const today = input.today ?? new Date();
  const live = input.transactions.filter((entry) => entry.status !== "VOID");
  const found: Finding[] = [];

  // Recorded and never sent onward. Under the wing banker arrangement the unit's money physically moves, and
  // an entry stuck at RECORDED means either it has not been sent or it was sent and nobody said so here.
  const unsent = live.filter((entry) => entry.status === "RECORDED" && daysSince(entry.occurredOn, today) > SUBMIT_WITHIN_DAYS);
  if (unsent.length) {
    const oldest = Math.max(...unsent.map((entry) => daysSince(entry.occurredOn, today)));
    const deposits = unsent.filter((entry) => entry.direction === "INCOME").length;
    const checks = unsent.length - deposits;
    found.push({
      code: "NOT_SUBMITTED",
      severity: "ATTENTION",
      says: [
        deposits ? plural(deposits, "deposit", "deposits") + " with no advice sent" : null,
        checks ? plural(checks, "payment", "payments") + " with no check request" : null
      ].filter(Boolean).join(", ") + ".",
      because: "Recorded more than " + SUBMIT_WITHIN_DAYS + " days ago and still at Recorded. The oldest is " + oldest + " days old, totalling " + money(unsent.reduce((sum, entry) => sum + entry.amountCents, 0)) + ".",
      transactionIds: unsent.map((entry) => entry.id),
      suggestedTask: deposits && checks
        ? "Send " + deposits + " deposit advice and " + checks + " check request to wing"
        : deposits
          ? "Send " + plural(deposits, "deposit advice", "deposit advices") + " to wing"
          : "Raise " + plural(checks, "check request", "check requests") + " with wing"
    });
  }

  // Sent and nothing back. This one is usually wing's turn rather than ours, which is why it only watches.
  const waiting = live.filter((entry) => entry.status === "SUBMITTED" && entry.submittedOn && daysSince(entry.submittedOn, today) > WING_CLEAR_WITHIN_DAYS);
  if (waiting.length) {
    found.push({
      code: "AWAITING_WING",
      severity: "WATCH",
      says: plural(waiting.length, "entry", "entries") + " has been with wing for over " + WING_CLEAR_WITHIN_DAYS + " days.",
      because: "Submitted and not yet cleared. " + money(waiting.reduce((sum, entry) => sum + entry.amountCents, 0)) + " is unreconciled, the oldest submitted " + Math.max(...waiting.map((entry) => daysSince(entry.submittedOn!, today))) + " days ago.",
      transactionIds: waiting.map((entry) => entry.id),
      suggestedTask: "Ask wing about " + plural(waiting.length, "unreconciled entry", "unreconciled entries")
    });
  }

  // An expense with no paper. The one thing an audit asks for that cannot be reconstructed later.
  const noReceipt = live.filter((entry) => entry.direction === "EXPENSE" && !entry.receiptFileId && daysSince(entry.occurredOn, today) > RECEIPT_WITHIN_DAYS);
  if (noReceipt.length) {
    found.push({
      code: "MISSING_RECEIPT",
      severity: "ATTENTION",
      says: plural(noReceipt.length, "expense", "expenses") + " has no receipt attached.",
      because: "Expenses older than " + RECEIPT_WITHIN_DAYS + " days with no receipt file, totalling " + money(noReceipt.reduce((sum, entry) => sum + entry.amountCents, 0)) + ".",
      transactionIds: noReceipt.map((entry) => entry.id),
      suggestedTask: "Find receipts for " + plural(noReceipt.length, "expense", "expenses")
    });
  }

  const unapproved = live.filter((entry) => entry.direction === "EXPENSE" && !entry.approvedBy && entry.amountCents >= APPROVAL_THRESHOLD_CENTS);
  if (unapproved.length) {
    found.push({
      code: "UNAPPROVED",
      severity: "ATTENTION",
      says: plural(unapproved.length, "expense", "expenses") + " over " + money(APPROVAL_THRESHOLD_CENTS) + " has nobody recorded as approving it.",
      because: "No approver on record. The largest is " + money(Math.max(...unapproved.map((entry) => entry.amountCents))) + ".",
      transactionIds: unapproved.map((entry) => entry.id),
      suggestedTask: "Record who approved " + plural(unapproved.length, "expense", "expenses")
    });
  }

  // Over the line the unit approved for itself. Stated per category, because "over budget" as a single
  // number tells a finance officer nothing they can act on.
  input.budget
    .filter((line) => line.direction === "EXPENSE" && line.plannedCents > 0 && line.actualCents > line.plannedCents)
    .forEach((line) => found.push({
      code: "OVER_BUDGET",
      severity: "ATTENTION",
      says: line.categoryLabel + " is over its budget for FY" + input.fiscalYear + ".",
      because: money(line.actualCents) + " spent against " + money(line.plannedCents) + " planned, over by " + money(line.actualCents - line.plannedCents) + " at " + Math.round(line.used * 100) + " per cent.",
      transactionIds: input.transactions.filter((entry) => entry.category === line.category && entry.status !== "VOID").map((entry) => entry.id),
      suggestedTask: "Take " + line.categoryLabel + " being over budget to the finance committee"
    }));

  // Spending in a category the budget does not mention at all. Not wrong, but it means the approved budget
  // and the actual year have drifted apart, and only one of them is the document anybody is shown.
  const unbudgeted = input.budget.filter((line) => line.direction === "EXPENSE" && line.plannedCents === 0 && line.actualCents > 0);
  if (unbudgeted.length) {
    found.push({
      code: "UNBUDGETED",
      severity: "WATCH",
      says: plural(unbudgeted.length, "category", "categories") + " has spending with no budget line.",
      because: unbudgeted.map((line) => line.categoryLabel + " " + money(line.actualCents)).join(", ") + ". Nothing was planned for " + (unbudgeted.length === 1 ? "it" : "them") + " this year.",
      transactionIds: [],
      suggestedTask: "Add budget lines for " + plural(unbudgeted.length, "unbudgeted category", "unbudgeted categories")
    });
  }

  // Quarters with no meeting minuted against them.
  //
  // Quarterly is the floor set by CAPR 173-1 para 9.c.(8), and TN-170's own practice is to meet in the first
  // month of each fiscal quarter - so a quarter is late once that month has ended, not only once the whole
  // quarter has. A quarter still inside its first month has not failed to do anything yet, and a tracker
  // that nags about the present is a tracker people switch off.
  const { end } = fiscalYearRange(input.fiscalYear);
  const yearIsOver = today > new Date(end + "T23:59:59Z");
  const minuted = new Set(input.meetings.map((meeting) => meeting.fiscalQuarter));
  // The month each quarter opens in: Q1 October, Q2 January, Q3 April, Q4 July.
  const quarterOpens = (quarter: number) => new Date(Date.UTC(input.fiscalYear - (quarter === 1 ? 1 : 0), (9 + 3 * (quarter - 1)) % 12, 1));
  const overdue = [1, 2, 3, 4]
    .filter((quarter) => !minuted.has(quarter))
    .map((quarter) => {
      const opens = quarterOpens(quarter);
      const firstMonthEnded = new Date(Date.UTC(opens.getUTCFullYear(), opens.getUTCMonth() + 1, 1));
      const quarterEnded = new Date(Date.UTC(opens.getUTCFullYear(), opens.getUTCMonth() + 3, 1));
      return { quarter, late: yearIsOver || today >= firstMonthEnded, closed: yearIsOver || today >= quarterEnded };
    })
    .filter((entry) => entry.late);
  if (overdue.length) {
    const closed = overdue.filter((entry) => entry.closed);
    const quarters = overdue.map((entry) => "Q" + entry.quarter);
    found.push({
      code: "NO_MEETING",
      severity: closed.length ? "ATTENTION" : "WATCH",
      says: "No finance committee meeting is recorded for " + quarters.join(" and ") + " of FY" + input.fiscalYear + ".",
      because: "Quarterly is the minimum under CAPR 173-1 para 9.c.(8), and the squadron meets in the first month of each fiscal quarter. " +
        (closed.length ? closed.length + " of these " + (closed.length === 1 ? "quarter has" : "quarters have") + " closed entirely. " : "That month has passed. ") +
        "The Hub does not hold the minutes, only whether a meeting was recorded.",
      transactionIds: [],
      suggestedTask: "Record the finance committee meeting for " + quarters.join(" and ")
    });
  }

  // Two entries that are identical in the three fields somebody would type twice.
  const bySignature = new Map<string, Transaction[]>();
  live.forEach((entry) => {
    const key = entry.occurredOn + "|" + entry.category + "|" + entry.amountCents + "|" + entry.direction;
    bySignature.set(key, [...(bySignature.get(key) ?? []), entry]);
  });
  const duplicates = [...bySignature.values()].filter((group) => group.length > 1);
  if (duplicates.length) {
    found.push({
      code: "POSSIBLE_DUPLICATE",
      severity: "WATCH",
      says: duplicates.length + " set" + (duplicates.length === 1 ? "" : "s") + " of entries share a date, category and amount.",
      because: "Same day, same category, same amount, same direction. Two payments can legitimately match; a double entry looks exactly like this too.",
      transactionIds: duplicates.flat().map((entry) => entry.id),
      suggestedTask: null
    });
  }

  // The balance, which can only be spoken about once somebody has entered what the year opened with.
  //
  // This started life as "cleared spending is ahead of cleared income", and a test of a ledger holding one
  // ten dollar expense returned it - correct, useless, and the fastest way to teach a squadron to ignore
  // this panel, because a unit carries money over and the Hub had no idea how much. An unknown opening
  // balance now produces silence rather than a claim.
  if (input.openingCents !== null && input.openingCents !== undefined) {
    const clearedIn = live.filter((entry) => entry.direction === "INCOME" && entry.status === "CLEARED").reduce((sum, entry) => sum + entry.amountCents, 0);
    const clearedOut = live.filter((entry) => entry.direction === "EXPENSE" && entry.status === "CLEARED").reduce((sum, entry) => sum + entry.amountCents, 0);
    const balance = input.openingCents + clearedIn - clearedOut;
    const committed = live.filter((entry) => entry.direction === "EXPENSE" && entry.status !== "CLEARED").reduce((sum, entry) => sum + entry.amountCents, 0);
    if (balance < 0) {
      found.push({
        code: "NEGATIVE_BALANCE",
        severity: "ATTENTION",
        says: "The unit is " + money(Math.abs(balance)) + " overdrawn against what it started the year with.",
        because: money(input.openingCents) + " opening, " + money(clearedIn) + " in, " + money(clearedOut) + " out, all cleared. That leaves " + money(balance) + ".",
        transactionIds: [],
        suggestedTask: "Reconcile the unit balance with wing"
      });
    } else if (committed > balance) {
      found.push({
        code: "NEGATIVE_BALANCE",
        severity: "WATCH",
        says: "Spending already committed is more than the unit has left.",
        because: money(balance) + " on hand after cleared movement, against " + money(committed) + " recorded and not yet cleared.",
        transactionIds: [],
        suggestedTask: null
      });
    }
  }

  const order: Record<Severity, number> = { ATTENTION: 0, WATCH: 1, SETTLED: 2 };
  return found.sort((left, right) => order[left.severity] - order[right.severity]);
}

export interface Summary {
  fiscalYear: number;
  /** Null where nobody has entered it, and shown as unknown rather than as zero. */
  openingCents: number | null;
  /** Opening plus cleared movement. Null while the opening figure is unknown. */
  balanceCents: number | null;
  incomeCents: number;
  expenseCents: number;
  /** Everything recorded, whatever state it is in. What the year actually looks like. */
  netCents: number;
  /** Only what wing has cleared. What is provable. */
  clearedNetCents: number;
  pendingOutCents: number;
  pendingInCents: number;
  entryCount: number;
  byQuarter: Array<{ quarter: number; incomeCents: number; expenseCents: number }>;
  plannedIncomeCents: number;
  plannedExpenseCents: number;
}

export function summarise(transactions: Transaction[], budget: BudgetLine[], fiscalYear: number, openingCents?: number | null): Summary {
  const live = transactions.filter((entry) => entry.status !== "VOID");
  const sum = (rows: Transaction[]) => rows.reduce((total, entry) => total + entry.amountCents, 0);
  const income = live.filter((entry) => entry.direction === "INCOME");
  const expense = live.filter((entry) => entry.direction === "EXPENSE");

  const clearedNetCents = sum(income.filter((entry) => entry.status === "CLEARED")) - sum(expense.filter((entry) => entry.status === "CLEARED"));
  const opening = openingCents ?? null;

  return {
    fiscalYear,
    openingCents: opening,
    balanceCents: opening === null ? null : opening + clearedNetCents,
    incomeCents: sum(income),
    expenseCents: sum(expense),
    netCents: sum(income) - sum(expense),
    clearedNetCents,
    pendingOutCents: sum(expense.filter((entry) => entry.status !== "CLEARED")),
    pendingInCents: sum(income.filter((entry) => entry.status !== "CLEARED")),
    entryCount: live.length,
    byQuarter: [1, 2, 3, 4].map((quarter) => ({
      quarter,
      incomeCents: sum(income.filter((entry) => entry.fiscalQuarter === quarter)),
      expenseCents: sum(expense.filter((entry) => entry.fiscalQuarter === quarter))
    })),
    plannedIncomeCents: budget.filter((line) => line.direction === "INCOME").reduce((total, line) => total + line.plannedCents, 0),
    plannedExpenseCents: budget.filter((line) => line.direction === "EXPENSE").reduce((total, line) => total + line.plannedCents, 0)
  };
}

/** The categories, for the form. Exported here so a page imports one module and not two. */
export { CATEGORIES };
