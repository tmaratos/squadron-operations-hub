import { getDatabase } from "@/lib/cloudflare";
import { openSuggestions } from "@/lib/google/mail-inbox";
import { loadDashboardItems } from "@/lib/work/dashboards";

// The Hub noticing things and offering to do them, instead of waiting to be asked.
//
// Every offer is something the Hub worked out from what is already there - a monthly series with next
// month missing, work nobody owns - so it can say exactly why it is offering. Nothing happens until a
// person presses yes, and "not now" is remembered so the same offer does not nag.

export type OfferKind = "next_in_series" | "needs_owner" | "from_email";

export interface Offer {
  id: string;
  kind: OfferKind;
  title: string;
  because: string;
  listId: string;
  listName: string;
  /** For next_in_series: the task to create. */
  create?: { title: string; dueOn: string | null };
  /** For needs_owner: the items with nobody on them. */
  itemIds?: string[];
  /** For from_email: the suggestion row to settle once it has been dealt with. */
  suggestionId?: string;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function monthIndex(token: string): number {
  return MONTHS.indexOf(token.toUpperCase());
}

/** "SEP 2026 - Senior Member Meeting agenda (Mon 14 Sep)" -> series "senior member meeting agenda", Sep 2026. */
function readSeriesEntry(title: string): { key: string; year: number; month: number; label: string } | null {
  const match = title.match(/^([A-Za-z]{3})\s+(\d{4})\s*[-–—]\s*(.+)$/);
  if (!match) return null;
  const month = monthIndex(match[1]);
  if (month < 0) return null;
  const rest = match[3].replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (rest.length < 4) return null;
  return { key: rest.toLowerCase(), year: Number(match[2]), month, label: rest };
}

export async function listOffers(userId: string): Promise<Offer[]> {
  const [items, dismissed, fromMail] = await Promise.all([
    loadDashboardItems(),
    dismissedOffers(userId),
    openSuggestions(userId, 4)
  ]);
  const offers: Offer[] = [];

  // Anything the member's labelled email seems to be asking for, found in the background before they asked.
  const intake = items.find((item) => item.listName.toLowerCase().includes("intake"));
  fromMail.forEach((suggestion) => {
    offers.push({
      id: "mail:" + suggestion.id,
      kind: "from_email",
      title: suggestion.title,
      because: "From your email" + (suggestion.from ? ", " + suggestion.from.replace(/<[^>]*>/, "").trim() : "") +
        (suggestion.because ? ": “" + suggestion.because + "”" : "."),
      listId: intake?.listId ?? "",
      listName: intake?.listName ?? "Command Intake",
      create: { title: suggestion.title, dueOn: suggestion.dueOn },
      suggestionId: suggestion.id
    });
  });

  // 1. A monthly series with the next one missing.
  const series = new Map<string, { label: string; listId: string; listName: string; entries: Array<{ year: number; month: number }> }>();
  items.forEach((item) => {
    const entry = readSeriesEntry(item.title);
    if (!entry) return;
    const key = item.listId + "::" + entry.key;
    const held = series.get(key) ?? { label: entry.label, listId: item.listId, listName: item.listName, entries: [] };
    held.entries.push({ year: entry.year, month: entry.month });
    series.set(key, held);
  });

  const now = new Date();
  const thisMonth = now.getUTCFullYear() * 12 + now.getUTCMonth();

  series.forEach((entry, key) => {
    // Two is a coincidence; three is a habit worth keeping up.
    if (entry.entries.length < 3) return;
    const latest = entry.entries.reduce((high, candidate) => Math.max(high, candidate.year * 12 + candidate.month), 0);
    if (latest < thisMonth) return; // a series that stopped months ago is not one to resume uninvited
    const next = latest + 1;
    const year = Math.floor(next / 12);
    const month = next % 12;
    const title = MONTHS[month] + " " + year + " - " + entry.label;
    const id = "series:" + key + ":" + title.toLowerCase();
    if (dismissed.includes(id)) return;
    if (items.some((item) => item.listId === entry.listId && item.title.toLowerCase().startsWith((MONTHS[month] + " " + year).toLowerCase()))) return;

    offers.push({
      id,
      kind: "next_in_series",
      title: "Create " + title,
      because: entry.listName + " has had one of these every month. " + MONTHS[month] + " " + year + " is missing.",
      listId: entry.listId,
      listName: entry.listName,
      create: { title, dueOn: null }
    });
  });

  // 2. Open, dated work that nobody owns. A deadline with no owner is the thing that actually gets missed.
  const orphans = items.filter((item) => !item.closed && item.dueOn && !item.assignees.length);
  const byList = new Map<string, typeof orphans>();
  orphans.forEach((item) => byList.set(item.listId, [...(byList.get(item.listId) ?? []), item]));
  byList.forEach((list, listId) => {
    const id = "owner:" + listId + ":" + list.length;
    if (dismissed.includes(id)) return;
    offers.push({
      id,
      kind: "needs_owner",
      title: list.length === 1 ? "Give “" + list[0].title + "” an owner" : "Give " + list.length + " dated tasks an owner",
      because: list[0].listName + " has work with a deadline and nobody on it.",
      listId,
      listName: list[0].listName,
      itemIds: list.slice(0, 20).map((item) => item.id)
    });
  });

  return offers.slice(0, 4);
}

export async function dismissedOffers(userId: string): Promise<string[]> {
  try {
    const row = await getDatabase()
      .prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'dismissed_offers'")
      .bind(userId)
      .first<{ value: string }>();
    const parsed = row?.value ? (JSON.parse(row.value) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

export async function dismissOffer(userId: string, offerId: string): Promise<void> {
  const current = await dismissedOffers(userId);
  if (current.includes(offerId)) return;
  const next = [...current, offerId].slice(-100);
  await getDatabase()
    .prepare(
      "INSERT INTO user_settings (user_id, key, value, updated_at) VALUES (?, 'dismissed_offers', ?, ?) " +
      "ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
    .bind(userId, JSON.stringify(next), new Date().toISOString())
    .run();
}
