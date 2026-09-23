import { getDatabase } from "@/lib/cloudflare";
import { proposeDuties, saveProposals } from "./extract";
import { listCandidateDocuments, readDocumentText, type ReadableFile } from "./reader";

// Keeping track of which squadron documents have been read, and reading the ones that have not.

export interface DocumentRow {
  id: string;
  driveFileId: string;
  name: string;
  webViewLink: string | null;
  status: "PENDING" | "READ" | "FAILED" | "SKIPPED";
  reading: boolean;
  dutiesFound: number;
  error: string | null;
  readAt: string | null;
}

export async function refreshLibrary(userId: string): Promise<{ found: number; added: number }> {
  const files = await listCandidateDocuments(userId);
  const db = getDatabase();
  const now = new Date().toISOString();
  let added = 0;

  for (const file of files) {
    const existing = await db
      .prepare("SELECT id, modified_time, status FROM reg_documents WHERE drive_file_id = ?")
      .bind(file.id)
      .first<{ id: string; modified_time: string | null; status: string }>();

    if (!existing) {
      await db
        .prepare(
          "INSERT INTO reg_documents (id, drive_file_id, name, mime_type, web_view_link, modified_time, status, created_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)"
        )
        .bind(crypto.randomUUID(), file.id, file.name, file.mimeType, file.webViewLink ?? null, file.modifiedTime, now)
        .run();
      added += 1;
      continue;
    }

    // An edited regulation is worth reading again; an unchanged one is not.
    if (existing.modified_time !== file.modifiedTime) {
      await db
        .prepare("UPDATE reg_documents SET name = ?, modified_time = ?, status = 'PENDING', error = NULL WHERE id = ?")
        .bind(file.name, file.modifiedTime, existing.id)
        .run();
      added += 1;
    }
  }

  return { found: files.length, added };
}

export async function listDocuments(limit = 60): Promise<DocumentRow[]> {
  try {
    const rows = await getDatabase()
      .prepare(
        "SELECT id, drive_file_id, name, web_view_link, status, duties_found, error, read_at, reading_since " +
        "FROM reg_documents ORDER BY (status = 'PENDING') DESC, created_at DESC LIMIT ?"
      )
      .bind(limit)
      .all<{ id: string; drive_file_id: string; name: string; web_view_link: string | null; status: DocumentRow["status"]; duties_found: number; error: string | null; read_at: string | null; reading_since: string | null }>();
    return rows.results.map((row) => ({
      id: row.id,
      driveFileId: row.drive_file_id,
      name: row.name,
      webViewLink: row.web_view_link,
      status: row.status,
      // A read that started more than twenty minutes ago is not running any more; something killed it.
      reading: Boolean(row.reading_since && Date.now() - new Date(row.reading_since).getTime() < 20 * 60000),
      dutiesFound: row.duties_found,
      error: row.error,
      readAt: row.read_at
    }));
  } catch {
    return [];
  }
}

/** Reads one document and proposes what it requires. One at a time, because a small model takes its time. */
export async function readOneDocument(userId: string, documentId: string): Promise<{ name: string; duties: number; message: string }> {
  const db = getDatabase();
  const row = await db
    .prepare("SELECT id, drive_file_id, name, mime_type, modified_time FROM reg_documents WHERE id = ?")
    .bind(documentId)
    .first<{ id: string; drive_file_id: string; name: string; mime_type: string | null; modified_time: string | null }>();
  if (!row) throw new Error("That document is no longer listed.");

  const file: ReadableFile = {
    id: row.drive_file_id,
    name: row.name,
    mimeType: row.mime_type ?? "application/pdf",
    modifiedTime: row.modified_time ?? ""
  };

  await db.prepare("UPDATE reg_documents SET reading_since = ? WHERE id = ?").bind(new Date().toISOString(), row.id).run();

  try {
    const text = await readDocumentText(userId, file);
    if (text.trim().length < 400) {
      await db.prepare("UPDATE reg_documents SET status = 'SKIPPED', characters = ?, error = ?, read_at = ?, reading_since = NULL WHERE id = ?")
        .bind(text.length, "There was barely any text in it.", new Date().toISOString(), row.id).run();
      return { name: row.name, duties: 0, message: "There was barely any text in " + row.name + "." };
    }

    const proposals = await proposeDuties({ userId, documentName: row.name, text });
    const saved = await saveProposals({ proposals, documentId: row.drive_file_id, documentName: row.name, userId });

    await db
      .prepare("UPDATE reg_documents SET status = 'READ', characters = ?, duties_found = ?, error = NULL, read_at = ?, reading_since = NULL WHERE id = ?")
      .bind(text.length, saved, new Date().toISOString(), row.id)
      .run();

    return {
      name: row.name,
      duties: saved,
      message: saved
        ? "Read " + row.name + " and found " + saved + " thing" + (saved === 1 ? "" : "s") + " to check."
        : "Read " + row.name + ". Nothing in it sets a recurring duty."
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "It could not be read.";
    await db
      .prepare("UPDATE reg_documents SET status = 'FAILED', error = ?, read_at = ?, reading_since = NULL WHERE id = ?")
      .bind(message.slice(0, 300), new Date().toISOString(), row.id)
      .run();
    return { name: row.name, duties: 0, message: row.name + ": " + message };
  }
}
