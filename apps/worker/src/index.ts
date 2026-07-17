export default {
  async fetch(): Promise<Response> {
    return Response.json({
      service: "Squadron Operations Hub automation",
      status: "ok",
      schedule: "Daily authentication cleanup and recurring compliance processing"
    });
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runDailyMaintenance(env.DB));
  }
} satisfies ExportedHandler<Env>;

interface ComplianceRow {
  id: string;
  name: string;
  description: string | null;
  functional_area_key: string;
  responsible_user_id: string | null;
  recurrence_rule: string | null;
  next_due_on: string;
  created_by: string;
}

async function runDailyMaintenance(db: D1Database): Promise<void> {
  const now = new Date().toISOString();
  const tokenCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const sessionCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  await db.batch([
    db.prepare("DELETE FROM login_tokens WHERE expires_at < ? OR (used_at IS NOT NULL AND used_at < ?)").bind(now, tokenCutoff),
    db.prepare("DELETE FROM sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)").bind(now, sessionCutoff)
  ]);

  const generatedTasks = await generateRecurringComplianceTasks(db, now.slice(0, 10));

  await db
    .prepare(
      `INSERT INTO audit_events (
        id, action, entity_type, summary, metadata_json, created_at
      ) VALUES (?, 'AUTOMATION_MAINTENANCE_COMPLETED', 'system', ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      "Daily automation maintenance completed",
      JSON.stringify({ completedAt: now, recurringTasksGenerated: generatedTasks }),
      now
    )
    .run();
}

async function generateRecurringComplianceTasks(db: D1Database, today: string): Promise<number> {
  const result = await db
    .prepare(
      `SELECT id, name, description, functional_area_key, responsible_user_id,
              recurrence_rule, next_due_on, created_by
       FROM compliance_requirements
       WHERE status = 'ACTIVE' AND next_due_on IS NOT NULL AND next_due_on <= ?
       ORDER BY next_due_on ASC
       LIMIT 100`
    )
    .bind(today)
    .all<ComplianceRow>();

  let generated = 0;
  for (const requirement of result.results) {
    const existing = await db
      .prepare(
        `SELECT id FROM tasks
         WHERE source_type = 'COMPLIANCE'
           AND source_reference = ?
           AND due_on = ?
           AND status <> 'CANCELLED'
         LIMIT 1`
      )
      .bind(requirement.id, requirement.next_due_on)
      .first<{ id: string }>();

    if (!existing) {
      const now = new Date().toISOString();
      const creatorId = await resolveAutomationActor(db, requirement);
      if (creatorId) {
        const taskId = crypto.randomUUID();
        await db
          .prepare(
            `INSERT INTO tasks (
              id, title, description, status, priority, functional_area_key,
              owner_user_id, due_on, source_type, source_reference,
              requires_approval, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, 'OPEN', 'NORMAL', ?, ?, ?, 'COMPLIANCE', ?, 1, ?, ?, ?)`
          )
          .bind(
            taskId,
            requirement.name,
            requirement.description,
            requirement.functional_area_key,
            requirement.responsible_user_id,
            requirement.next_due_on,
            requirement.id,
            creatorId,
            now,
            now
          )
          .run();

        await db
          .prepare(
            `INSERT INTO audit_events (
              id, action, entity_type, entity_id, summary, metadata_json, created_at
            ) VALUES (?, 'RECURRING_TASK_GENERATED', 'task', ?, ?, ?, ?)`
          )
          .bind(
            crypto.randomUUID(),
            taskId,
            `Generated recurring task: ${requirement.name}`,
            JSON.stringify({ requirementId: requirement.id, dueOn: requirement.next_due_on }),
            now
          )
          .run();
        generated += 1;
      }
    }

    const nextDueOn = advanceDueDate(requirement.next_due_on, requirement.recurrence_rule);
    if (nextDueOn) {
      await db
        .prepare("UPDATE compliance_requirements SET next_due_on = ?, updated_at = ? WHERE id = ?")
        .bind(nextDueOn, new Date().toISOString(), requirement.id)
        .run();
    } else {
      await db
        .prepare("UPDATE compliance_requirements SET status = 'PAUSED', updated_at = ? WHERE id = ?")
        .bind(new Date().toISOString(), requirement.id)
        .run();
    }
  }

  return generated;
}

async function resolveAutomationActor(db: D1Database, requirement: ComplianceRow): Promise<string | null> {
  if (requirement.created_by) return requirement.created_by;
  if (requirement.responsible_user_id) return requirement.responsible_user_id;
  const owner = await db
    .prepare(
      `SELECT id FROM users
       WHERE status = 'APPROVED' AND global_role = 'SYSTEM_OWNER'
       ORDER BY approved_at ASC
       LIMIT 1`
    )
    .first<{ id: string }>();
  return owner?.id ?? null;
}

function advanceDueDate(current: string, recurrenceRule: string | null): string | null {
  if (!recurrenceRule) return null;
  const date = new Date(`${current}T00:00:00Z`);
  const rule = recurrenceRule.trim().toUpperCase();

  if (rule === "FREQ=DAILY") date.setUTCDate(date.getUTCDate() + 1);
  else if (rule === "FREQ=WEEKLY") date.setUTCDate(date.getUTCDate() + 7);
  else if (rule === "FREQ=MONTHLY") date.setUTCMonth(date.getUTCMonth() + 1);
  else if (rule === "FREQ=QUARTERLY") date.setUTCMonth(date.getUTCMonth() + 3);
  else if (rule === "FREQ=ANNUALLY" || rule === "FREQ=YEARLY") date.setUTCFullYear(date.getUTCFullYear() + 1);
  else return null;

  return date.toISOString().slice(0, 10);
}
