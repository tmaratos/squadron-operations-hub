import { audit } from "./auth";
import { buildDashboard } from "./rules";
import type { AuthUser, Env, TaskPriority, TaskRow, TaskStatus } from "./types";
import { HttpError, nowIso } from "./utils";

const TASK_SELECT = `
  SELECT
    t.*,
    fa.name AS functional_area_name,
    owner.full_name AS owner_name,
    creator.full_name AS created_by_name
  FROM tasks t
  JOIN functional_areas fa ON fa.key = t.functional_area
  LEFT JOIN users owner ON owner.id = t.owner_user_id
  LEFT JOIN users creator ON creator.id = t.created_by
`;

export async function listTasks(env: Env): Promise<TaskRow[]> {
  const result = await env.DB.prepare(`
    ${TASK_SELECT}
    WHERE t.status != 'CANCELLED'
    ORDER BY
      CASE t.status
        WHEN 'BLOCKED' THEN 0
        WHEN 'AWAITING_APPROVAL' THEN 1
        WHEN 'IN_PROGRESS' THEN 2
        WHEN 'OPEN' THEN 3
        WHEN 'COMPLETED' THEN 4
        ELSE 5
      END,
      COALESCE(t.due_on, '9999-12-31'),
      t.created_at DESC
  `).all<TaskRow>();
  return result.results;
}

export async function getTask(env: Env, id: string): Promise<TaskRow | null> {
  return env.DB.prepare(`${TASK_SELECT} WHERE t.id = ?1 LIMIT 1`).bind(id).first<TaskRow>();
}

