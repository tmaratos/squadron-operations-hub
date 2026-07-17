import { getCloudflareEnv } from "@/lib/cloudflare";
import { getGoogleAccessToken, isGoogleDriveConfigured } from "./google-auth";
import type { DriveFile, DriveFileList } from "./types";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export { isGoogleDriveConfigured };

export async function listDriveFiles(input?: {
  parentId?: string;
  search?: string;
  pageToken?: string;
}): Promise<DriveFileList> {
  const env = getCloudflareEnv();
  if (!env.GOOGLE_SHARED_DRIVE_ID) throw new Error("Google Shared Drive ID is not configured.");
  const parentId = input?.parentId || env.GOOGLE_ROOT_FOLDER_ID || env.GOOGLE_SHARED_DRIVE_ID;
  const token = await getGoogleAccessToken();
  const queryParts = [`'${escapeDriveQuery(parentId)}' in parents`, "trashed = false"];
  if (input?.search?.trim()) {
    queryParts.push(`name contains '${escapeDriveQuery(input.search.trim())}'`);
  }

  const params = new URLSearchParams({
    corpora: "drive",
    driveId: env.GOOGLE_SHARED_DRIVE_ID,
    includeItemsFromAllDrives: "true",
    supportsAllDrives: "true",
    pageSize: "200",
    orderBy: "folder,name_natural",
    q: queryParts.join(" and "),
    fields: "nextPageToken,files(id,name,mimeType,modifiedTime,createdTime,webViewLink,webContentLink,size,parents,iconLink)"
  });
  if (input?.pageToken) params.set("pageToken", input.pageToken);

  return googleJson<DriveFileList>(`${DRIVE_API}/files?${params}`, token);
}

export async function createDriveFolder(name: string, parentId?: string): Promise<DriveFile> {
  const env = getCloudflareEnv();
  const token = await getGoogleAccessToken();
  const parent = parentId || env.GOOGLE_ROOT_FOLDER_ID || env.GOOGLE_SHARED_DRIVE_ID;
  if (!parent) throw new Error("Google Drive root folder is not configured.");

  return googleJson<DriveFile>(`${DRIVE_API}/files?supportsAllDrives=true&fields=id,name,mimeType,modifiedTime,parents,webViewLink`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parent] })
  });
}

export async function uploadDriveFile(input: {
  name: string;
  mimeType: string;
  bytes: ArrayBuffer;
  parentId?: string;
}): Promise<DriveFile> {
  const env = getCloudflareEnv();
  const token = await getGoogleAccessToken();
  const parent = input.parentId || env.GOOGLE_ROOT_FOLDER_ID || env.GOOGLE_SHARED_DRIVE_ID;
  if (!parent) throw new Error("Google Drive root folder is not configured.");

  const boundary = `squadron_ops_${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name: input.name, parents: [parent] });
  const prefix = new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${input.mimeType || "application/octet-stream"}\r\n\r\n`
  );
  const suffix = new TextEncoder().encode(`\r\n--${boundary}--`);
  const fileBytes = new Uint8Array(input.bytes);
  const combined = new Uint8Array(prefix.length + fileBytes.length + suffix.length);
  combined.set(prefix, 0);
  combined.set(fileBytes, prefix.length);
  combined.set(suffix, prefix.length + fileBytes.length);

  return googleJson<DriveFile>(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,modifiedTime,size,parents,webViewLink,webContentLink`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body: combined
    }
  );
}

export async function updateDriveFile(input: {
  fileId: string;
  name?: string;
  addParentId?: string;
  removeParentId?: string;
}): Promise<DriveFile> {
  const token = await getGoogleAccessToken();
  const params = new URLSearchParams({
    supportsAllDrives: "true",
    fields: "id,name,mimeType,modifiedTime,size,parents,webViewLink,webContentLink"
  });
  if (input.addParentId) params.set("addParents", input.addParentId);
  if (input.removeParentId) params.set("removeParents", input.removeParentId);

  return googleJson<DriveFile>(`${DRIVE_API}/files/${encodeURIComponent(input.fileId)}?${params}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.name ? { name: input.name } : {})
  });
}

export async function trashDriveFile(fileId: string): Promise<void> {
  const token = await getGoogleAccessToken();
  await googleJson(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true })
  });
}

export async function downloadDriveFile(fileId: string): Promise<Response> {
  const token = await getGoogleAccessToken();
  const metadata = await googleJson<DriveFile>(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,name,mimeType`,
    token
  );

  if (metadata.mimeType.startsWith("application/vnd.google-apps.")) {
    const exportMime = exportMimeType(metadata.mimeType);
    if (!exportMime) throw new Error("This Google file type cannot be exported by the app.");
    const response = await fetch(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportMime)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return withDownloadHeaders(response, exportFileName(metadata.name, exportMime));
  }

  const response = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return withDownloadHeaders(response, metadata.name);
}

function exportMimeType(mimeType: string): string | null {
  const map: Record<string, string> = {
    "application/vnd.google-apps.document": "application/pdf",
    "application/vnd.google-apps.spreadsheet": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.google-apps.presentation": "application/pdf",
    "application/vnd.google-apps.drawing": "application/pdf"
  };
  return map[mimeType] ?? null;
}

function exportFileName(name: string, mimeType: string): string {
  if (mimeType === "application/pdf") return `${name}.pdf`;
  if (mimeType.includes("spreadsheetml")) return `${name}.xlsx`;
  return name;
}

async function googleJson<T = unknown>(url: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {})
    }
  });
  if (!response.ok) {
    throw new Error(`Google Drive request failed: ${response.status} ${await response.text()}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function withDownloadHeaders(response: Response, fileName: string): Response {
  if (!response.ok) return response;
  const headers = new Headers(response.headers);
  headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  return new Response(response.body, { status: response.status, headers });
}

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
