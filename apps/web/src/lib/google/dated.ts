// Did the email actually say this date, or did the assistant decide it?
//
// The distinction did not matter while a dated suggestion only ever sat on the home page waiting to be
// pressed: a person reads it, sees a date that is not in the mail, and dismisses it. It matters now, because
// a date is what lets the Hub create a task and set its reminders unasked. An invented date would arrive
// looking exactly like a real deadline.
//
// So this looks for the date in the message text. It is deliberately strict: anything it cannot find in
// plain words is treated as unverified, which costs the member one press. Being lenient here would cost
// them a task they never agreed to, on a deadline nobody set.

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"
];

/**
 * True when `iso` (YYYY-MM-DD) appears in `text` in a form a person would recognise as that date.
 *
 * Understands the ISO date itself, 10/15 and 10/15/2026 and 15/10/2026, and the written forms - October 15,
 * Oct 15th, 15 October - with or without the year. It does not try to understand "next Thursday" or "by the
 * end of the month": those are real deadlines, but a reader has to confirm them, and this function exists
 * precisely to decide what may go ahead without a reader.
 */
export function dateIsInTheText(iso: string, text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !text) return false;
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return false;

  const said = text.toLowerCase();
  if (said.includes(iso)) return true;

  const monthName = MONTHS[month - 1];
  const shortMonth = monthName.slice(0, 3);
  const dayNumber = String(day);
  const paddedDay = String(day).padStart(2, "0");
  const monthNumber = String(month);
  const paddedMonth = String(month).padStart(2, "0");
  const shortYear = String(year).slice(2);

  // Numeric, both orders, padded or not, with a two or four digit year or none at all. Bounded on each side
  // so 10/15 is not found inside 110/152.
  for (const first of [monthNumber, paddedMonth]) {
    for (const second of [dayNumber, paddedDay]) {
      for (const separator of ["/", "-", "."]) {
        const stem = first + separator + second;
        const swapped = second + separator + first;
        for (const candidate of [stem, swapped]) {
          for (const tail of ["", separator + String(year), separator + shortYear]) {
            if (bounded(said, candidate + tail)) return true;
          }
        }
      }
    }
  }

  // Written out. The day may carry an ordinal suffix and the month may be abbreviated with or without a dot.
  const ordinal = dayNumber + "(?:st|nd|rd|th)?";
  const month_ = "(?:" + monthName + "|" + shortMonth + "\\.?)";
  const year_ = "(?:[,\\s]+(?:" + year + "|'?" + shortYear + "))?";
  const written = new RegExp(
    "(?:\\b" + month_ + "\\s+" + ordinal + year_ + "\\b)" +
    "|(?:\\b" + ordinal + "\\s+(?:of\\s+)?" + month_ + year_ + "\\b)",
    "i"
  );
  return written.test(said);
}

/** Bounded so a short numeric date is not found inside a longer number, an order code or a version. */
function bounded(said: string, needle: string): boolean {
  let from = 0;
  for (;;) {
    const at = said.indexOf(needle, from);
    if (at < 0) return false;
    const before = at === 0 ? "" : said[at - 1];
    const after = said[at + needle.length] ?? "";
    // A digit or a separator on either side means this is part of something larger, not the date itself.
    if (!/[\d/.\-]/.test(before) && !/[\d/.\-]/.test(after)) return true;
    from = at + 1;
  }
}
