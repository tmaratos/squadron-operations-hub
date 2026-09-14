import { getDatabase } from "@/lib/cloudflare";

// Workspaces and their integrations are stored in Cloudflare D1 (migration 0008).
// Until that migration is applied, reads return nothing and writes report that setup is pending.

export const DEFAULT_WORKSPACE_ID = "tn-170";

export interface WorkspaceRecord {
  id: string;
  name: string;
  shortName: string;
  slug: string;
}

export type IntegrationStatus = "NOT_CONNECTED" | "REQUESTED" | "CONNECTED" | "DISABLED";

export interface IntegrationRecord {
  provider: string;
  status: IntegrationStatus;
  notes: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
}

export class WorkspaceTablesMissingError extends Error {
  constructor() {
    super("Workspace tables are not set up in the database yet. Apply migration 0008_workspaces_integrations.sql.");
  }
}

export async function listWorkspaces(): Promise<WorkspaceRecord[]> {
  try {
    const result = await getDatabase()
      .prepare("SELECT id, name, short_name, slug FROM workspaces ORDER BY display_order ASC, name COLLATE NOCASE ASC")
      .all<{ id: string; name: string; short_name: string; slug: string }>();
    return result.results.map((row) => ({ id: row.id, name: row.name, shortName: row.short_name, slug: row.slug }));
  } catch (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
}

export async function listIntegrations(workspaceId = DEFAULT_WORKSPACE_ID): Promise<{ ready: boolean; integrations: IntegrationRecord[] }> {
  try {
    const result = await getDatabase()
      .prepare(
        "SELECT workspace_integrations.provider, workspace_integrations.status, workspace_integrations.notes, workspace_integrations.updated_at, users.full_name AS updated_by_name FROM workspace_integrations LEFT JOIN users ON users.id = workspace_integrations.updated_by WHERE workspace_integrations.workspace_id = ?"
      )
      .bind(workspaceId)
      .all<{ provider: string; status: IntegrationStatus; notes: string | null; updated_at: string | null; updated_by_name: string | null }>();
    return {
      ready: true,
      integrations: result.results.map((row) => ({
        provider: row.provider,
        status: row.status,
        notes: row.notes,
        updatedAt: row.updated_at,
        updatedByName: row.updated_by_name
      }))
    };
  } catch (error) {
    if (isMissingTable(error)) return { ready: false, integrations: [] };
    throw error;
  }
}

export async function setIntegrationStatus(input: {
  workspaceId?: string;
  provider: string;
  status: IntegrationStatus;
  notes?: string | null;
  userId: string;
}): Promise<void> {
  const now = new Date().toISOString();
  try {
    await getDatabase()
      .prepare(
        "INSERT INTO workspace_integrations (id, workspace_id, provider, status, notes, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(workspace_id, provider) DO UPDATE SET status = excluded.status, notes = excluded.notes, updated_by = excluded.updated_by, updated_at = excluded.updated_at"
      )
      .bind(crypto.randomUUID(), input.workspaceId ?? DEFAULT_WORKSPACE_ID, input.provider, input.status, input.notes?.trim() || null, input.userId, now, now)
      .run();
  } catch (error) {
    if (isMissingTable(error)) throw new WorkspaceTablesMissingError();
    throw error;
  }
}

function isMissingTable(error: unknown): boolean {
  return error instanceof Error && /no such table/i.test(error.message);
}
