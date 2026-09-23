import { getDatabase } from "@/lib/cloudflare";

// The squadron's own regulations, searchable. Read once, known from then on.
//
// Answers come from this and nothing else. A model's own recollection of CAP regulations is not a source:
// it will produce a form number or a deadline that sounds exactly right and is not. If the passage is not
// in the squadron's documents, the honest answer is that the Hub does not know.

const CHUNK = 1800;
const OVERLAP = 200;

export interface Passage {
  documentName: string;
  webViewLink: string | null;
  text: string;
}

/** Splits with a little overlap, so a requirement spanning a boundary is still findable in one piece. */
export function splitForSearch(text: string): string[] {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const chunks: string[] = [];
  for (let index = 0; index < clean.length; index += CHUNK - OVERLAP) {
    const part = clean.slice(index, index + CHUNK).trim();
    if (part.length > 200) chunks.push(part);
    if (chunks.length >= 400) break; // a very long regulation is still only worth so much
  }
  return chunks;
}

export async function rememberDocument(input: {
  driveFileId: string;
  documentName: string;
  webViewLink?: string | null;
  text: string;
}): Promise<number> {
  const db = getDatabase();
  const now = new Date().toISOString();

  // Re-reading a changed regulation replaces what was known about it, rather than piling up two versions.
  await forgetDocument(input.driveFileId);

  const parts = splitForSearch(input.text);
  const statements: Array<ReturnType<typeof db.prepare>> = [];
  parts.forEach((part, ordinal) => {
    const id = crypto.randomUUID();
    statements.push(
      db.prepare("INSERT INTO reg_chunks (id, drive_file_id, document_name, web_view_link, ordinal, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(id, input.driveFileId, input.documentName, input.webViewLink ?? null, ordinal, part, now)
    );
    statements.push(
      db.prepare("INSERT INTO reg_search (chunk_id, document_name, text) VALUES (?, ?, ?)")
        .bind(id, input.documentName, part)
    );
  });

  for (let index = 0; index < statements.length; index += 40) {
    await db.batch(statements.slice(index, index + 40));
  }
  return parts.length;
}

export async function forgetDocument(driveFileId: string): Promise<void> {
  const db = getDatabase();
  try {
    const existing = await db.prepare("SELECT id FROM reg_chunks WHERE drive_file_id = ?").bind(driveFileId).all<{ id: string }>();
    if (!existing.results.length) return;
    for (const row of existing.results) {
      await db.prepare("DELETE FROM reg_search WHERE chunk_id = ?").bind(row.id).run();
    }
    await db.prepare("DELETE FROM reg_chunks WHERE drive_file_id = ?").bind(driveFileId).run();
  } catch {
    // nothing remembered yet
  }
}

/** FTS5 takes a query language, and a member's question is not one. Each usable word becomes a term. */
function toMatchQuery(question: string): string {
  const stop = new Set(["what", "when", "does", "the", "and", "for", "with", "how", "who", "are", "has", "have", "our", "about", "need", "needs", "must", "should", "this", "that", "from", "into", "every", "each", "can", "will", "there", "their", "them", "was", "were"]);
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stop.has(word))
    .slice(0, 8);
  if (!words.length) return "";
  return words.map((word) => '"' + word + '"').join(" OR ");
}

export async function findPassages(question: string, limit = 5): Promise<Passage[]> {
  const match = toMatchQuery(question);
  if (!match) return [];
  try {
    const rows = await getDatabase()
      .prepare(
        "SELECT c.document_name, c.web_view_link, c.text " +
        "FROM reg_search s JOIN reg_chunks c ON c.id = s.chunk_id " +
        "WHERE reg_search MATCH ? ORDER BY bm25(reg_search) LIMIT ?"
      )
      .bind(match, limit)
      .all<{ document_name: string; web_view_link: string | null; text: string }>();
    return rows.results.map((row) => ({
      documentName: row.document_name,
      webViewLink: row.web_view_link,
      text: row.text
    }));
  } catch {
    return [];
  }
}

export async function knowledgeSize(): Promise<{ documents: number; passages: number }> {
  try {
    const row = await getDatabase()
      .prepare("SELECT COUNT(DISTINCT drive_file_id) AS documents, COUNT(*) AS passages FROM reg_chunks")
      .first<{ documents: number; passages: number }>();
    return { documents: row?.documents ?? 0, passages: row?.passages ?? 0 };
  } catch {
    return { documents: 0, passages: 0 };
  }
}
