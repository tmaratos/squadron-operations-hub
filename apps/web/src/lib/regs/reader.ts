import { getUserGoogleAccessToken } from "@/lib/auth/google-oauth";
import { getCloudflareEnv } from "@/lib/cloudflare";

// Getting the words out of a squadron document, whatever form it arrives in.
//
// Google Docs and plain text come straight out. A PDF cannot be read directly, so Drive is asked to make a
// Google Doc copy of it - which is also how the scanned ones get read at all - and that copy goes to the
// trash immediately afterwards. It is a temporary file in the squadron's own Drive, and nothing else is touched.

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const GOOGLE_DOC = "application/vnd.google-apps.document";

export interface ReadableFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
}

const READABLE = new Set(["application/pdf", "text/plain", "text/markdown", "text/csv", GOOGLE_DOC]);

export function isReadable(mimeType: string): boolean {
  return READABLE.has(mimeType);
}

/** Every document anywhere in the squadron drive that could hold a requirement. */
export async function listCandidateDocuments(userId: string, limit = 200): Promise<ReadableFile[]> {
  const env = getCloudflareEnv();
  const driveId = env.GOOGLE_SHARED_DRIVE_ID;
  if (!driveId) throw new Error("The squadron Shared Drive is not configured.");
  const token = await getUserGoogleAccessToken(userId);

  const mimeQuery = [...READABLE].map((mime) => "mimeType = '" + mime + "'").join(" or ");
  const params = new URLSearchParams({
    corpora: "drive",
    driveId,
    includeItemsFromAllDrives: "true",
    supportsAllDrives: "true",
    pageSize: String(Math.min(limit, 200)),
    orderBy: "modifiedTime desc",
    q: "trashed = false and (" + mimeQuery + ")",
    fields: "files(id,name,mimeType,modifiedTime,webViewLink)"
  });

  const response = await fetch(DRIVE_API + "/files?" + params, { headers: { Authorization: "Bearer " + token } });
  if (!response.ok) throw new Error("The squadron Drive could not be listed.");
  const payload = await response.json<{ files?: ReadableFile[] }>();
  return payload.files ?? [];
}

export async function readDocumentText(userId: string, file: ReadableFile): Promise<string> {
  const token = await getUserGoogleAccessToken(userId);

  if (file.mimeType === GOOGLE_DOC) return exportAsText(token, file.id);

  if (file.mimeType.startsWith("text/")) {
    const response = await fetch(DRIVE_API + "/files/" + encodeURIComponent(file.id) + "?alt=media&supportsAllDrives=true", {
      headers: { Authorization: "Bearer " + token }
    });
    if (!response.ok) throw new Error("That file could not be read.");
    return await response.text();
  }

  if (file.mimeType === "application/pdf") return readPdfViaCopy(token, file);

  throw new Error("The Hub cannot read that kind of file yet.");
}

async function exportAsText(token: string, fileId: string): Promise<string> {
  const response = await fetch(
    DRIVE_API + "/files/" + encodeURIComponent(fileId) + "/export?mimeType=text%2Fplain",
    { headers: { Authorization: "Bearer " + token } }
  );
  if (!response.ok) throw new Error("That document could not be read.");
  return await response.text();
}

/**
 * Drive converts a PDF into a Google Doc, reading the text - including from scans. The copy exists only
 * long enough to be read, and is trashed in a finally block so a failure cannot leave litter behind.
 */
async function readPdfViaCopy(token: string, file: ReadableFile): Promise<string> {
  const copyResponse = await fetch(
    DRIVE_API + "/files/" + encodeURIComponent(file.id) + "/copy?supportsAllDrives=true&fields=id",
    {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "[Hub reading] " + file.name, mimeType: GOOGLE_DOC })
    }
  );
  if (!copyResponse.ok) throw new Error("That PDF could not be opened for reading.");
  const copy = await copyResponse.json<{ id?: string }>();
  if (!copy.id) throw new Error("That PDF could not be opened for reading.");

  try {
    return await exportAsText(token, copy.id);
  } finally {
    await fetch(DRIVE_API + "/files/" + encodeURIComponent(copy.id) + "?supportsAllDrives=true", {
      method: "PATCH",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true })
    }).catch(() => undefined);
  }
}
