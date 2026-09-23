import { CAREFUL_MODEL, parseJsonReply } from "@/lib/ai/local";
import { aiChatFor } from "@/lib/ai/provider";
import { getDatabase } from "@/lib/cloudflare";
import type { Cadence } from "@/lib/work/duties";

// Reading a regulation and proposing the duties it creates.
//
// The whole design rests on one rule: a duty is only worth proposing if the document says so, in words that
// can be pointed at. So every proposal must carry a quote, and the quote is checked against the document
// text before the proposal survives. A duty the model invented has no quote, and is thrown away here rather
// than becoming an obligation somebody is chased about.
//
// Nothing is ever confirmed automatically. Proposals land as UNVERIFIED and a person decides.

const CADENCES: Cadence[] = ["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL", "EVERY_N_YEARS", "ONE_TIME"];
const CHUNK = 6000;
const MAX_CHUNKS = 8;

export interface ProposedDuty {
  role: string;
  title: string;
  detail: string | null;
  cadence: Cadence;
  dueMonth: number | null;
  dueDay: number | null;
  intervalYears: number | null;
  quote: string;
  citation: string;
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** The quote has to be in the document. This is what separates a reading from an invention. */
function quoteIsReal(quote: string, haystack: string): boolean {
  const needle = normalise(quote);
  if (needle.length < 25) return false; // too short to prove anything
  return normalise(haystack).includes(needle.slice(0, 120));
}

function chunk(text: string): string[] {
  const clean = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n");
  const chunks: string[] = [];
  for (let index = 0; index < clean.length && chunks.length < MAX_CHUNKS; index += CHUNK) {
    chunks.push(clean.slice(index, index + CHUNK));
  }
  return chunks;
}

export async function proposeDuties(input: { userId: string; documentName: string; text: string }): Promise<ProposedDuty[]> {
  const proposals: ProposedDuty[] = [];
  const seen = new Set<string>();

  for (const part of chunk(input.text)) {
    const system = [
      "You read Civil Air Patrol regulations for a squadron and list the recurring duties they create.",
      'Reply with JSON only: {"duties": [{"role": "...", "title": "...", "detail": "...", "cadence": "MONTHLY|QUARTERLY|SEMIANNUAL|ANNUAL|EVERY_N_YEARS|ONE_TIME", "dueMonth": 1-12 or null, "dueDay": 1-31 or null, "intervalYears": number or null, "quote": "..."}]}',
      "Rules, all of which matter more than finding something:",
      "- Only list a duty if THIS text states it. If the text states no recurring duty, return an empty list.",
      "- quote must be copied word for word from the text. Never paraphrase it. A duty without an exact quote is not allowed.",
      "- role is the duty position responsible, as the text names it (for example Safety Officer, Finance Officer, Commander).",
      "- title is what must be DONE, starting with a verb.",
      "- Never invent a deadline, a frequency or a form number that is not in the text. Use null when it does not say.",
      "Document: " + input.documentName
    ].join("\n");

    try {
      const raw = await aiChatFor(input.userId, [
        { role: "system", content: system },
        { role: "user", content: part }
      ], { json: true, maxTokens: 1200, model: CAREFUL_MODEL });

      const parsed = parseJsonReply<{ duties?: unknown }>(raw, {});
      if (!Array.isArray(parsed.duties)) continue;

      for (const candidate of parsed.duties as Array<Record<string, unknown>>) {
        const role = typeof candidate.role === "string" ? candidate.role.trim() : "";
        const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
        const quote = typeof candidate.quote === "string" ? candidate.quote.trim() : "";
        const cadence = CADENCES.includes(candidate.cadence as Cadence) ? (candidate.cadence as Cadence) : null;
        if (!role || title.length < 4 || !cadence) continue;
        // The check that makes the rest trustworthy.
        if (!quoteIsReal(quote, part)) continue;

        const key = normalise(role + " " + title);
        if (seen.has(key)) continue;
        seen.add(key);

        const month = Number(candidate.dueMonth);
        const day = Number(candidate.dueDay);
        const years = Number(candidate.intervalYears);
        proposals.push({
          role: role.slice(0, 120),
          title: title.slice(0, 200),
          detail: typeof candidate.detail === "string" && candidate.detail.trim() ? candidate.detail.trim().slice(0, 1000) : null,
          cadence,
          dueMonth: month >= 1 && month <= 12 ? Math.round(month) : null,
          dueDay: day >= 1 && day <= 31 ? Math.round(day) : null,
          intervalYears: years >= 1 && years <= 10 ? Math.round(years) : null,
          quote: quote.slice(0, 600),
          citation: input.documentName
        });
      }
    } catch {
      // One unreadable stretch should not lose the rest of the document.
    }
  }

  return proposals;
}

/** Saves proposals as unverified duties. Anything already proposed from the same document is left alone. */
export async function saveProposals(input: {
  proposals: ProposedDuty[];
  documentId: string;
  documentName: string;
  userId: string;
}): Promise<number> {
  if (!input.proposals.length) return 0;
  const db = getDatabase();
  const now = new Date().toISOString();

  const existing = await db
    .prepare("SELECT role, title FROM role_duties")
    .all<{ role: string; title: string }>();
  const known = new Set(existing.results.map((row) => normalise(row.role + " " + row.title)));

  let saved = 0;
  for (const proposal of input.proposals) {
    if (known.has(normalise(proposal.role + " " + proposal.title))) continue;
    await db
      .prepare(
        "INSERT INTO role_duties (id, workspace_id, role, title, detail, cadence, interval_years, due_month, due_day, anchor_date, lead_days, " +
        "source_citation, source_url, source_item_id, source_document_id, source_quote, confidence, active, created_by, created_at, updated_at) " +
        "VALUES (?, 'tn-170', ?, ?, ?, ?, ?, ?, ?, NULL, 30, ?, NULL, NULL, ?, ?, 'UNVERIFIED', 1, ?, ?, ?)"
      )
      .bind(
        crypto.randomUUID(),
        proposal.role,
        proposal.title,
        proposal.detail,
        proposal.cadence,
        proposal.intervalYears,
        proposal.dueMonth,
        proposal.dueDay,
        proposal.citation,
        input.documentId,
        proposal.quote,
        input.userId,
        now,
        now
      )
      .run();
    known.add(normalise(proposal.role + " " + proposal.title));
    saved += 1;
  }
  return saved;
}
