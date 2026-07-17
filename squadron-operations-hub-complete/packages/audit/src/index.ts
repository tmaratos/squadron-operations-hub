import { db } from "@squadron/database";

export async function recordAuditEvent(input: {
  squadronId: string;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  return db.auditEvent.create({
    data: {
      squadronId: input.squadronId,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata
    }
  });
}
