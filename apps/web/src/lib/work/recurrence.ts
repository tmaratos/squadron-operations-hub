// Working out when a routine falls due.
//
// The rules people actually use are "the 15th", "the first Monday", "the last Friday of the quarter" -
// so both a day number and an nth-weekday rule are supported, and for quarterly the month inside the
// quarter can be named. Everything is plain dates: no timezone arithmetic, because a due date is a day,
// not a moment.

export type Frequency = "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUAL";

export interface RecurrenceRule {
  frequency: Frequency;
  /** 1..31. Ignored when a weekday rule is given. */
  dayOfMonth?: number | null;
  /** 0 Sunday .. 6 Saturday. */
  weekday?: number | null;
  /** 1..4, or -1 for the last of that weekday in the month. */
  weekOfMonth?: number | null;
  /** QUARTERLY: 1..3, which month within the quarter. ANNUAL: 1..12, which month of the year. */
  monthOfPeriod?: number | null;
}

function iso(year: number, month: number, day: number): string {
  return year + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The date of the nth given weekday in a month; -1 means the last one. */
function nthWeekday(year: number, month: number, weekday: number, week: number): number {
  if (week === -1) {
    const last = daysInMonth(year, month);
    const lastDow = new Date(Date.UTC(year, month - 1, last)).getUTCDay();
    return last - ((lastDow - weekday + 7) % 7);
  }
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - firstDow + 7) % 7) + (week - 1) * 7;
  return Math.min(day, daysInMonth(year, month));
}

function dayIn(year: number, month: number, rule: RecurrenceRule): number {
  if (rule.weekday !== null && rule.weekday !== undefined && rule.weekOfMonth) {
    return nthWeekday(year, month, rule.weekday, rule.weekOfMonth);
  }
  return Math.min(rule.dayOfMonth ?? 1, daysInMonth(year, month));
}

/**
 * The first date this rule falls due strictly after `after`.
 * `after` is a plain YYYY-MM-DD; so is the answer.
 */
export function nextDue(rule: RecurrenceRule, after: string): string {
  const start = new Date(after + "T00:00:00Z");

  if (rule.frequency === "WEEKLY") {
    const weekday = rule.weekday ?? 1;
    const ahead = ((weekday - start.getUTCDay() + 7) % 7) || 7;
    const next = new Date(start.getTime() + ahead * 86400000);
    return next.toISOString().slice(0, 10);
  }

  if (rule.frequency === "MONTHLY") {
    for (let step = 0; step < 24; step += 1) {
      const year = start.getUTCFullYear() + Math.floor((start.getUTCMonth() + step) / 12);
      const month = ((start.getUTCMonth() + step) % 12) + 1;
      const candidate = iso(year, month, dayIn(year, month, rule));
      if (candidate > after) return candidate;
    }
  }

  if (rule.frequency === "QUARTERLY") {
    // Quarters are Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec; monthOfPeriod picks the month inside one.
    const offset = Math.min(Math.max(rule.monthOfPeriod ?? 1, 1), 3) - 1;
    for (let step = 0; step < 12; step += 1) {
      const quarterStartMonth = Math.floor(start.getUTCMonth() / 3) * 3 + step * 3;
      const year = start.getUTCFullYear() + Math.floor(quarterStartMonth / 12);
      const month = (quarterStartMonth % 12) + 1 + offset;
      const realYear = month > 12 ? year + 1 : year;
      const realMonth = month > 12 ? month - 12 : month;
      const candidate = iso(realYear, realMonth, dayIn(realYear, realMonth, rule));
      if (candidate > after) return candidate;
    }
  }

  // ANNUAL
  const month = Math.min(Math.max(rule.monthOfPeriod ?? 1, 1), 12);
  for (let step = 0; step < 5; step += 1) {
    const year = start.getUTCFullYear() + step;
    const candidate = iso(year, month, dayIn(year, month, rule));
    if (candidate > after) return candidate;
  }
  return iso(start.getUTCFullYear() + 1, month, dayIn(start.getUTCFullYear() + 1, month, rule));
}

/** Says the rule back in words, so somebody can check the Hub understood them. */
export function describeRecurrence(rule: RecurrenceRule): string {
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const ordinals: Record<number, string> = { 1: "first", 2: "second", 3: "third", 4: "fourth", [-1]: "last" };
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const day = rule.weekday !== null && rule.weekday !== undefined && rule.weekOfMonth
    ? "the " + (ordinals[rule.weekOfMonth] ?? "first") + " " + weekdays[rule.weekday]
    : "the " + (rule.dayOfMonth ?? 1) + (([1, 21, 31].includes(rule.dayOfMonth ?? 1)) ? "st" : [2, 22].includes(rule.dayOfMonth ?? 1) ? "nd" : [3, 23].includes(rule.dayOfMonth ?? 1) ? "rd" : "th");

  if (rule.frequency === "WEEKLY") return "Every " + weekdays[rule.weekday ?? 1];
  if (rule.frequency === "MONTHLY") return "Every month, on " + day;
  if (rule.frequency === "QUARTERLY") {
    const which = rule.monthOfPeriod === 3 ? "third" : rule.monthOfPeriod === 2 ? "second" : "first";
    return "Every quarter, on " + day + " of the " + which + " month";
  }
  return "Every year, on " + day + " of " + months[(rule.monthOfPeriod ?? 1) - 1];
}
