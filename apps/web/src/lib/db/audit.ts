import { getDatabase } from "@/lib/cloudflare";

export async function recordAuditEvent(input: {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const now = new Date().toISOString();
  await getDatabase()
    .prepare(
      `INSERT INTO audit_events (
        id, actor_user_id, action, entity_type, entity_id, summary, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      input.actorUserId ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.summary,
      input.metadata ? JSON.stringify(input.metadata) : null,
      now
    )
    .run();
}

export interface AuditEventRecord {
  id: string;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export async function listAuditEvents(limit = 200): Promise<AuditEventRecord[]> {
  const result = await getDatabase()
    .prepare(
      `SELECT
        audit_events.id,
        users.full_name AS actor_name,
        audit_events.action,
        audit_events.entity_type,
        audit_events.entity_id,
        audit_events.summary,
        audit_events.metadata_json,
        audit_events.created_at
      FROM audit_events
      LEFT JOIN users ON users.id = audit_events.actor_user_id
      ORDER BY audit_events.created_at DESC
      LIMIT ?`
    )
    .bind(Math.min(Math.max(limit, 1), 500))
    .all<{
      id: string;
      actor_name: string | null;
      action: string;
      entity_type: string;
      entity_id: string | null;
      summary: string;
      metadata_json: string | null;
      created_at: string;
    }>();

  return result.results.map((row) => ({
    id: row.id,
    actorName: row.actor_name,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: row.summary,
    metadata: row.metadata_json ? safeParse(row.metadata_json) : null,
    createdAt: row.created_at
  }));
}

function safeParse(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}
