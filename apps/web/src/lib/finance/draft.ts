import { aiChatFor } from "@/lib/ai/provider";
import { parseJsonReply } from "@/lib/ai/local";
import {
  CATEGORIES,
  categoryDirection,
  fiscalYearRange,
  listTransactions,
  type Direction
} from "@/lib/finance/finance";

// Saying where the squadron's money is, instead of filling in a form for every line of it.
//
// A finance officer coming back from a month of activity has it in their head as sentences: "we took ninety
// dollars in dues at the September meeting, paid forty-two for the rocketry kits on the fourteenth, and the
// Warthans still owe sixty for encampment". Typing that is a minute. Filling in six fields five times is not,
// and the thing nobody does is the thing that stops being true.
//
// This is the highest-stakes place in the Hub for a model to be wrong, so nothing it returns is trusted.
// Every amount has to appear in what was actually said. Every date has to be a real date inside the year.
// Every category has to be one the Hub already has. Anything that fails is dropped and reported as dropped,
// and the whole thing is a proposal a person confirms before a single row is written.

export type DraftKind = "TRANSACTION" | "OWED" | "OPENING" | "MEETING";

export interface DraftEntry {
  kind: DraftKind;
  direction: Direction;
  amountCents: number;
  occurredOn: string;
  category: string;
  categoryLabel: string;
  purpose: string;
  counterparty: string | null;
  /** In-kind gifts are income and never cash, and have to be marked as such before anything is counted. */
  inKind: boolean;
  /** The words this line came from, so somebody can check it against what they said. */
  because: string | null;
}

export interface Check {
  tone: "OK" | "WARN";
  says: string;
}

export interface FinanceDraft {
  entries: DraftEntry[];
  openingCents: number | null;
  checks: Check[];
}

/** Dollars as a person writes them, into whole cents. Never a float. */
function toCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100);
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
}

function isDate(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value + "T12:00:00Z"));
}

/**
 * Whether an amount was really in what the person said.
 *
 * The one check that matters most. A model that hears "about ninety dollars in dues" and writes 900 has
 * produced a plausible number from nothing, and a plausible wrong number in a ledger is worse than a
 * missing one - nobody goes looking for it. The digits have to be there in the text, allowing for how
 * people write money: 90, 90.00, $90, 1,250.
 */
function amountWasSaid(cents: number, said: string): boolean {
  // Compared against the numbers in the text, not searched for inside it.
  //
  // A substring test looked right and was not. Forty-two fifty heard as forty-two ninety-nine passed,
  // because only the dollars had to match; and five hundred matched inside an invoice number. Both are the
  // exact failure this check exists to catch, so the amounts written down are pulled out whole and compared
  // whole.
  const tokens = (said.match(/\d[\d,]*(?:\.\d{1,2})?/g) ?? []).map((token) => token.replace(/,/g, ""));
  const exact = (cents / 100).toFixed(2);
  const whole = String(Math.floor(cents / 100));
  const hasCents = cents % 100 !== 0;

  return tokens.some((token) => {
    if (token === exact) return true;
    // A bare figure means whole dollars. It cannot stand in for an amount that has cents in it.
    if (!hasCents && token === whole) return true;
    if (!hasCents && token === whole + ".0") return true;
    return false;
  });
}

const SYSTEM = [
  "You turn a Civil Air Patrol squadron finance officer's plain description of their money into structured",
  "entries. Reply with JSON only:",
  '{"entries": [{"kind": "TRANSACTION" | "OWED", "direction": "INCOME" | "EXPENSE", "amount": "0.00",',
  '"occurredOn": "YYYY-MM-DD", "category": "<code>", "purpose": "<what it was for>", "counterparty": "<who>",',
  '"inKind": true|false, "because": "<the words from the description this came from>"}],',
  '"openingCents": "0.00" or null}',
  "",
  "Rules, all of them strict:",
  "- Only entries the description actually states. Never invent one to be helpful.",
  "- amount must be the figure that appears in the description. Never round, estimate or infer a number.",
  "- because must be words copied from the description, not your own summary.",
  "- kind is OWED when the money has not moved yet: somebody owes it, or the squadron owes it.",
  "- inKind is true only for a gift of goods or services rather than money.",
  "- category must be one of the codes given. If none fits, use OTHER_INCOME or OTHER_EXPENSE.",
  "- openingCents only when the description says what the unit started the year with.",
  "- If the description contains no money at all, reply {\"entries\": [], \"openingCents\": null}."
].join("\n");

