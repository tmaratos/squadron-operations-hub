import { getCloudflareEnv } from "@/lib/cloudflare";
import { accessTokenFor, ServiceAccountProblem, storedServiceAccountKey, type ServiceAccountKey } from "./service-account";
import type { DocumentStorage, StoredDocument } from "./provider";

// Google Drive, reached as the Hub rather than as a member.
//
// Every request carries supportsAllDrives and includeItemsFromAllDrives. Without them Drive silently answers
// about the service account's own empty My Drive instead of the squadron's shared drive, which is the most
// confusing failure available here: everything succeeds and nothing is found.

const DRIVE = "https://www.googleapis.com/drive/v3";
const FIELDS = "id,name,mimeType,modifiedTime,size,webViewLink";
const FOLDER = "application/vnd.google-apps.folder";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
}

function asDocument(file: DriveFile): StoredDocument {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    modifiedAt: file.modifiedTime ?? null,
    sizeBytes: file.size ? Number(file.size) : null,
    webUrl: file.webViewLink ?? null,
    isFolder: file.mimeType === FOLDER
  };
}

export class GoogleDriveProvider implements DocumentStorage {
  readonly name = "Google Drive" as const;

  private key: ServiceAccountKey | null = null;

  private driveId(): string {
    const id = getCloudflareEnv().GOOGLE_SHARED_DRIVE_ID;
    if (!id) throw new ServiceAccountProblem("No shared drive is configured for this Hub.");
    return id;
  }

  private async credential(): Promise<ServiceAccountKey> {
    if (!this.key) this.key = await storedServiceAccountKey();
    if (!this.key) {
      throw new ServiceAccountProblem("No Google service account key has been saved yet.");
    }
    return this.key;
  }

  private async call<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const token = await accessTokenFor(await this.credential());
    const query = new URLSearchParams({
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      ...params
    });
    const response = await fetch(DRIVE + path + "?" + query.toString(), {
      headers: { Authorization: "Bearer " + token }
    });
    if (!response.ok) {
      const said = await response.text().catch(() => "");
      if (response.status === 404) throw new ServiceAccountProblem("Drive says that does not exist, or the Hub cannot see it.");
      if (response.status === 403) {
        // Almost always the one thing that still needs a person: the service account has not been added to
        // the shared drive. Said plainly, because the Google error itself does not make that obvious.
        throw new ServiceAccountProblem(
          "Drive refused the Hub. The service account has probably not been added to the shared drive yet."
        );
      }
      throw new ServiceAccountProblem("Drive answered " + response.status + ". " + said.slice(0, 160));
    }
    return response.json<T>();
  }

  async ready(): Promise<boolean> {
    return Boolean(await storedServiceAccountKey());
  }

  /**
   * Proves the Hub can actually reach the squadron's drive.
   *
   * Deliberately asks for the drive itself rather than for a file list: an empty list is ambiguous - it
   * could mean no access, or an empty folder - while the drive either answers with its name or refuses.
   */
  async check(): Promise<{ ok: boolean; message: string }> {
    try {
      const drive = await this.call<{ id: string; name: string }>("/drives/" + encodeURIComponent(this.driveId()), {
        fields: "id,name"
      });
      const top = await this.list().catch(() => []);
      return {
        ok: true,
        message: "Connected to " + drive.name + ". " + top.length + " items at the top level."
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof ServiceAccountProblem ? error.message : "Drive could not be reached."
      };
    }
  }

  async list(folderId?: string | null): Promise<StoredDocument[]> {
    const parent = folderId || this.driveId();
    const result = await this.call<{ files?: DriveFile[] }>("/files", {
      q: "'" + parent.replace(/'/g, "\\'") + "' in parents and trashed = false",
      corpora: "drive",
      driveId: this.driveId(),
      orderBy: "folder,name",
      pageSize: "200",
      fields: "files(" + FIELDS + ")"
    });
    return (result.files ?? []).map(asDocument);
  }

  async get(documentId: string): Promise<StoredDocument | null> {
    try {
      return asDocument(await this.call<DriveFile>("/files/" + encodeURIComponent(documentId), { fields: FIELDS }));
    } catch {
      return null;
    }
  }

  async read(documentId: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
    const file = await this.get(documentId);
    if (!file) return null;

    const token = await accessTokenFor(await this.credential());
    // Google's own formats have no bytes to download; they are exported to something readable instead.
    const isGoogleDoc = file.mimeType.startsWith("application/vnd.google-apps");
    const path = isGoogleDoc
      ? "/files/" + encodeURIComponent(documentId) + "/export?mimeType=text/plain"
      : "/files/" + encodeURIComponent(documentId) + "?alt=media&supportsAllDrives=true";

    const response = await fetch(DRIVE + path, { headers: { Authorization: "Bearer " + token } });
    if (!response.ok) return null;
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      mimeType: isGoogleDoc ? "text/plain" : file.mimeType
    };
  }

  async search(query: string, limit = 25): Promise<StoredDocument[]> {
    const safe = query.replace(/['\\]/g, "\\$&");
    const result = await this.call<{ files?: DriveFile[] }>("/files", {
      q: "name contains '" + safe + "' and trashed = false",
      corpora: "drive",
      driveId: this.driveId(),
      pageSize: String(Math.min(limit, 100)),
      fields: "files(" + FIELDS + ")"
    });
    return (result.files ?? []).map(asDocument);
  }
}
