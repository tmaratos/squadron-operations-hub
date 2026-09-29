// What the squadron's document store can do, described without naming Google.
//
// CAP is moving to Microsoft 365, and Google's API is currently called from a dozen places in business
// logic. If that continues, the migration is a rewrite of the whole Hub rather than one new file. So
// features ask this interface for what they need, and which service answers is decided in one place.
//
// The vocabulary here is deliberately the squadron's rather than Google's - a document has a name, a folder
// and contents. Anything that only makes sense for one provider does not belong in this shape.

export interface StoredDocument {
  id: string;
  name: string;
  /** MIME type as the provider reports it, used to decide what can be read or previewed. */
  mimeType: string;
  modifiedAt: string | null;
  sizeBytes: number | null;
  /** Where a person can open it in the provider's own interface. */
  webUrl: string | null;
  isFolder: boolean;
}

export interface DocumentStorage {
  /** Which service is behind this, for saying so on a settings page. */
  readonly name: "Google Drive" | "Microsoft 365";

  /** Whether a credential is configured and usable. */
  ready(): Promise<boolean>;

  /** Proves the credential works, and says plainly what is wrong when it does not. */
  check(): Promise<{ ok: boolean; message: string }>;

  /** The documents directly inside a folder, or the drive's root when none is given. */
  list(folderId?: string | null): Promise<StoredDocument[]>;

  /** One document's details, or null when it is gone or not visible to the Hub. */
  get(documentId: string): Promise<StoredDocument | null>;

  /** A document's contents. Used for reading regulations and squadron documents. */
  read(documentId: string): Promise<{ bytes: Uint8Array; mimeType: string } | null>;

  /** Finds documents by name. */
  search(query: string, limit?: number): Promise<StoredDocument[]>;
}

/** Nothing configured yet: every call answers honestly rather than throwing somewhere far from the cause. */
export class NoStorageConfigured implements DocumentStorage {
  readonly name = "Google Drive" as const;
  private readonly why: string;

  constructor(why = "No document storage is configured for this Hub yet.") {
    this.why = why;
  }

  async ready(): Promise<boolean> {
    return false;
  }

  async check(): Promise<{ ok: boolean; message: string }> {
    return { ok: false, message: this.why };
  }

  async list(): Promise<StoredDocument[]> {
    return [];
  }

  async get(): Promise<StoredDocument | null> {
    return null;
  }

  async read(): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
    return null;
  }

  async search(): Promise<StoredDocument[]> {
    return [];
  }
}