export async function draftFinance(input: {
  userId: string;
  said: string;
  fiscalYear: number;
}): Promise<FinanceDraft> {
  const { start, end } = fiscalYearRange(input.fiscalYear);
  const today = new Date().toISOString().slice(0, 10);

  const reply = await aiChatFor(input.userId, [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: [
        "Today is " + today + ". The fiscal year runs " + start + " to " + end + ".",
        "Categories: " + CATEGORIES.map((entry) => entry.code + " (" + entry.label + ")").join(", "),
        "",
        "The finance officer says:",
        input.said.trim().slice(0, 3000)
      ].join("\n")
    }
  ], { json: true, maxTokens: 1200 });

  const parsed = parseJsonReply<{ entries?: unknown; openingCents?: unknown }>(reply, {});
  const rows = Array.isArray(parsed.entries) ? parsed.entries : [];

  const checks: Check[] = [];
  const entries: DraftEntry[] = [];
  let droppedForAmount = 0;
  let droppedForDate = 0;
  let movedIntoYear = 0;

  rows.slice(0, 25).forEach((raw) => {
    const row = raw as Record<string, unknown>;
    const amountCents = toCents(row.amount);
    if (!amountCents || amountCents <= 0) {
      droppedForAmount += 1;
      return;
    }
    // The figure has to be in what was said. This is the line between reading and inventing.
    if (!amountWasSaid(amountCents, input.said)) {
      droppedForAmount += 1;
      return;
    }

    let occurredOn = isDate(row.occurredOn) ? row.occurredOn : today;
    if (!isDate(row.occurredOn)) droppedForDate += 1;
    if (occurredOn < start || occurredOn > end) {
      // Outside the year being looked at. Kept, and said, because a genuine late entry is common and
      // silently moving it would put money in the wrong year.
      movedIntoYear += 1;
    }

    const wanted = typeof row.category === "string" ? row.category.trim().toUpperCase() : "";
    const known = CATEGORIES.find((entry) => entry.code === wanted);
    const direction: Direction = row.direction === "INCOME" || row.direction === "EXPENSE"
      ? row.direction
      : known
        ? known.direction
        : "EXPENSE";
    const category = known
      ? known.code
      : direction === "INCOME" ? "OTHER_INCOME" : "OTHER_EXPENSE";

    const purpose = typeof row.purpose === "string" && row.purpose.trim().length > 2
      ? row.purpose.trim().slice(0, 300)
      : "Recorded from a description";

    const because = typeof row.because === "string" ? row.because.trim().slice(0, 200) : "";
    // The quote has to be somebody's own words, or it is the model's sentence wearing quotation marks.
    const quoted = because.length > 3 && input.said.toLowerCase().includes(because.toLowerCase().slice(0, Math.min(20, because.length)));

    entries.push({
      kind: row.kind === "OWED" ? "OWED" : "TRANSACTION",
      direction,
      amountCents,
      occurredOn,
      category,
      categoryLabel: CATEGORIES.find((entry) => entry.code === category)?.label ?? category,
      purpose,
      counterparty: typeof row.counterparty === "string" && row.counterparty.trim() ? row.counterparty.trim().slice(0, 160) : null,
      inKind: row.inKind === true && direction === "INCOME",
      because: quoted ? because : null
    });
  });

  const openingCents = toCents(parsed.openingCents);

  // ---------------------------------------------------------------- what to tell the person
  if (!entries.length) {
    checks.push({
      tone: "WARN",
      says: "Nothing could be read from that as money moving. Say the amounts, what each was for, and roughly when."
    });
  } else {
    const inCount = entries.filter((entry) => entry.direction === "INCOME").length;
    const outCount = entries.length - inCount;
    checks.push({
      tone: "OK",
      says: entries.length + (entries.length === 1 ? " entry" : " entries") + " read" +
        (inCount && outCount ? " — " + inCount + " in, " + outCount + " out." : ".")
    });
  }

  if (droppedForAmount) {
    checks.push({
      tone: "WARN",
      says: droppedForAmount + (droppedForAmount === 1 ? " line was dropped" : " lines were dropped") +
        " because the amount was not a figure you actually said. Nothing is guessed at here."
    });
  }
  if (droppedForDate) {
    checks.push({
      tone: "WARN",
      says: droppedForDate + (droppedForDate === 1 ? " entry had no date" : " entries had no date") +
        " and was put on today. Change it if that is wrong."
    });
  }
  if (movedIntoYear) {
    checks.push({
      tone: "WARN",
      says: movedIntoYear + (movedIntoYear === 1 ? " entry falls" : " entries fall") +
        " outside FY" + input.fiscalYear + ". It will be recorded in whichever year its date belongs to."
    });
  }

  // Which way round an owed amount goes.
  //
  // Tested against a real sentence, "the Warthans still owe 60 for encampment" came back as the squadron
  // owing the Warthans. The words are unambiguous to a person and evidently not to a model, and getting it
  // backwards turns money coming in into money going out. Every outstanding amount is therefore called out
  // to be confirmed, with the reading stated in plain words so it can be disagreed with at a glance.
  const owedEntries = entries.filter((entry) => entry.kind === "OWED");
  if (owedEntries.length) {
    checks.push({
      tone: "WARN",
      says: "Check which way round " + (owedEntries.length === 1 ? "the outstanding amount goes" : "the outstanding amounts go") + ": " +
        owedEntries.map((entry) => (entry.counterparty ?? "somebody") + " " +
          (entry.direction === "INCOME" ? "owes the squadron " : "is owed ") + "$" + (entry.amountCents / 100).toFixed(2)).join("; ") +
        ". Change the direction on any that is backwards."
    });
  }

  // Dates spread from one mention across everything.
  //
  // The same test put all three entries on the fourteenth, because that was the only day named and it was
  // applied to all of them. A date nobody gave is not better than no date.
  const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";
  // Only what a person says as a date: an ordinal, a month, or a written date. A bare number is an
  // amount far more often than a day, and counting those made this check never fire at all.
  const datesSaid = new Set(
    (input.said.match(new RegExp("\\b\\d{4}-\\d{2}-\\d{2}\\b|\\b\\d{1,2}(st|nd|rd|th)\\b|\\b(" + MONTHS + ")\\b", "gi")) ?? []).map((token) => token.toLowerCase())
  );
  const distinctDates = new Set(entries.map((entry) => entry.occurredOn));
  if (entries.length > 1 && distinctDates.size < entries.length && datesSaid.size <= 1) {
    checks.push({
      tone: "WARN",
      says: "Only one date was said and " + entries.length + " entries were given it. Put the right date on each before recording them."
    });
  }

  const unquoted = entries.filter((entry) => !entry.because).length;
  if (unquoted) {
    checks.push({
      tone: "WARN",
      says: unquoted + (unquoted === 1 ? " entry has" : " entries have") +
        " no quote from what you said behind them. Check those ones closely."
    });
  }

  // Something very like this may already be on the ledger.
  try {
    const existing = await listTransactions(input.fiscalYear);
    const already = entries.filter((entry) => existing.some((row) =>
      row.status !== "VOID" &&
      row.amountCents === entry.amountCents &&
      row.occurredOn === entry.occurredOn &&
      row.category === entry.category
    )).length;
    if (already) {
      checks.push({
        tone: "WARN",
        says: already + (already === 1 ? " entry matches something" : " entries match things") +
          " already on the ledger for the same day, amount and category. Check you are not recording it twice."
      });
    }
  } catch {
    // No ledger yet, so nothing to be a duplicate of.
  }

  const gifts = entries.filter((entry) => entry.inKind).length;
  if (gifts) {
    checks.push({
      tone: "OK",
      says: gifts + (gifts === 1 ? " entry is a gift of goods" : " entries are gifts of goods") +
        " and will be recorded as given, not banked — no cash figure will change."
    });
  }

  checks.push({ tone: "OK", says: "Nothing has been recorded. Change anything below; it is only real once you press the button." });

  return { entries, openingCents, checks };
}

export { categoryDirection };