export async function createTask(
  env: Env,
  user: AuthUser,
  input: {
    title?: string;
    description?: string;
    functionalArea?: string;
    ownerUserId?: string | null;
    dueOn?: string | null;
    priority?: TaskPriority;
    readinessWeight?: number;
    requiresApproval?: boolean;
  }
): Promise<{ task: TaskRow; dashboard: Awaited<ReturnType<typeof buildDashboard>> }> {
  const title = input.title?.trim();
  if (!title) throw new HttpError(400, "Task title is required.");

  const functionalArea = input.functionalArea || "administration";
  const area = await env.DB.prepare("SELECT key FROM functional_areas WHERE key = ?1").bind(functionalArea).first<{ key: string }>();
  if (!area) throw new HttpError(400, "Unknown functional area.");

  const priority: TaskPriority = ["LOW", "NORMAL", "HIGH", "CRITICAL"].includes(input.priority || "")
    ? input.priority!
    : "NORMAL";
  const weight = clamp(Number(input.readinessWeight || defaultWeight(priority)), 1, 10);
  const id = crypto.randomUUID();
  const current = nowIso();

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO tasks (
        id, title, description, functional_area, owner_user_id, created_by,
        due_on, status, priority, readiness_weight, requires_approval,
        created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'OPEN', ?8, ?9, ?10, ?11, ?11)
    `).bind(
      id,
      title,
      input.description?.trim() || null,
      functionalArea,
      input.ownerUserId || null,
      user.id,
      input.dueOn || null,
      priority,
      weight,
      input.requiresApproval === false ? 0 : 1,
      current
    ),
    env.DB.prepare(`
      INSERT INTO task_events (id, task_id, actor_user_id, action, note, created_at)
      VALUES (?1, ?2, ?3, 'CREATED', 'Task created.', ?4)
    `).bind(crypto.randomUUID(), id, user.id, current),
    env.DB.prepare(`
      INSERT INTO audit_log (id, actor_user_id, action, summary, entity_type, entity_id, created_at)
      VALUES (?1, ?2, 'TASK_CREATED', ?3, 'task', ?4, ?5)
    `).bind(crypto.randomUUID(), user.id, `Created task: ${title}`, id, current)
  ]);

  const task = await getTask(env, id);
  if (!task) throw new HttpError(500, "Task could not be loaded after creation.");
  return { task, dashboard: await buildDashboard(env) };
}

export async function updateTask(
  env: Env,
  user: AuthUser,
  id: string,
  input: {
    title?: string;
    description?: string | null;
    functionalArea?: string;
    ownerUserId?: string | null;
    dueOn?: string | null;
    priority?: TaskPriority;
    readinessWeight?: number;
    requiresApproval?: boolean;
  }
) {
  const existing = await getTask(env, id);
  if (!existing) throw new HttpError(404, "Task not found.");

  const fields: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown) => {
    fields.push(`${column} = ?${values.length + 1}`);
    values.push(value);
  };

  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) throw new HttpError(400, "Task title cannot be empty.");
    set("title", title);
  }
  if (input.description !== undefined) set("description", input.description?.trim() || null);
  if (input.functionalArea !== undefined) set("functional_area", input.functionalArea);
  if (input.ownerUserId !== undefined) set("owner_user_id", input.ownerUserId || null);
  if (input.dueOn !== undefined) set("due_on", input.dueOn || null);
  if (input.priority !== undefined) set("priority", input.priority);
  if (input.readinessWeight !== undefined) set("readiness_weight", clamp(Number(input.readinessWeight), 1, 10));
  if (input.requiresApproval !== undefined) set("requires_approval", input.requiresApproval ? 1 : 0);

  if (!fields.length) return { task: existing, dashboard: await buildDashboard(env) };

  set("updated_at", nowIso());
  values.push(id);

  await env.DB.prepare(`UPDATE tasks SET ${fields.join(", ")} WHERE id = ?${values.length}`).bind(...values).run();
  await audit(env, user.id, "TASK_UPDATED", `Updated task: ${existing.title}`);

  return { task: await getTask(env, id), dashboard: await buildDashboard(env) };
}

export async function taskAction(
  env: Env,
  user: AuthUser,
  id: string,
  action: string,
  note?: string
) {
  const task = await getTask(env, id);
  if (!task) throw new HttpError(404, "Task not found.");

  const current = nowIso();
  let nextStatus: TaskStatus = task.status;
  const assignments: string[] = ["status = ?1", "updated_at = ?2"];
  const values: unknown[] = [];

  switch (action) {
    case "start":
      requireStatus(task.status, ["OPEN", "BLOCKED"]);
      nextStatus = "IN_PROGRESS";
      break;
    case "block":
      requireStatus(task.status, ["OPEN", "IN_PROGRESS"]);
      nextStatus = "BLOCKED";
      break;
    case "submit":
      requireStatus(task.status, ["OPEN", "IN_PROGRESS", "BLOCKED"]);
      nextStatus = task.requires_approval ? "AWAITING_APPROVAL" : "COMPLETED";
      if (nextStatus === "AWAITING_APPROVAL") assignments.push("submitted_at = ?3");
      else assignments.push("submitted_at = ?3", "completed_at = ?4");
      break;
    case "approve":
      requireOwner(user);
      requireStatus(task.status, ["AWAITING_APPROVAL"]);
      nextStatus = "COMPLETED";
      assignments.push("approved_at = ?3", "approved_by = ?4", "completed_at = ?5");
      break;
    case "reject":
      requireOwner(user);
      requireStatus(task.status, ["AWAITING_APPROVAL"]);
      nextStatus = "IN_PROGRESS";
      assignments.push("approved_at = NULL", "approved_by = NULL", "completed_at = NULL");
      break;
    case "reopen":
      requireOwner(user);
      requireStatus(task.status, ["COMPLETED", "CANCELLED"]);
      nextStatus = "OPEN";
      assignments.push("submitted_at = NULL", "approved_at = NULL", "approved_by = NULL", "completed_at = NULL");
      break;
    case "cancel":
      requireOwner(user);
      nextStatus = "CANCELLED";
      break;
    default:
      throw new HttpError(400, "Unknown task action.");
  }

  values.push(nextStatus, current);
  if (action === "submit") {
    values.push(current);
    if (nextStatus === "COMPLETED") values.push(current);
  }
  if (action === "approve") values.push(current, user.id, current);
  values.push(id);

  const taskIdParameter = values.length;
  await env.DB.batch([
    env.DB.prepare(`UPDATE tasks SET ${assignments.join(", ")} WHERE id = ?${taskIdParameter}`).bind(...values),
    env.DB.prepare(`
      INSERT INTO task_events (id, task_id, actor_user_id, action, note, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    `).bind(crypto.randomUUID(), id, user.id, action.toUpperCase(), note?.trim() || null, current),
    env.DB.prepare(`
      INSERT INTO audit_log (id, actor_user_id, action, summary, entity_type, entity_id, created_at)
      VALUES (?1, ?2, ?3, ?4, 'task', ?5, ?6)
    `).bind(crypto.randomUUID(), user.id, `TASK_${action.toUpperCase()}`, `${action} task: ${task.title}`, id, current)
  ]);

  return { task: await getTask(env, id), dashboard: await buildDashboard(env) };
}

function requireStatus(current: TaskStatus, allowed: TaskStatus[]): void {
  if (!allowed.includes(current)) throw new HttpError(409, `Task cannot transition from ${current}.`);
}

function requireOwner(user: AuthUser): void {
  if (user.role !== "OWNER") throw new HttpError(403, "System Owner permission is required.");
}

function defaultWeight(priority: TaskPriority): number {
  return { LOW: 1, NORMAL: 2, HIGH: 4, CRITICAL: 6 }[priority];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}
