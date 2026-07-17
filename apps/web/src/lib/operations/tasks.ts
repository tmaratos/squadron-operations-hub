import { getDatabase } from "@/lib/cloudflare";
import type {
  DashboardTaskSummary,
  FunctionalAreaReadiness,
  FunctionalAreaRecord,
  OperationalTask,
  TaskCreateInput,
  TaskPriority,
  TaskSourceType,
  TaskStatus,
  TaskUpdateInput
} from "./types";

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  functional_area_key: string;
  functional_area_name: string;
  owner_user_id: string | null;
  owner_name: string | null;
  due_on: string | null;
  source_type: TaskSourceType;
  source_reference: string | null;
  requires_approval: number;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
}

const taskSelect = `
  SELECT
    tasks.id,
    tasks.title,
    tasks.description,
    tasks.status,
    tasks.priority,
    tasks.functional_area_key,
    functional_areas.name AS functional_area_name,
    tasks.owner_user_id,
    owner.full_name AS owner_name,
    tasks.due_on,
    tasks.source_type,
    tasks.source_reference,
    tasks.requires_approval,
    tasks.created_by,
    creator.full_name AS created_by_name,
    tasks.created_at,
    tasks.updated_at,
    tasks.completed_at,
    tasks.cancelled_at
  FROM tasks
  JOIN functional_areas ON functional_areas.key = tasks.functional_area_key
  LEFT JOIN users owner ON owner.id = tasks.owner_user_id
  JOIN users creator ON creator.id = tasks.created_by
`;

export async function listFunctionalAreas(): Promise<FunctionalAreaRecord[]> {
  const result = await getDatabase()
    .prepare(
      `SELECT key, name, description, display_order
       FROM functional_areas
       WHERE is_active = 1
       ORDER BY display_order ASC, name COLLATE NOCASE ASC`
    )
    .all<{ key: string; name: string; description: string | null; display_order: number }>();

  return result.results.map((row) => ({
    key: row.key,
    name: row.name,
    description: row.description,
    displayOrder: row.display_order
  }));
}

export async function listTasks(input?: {
  includeCompleted?: boolean;
  limit?: number;
}): Promise<OperationalTask[]> {
  const includeCompleted = input?.includeCompleted ?? true;
  const limit = Math.min(Math.max(input?.limit ?? 500, 1), 1000);
  const where = includeCompleted ? "" : "WHERE tasks.status NOT IN ('COMPLETED', 'CANCELLED')";
  const result = await getDatabase()
    .prepare(
      `${taskSelect}
       ${where}
       ORDER BY
         CASE tasks.status
           WHEN 'BLOCKED' THEN 0
           WHEN 'AWAITING_APPROVAL' THEN 1
           WHEN 'IN_PROGRESS' THEN 2
           WHEN 'OPEN' THEN 3
           WHEN 'COMPLETED' THEN 4
           ELSE 5
         END,
         CASE tasks.priority
           WHEN 'CRITICAL' THEN 0
           WHEN 'HIGH' THEN 1
           WHEN 'NORMAL' THEN 2
           ELSE 3
         END,
         CASE WHEN tasks.due_on IS NULL THEN 1 ELSE 0 END,
         tasks.due_on ASC,
         tasks.updated_at DESC
       LIMIT ?`
    )
    .bind(limit)
    .all<TaskRow>();

  return result.results.map(mapTask);
}

export async function findTaskById(id: string): Promise<OperationalTask | null> {
  const row = await getDatabase()
    .prepare(`${taskSelect} WHERE tasks.id = ? LIMIT 1`)
    .bind(id)
    .first<TaskRow>();
  return row ? mapTask(row) : null;
}

export async function createTask(input: TaskCreateInput & { createdBy: string }): Promise<OperationalTask> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await getDatabase()
    .prepare(
      `INSERT INTO tasks (
        id, title, description, status, priority, functional_area_key,
        owner_user_id, due_on, source_type, source_reference, requires_approval,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      input.title.trim(),
      input.description?.trim() || null,
      input.priority ?? "NORMAL",
      input.functionalAreaKey,
      input.ownerUserId || null,
      normalizeDate(input.dueOn),
      input.sourceType ?? "MANUAL",
      input.sourceReference?.trim() || null,
      input.requiresApproval ? 1 : 0,
      input.createdBy,
      now,
      now
    )
    .run();

  const task = await findTaskById(id);
  if (!task) throw new Error("The task was created but could not be loaded.");
  return task;
}

export async function updateTask(id: string, input: TaskUpdateInput): Promise<OperationalTask> {
  const current = await findTaskById(id);
  if (!current) throw new Error("Task not found.");

  const status = input.status ?? current.status;
  const now = new Date().toISOString();
  const completedAt = status === "COMPLETED" ? current.completedAt ?? now : null;
  const cancelledAt = status === "CANCELLED" ? current.cancelledAt ?? now : null;

  await getDatabase()
    .prepare(
      `UPDATE tasks SET
        title = ?,
        description = ?,
        status = ?,
        priority = ?,
        functional_area_key = ?,
        owner_user_id = ?,
        due_on = ?,
        requires_approval = ?,
        updated_at = ?,
        completed_at = ?,
        cancelled_at = ?
      WHERE id = ?`
    )
    .bind(
      input.title?.trim() || current.title,
      input.description === undefined ? current.description : input.description?.trim() || null,
      status,
      input.priority ?? current.priority,
      input.functionalAreaKey ?? current.functionalAreaKey,
      input.ownerUserId === undefined ? current.ownerUserId : input.ownerUserId || null,
      input.dueOn === undefined ? current.dueOn : normalizeDate(input.dueOn),
      input.requiresApproval === undefined ? (current.requiresApproval ? 1 : 0) : input.requiresApproval ? 1 : 0,
      now,
      completedAt,
      cancelledAt,
      id
    )
    .run();

  const task = await findTaskById(id);
  if (!task) throw new Error("The task was updated but could not be loaded.");
  return task;
}

export async function deleteTask(id: string): Promise<void> {
  await getDatabase().prepare("DELETE FROM tasks WHERE id = ?").bind(id).run();
}

export async function getTaskSummary(): Promise<DashboardTaskSummary> {
  const row = await getDatabase()
    .prepare(
      `SELECT
        SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) AS open_count,
        SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) AS in_progress_count,
        SUM(CASE WHEN status = 'BLOCKED' THEN 1 ELSE 0 END) AS blocked_count,
        SUM(CASE WHEN status = 'AWAITING_APPROVAL' THEN 1 ELSE 0 END) AS awaiting_approval_count,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_count,
        SUM(CASE WHEN status NOT IN ('COMPLETED', 'CANCELLED') AND due_on < date('now') THEN 1 ELSE 0 END) AS overdue_count,
        SUM(CASE WHEN status NOT IN ('COMPLETED', 'CANCELLED') AND due_on BETWEEN date('now') AND date('now', '+7 days') THEN 1 ELSE 0 END) AS due_this_week_count
      FROM tasks`
    )
    .first<{
      open_count: number | null;
      in_progress_count: number | null;
      blocked_count: number | null;
      awaiting_approval_count: number | null;
      completed_count: number | null;
      overdue_count: number | null;
      due_this_week_count: number | null;
    }>();

  return {
    open: Number(row?.open_count ?? 0),
    inProgress: Number(row?.in_progress_count ?? 0),
    blocked: Number(row?.blocked_count ?? 0),
    awaitingApproval: Number(row?.awaiting_approval_count ?? 0),
    completed: Number(row?.completed_count ?? 0),
    overdue: Number(row?.overdue_count ?? 0),
    dueThisWeek: Number(row?.due_this_week_count ?? 0)
  };
}

export async function listFunctionalAreaReadiness(): Promise<FunctionalAreaReadiness[]> {
  const result = await getDatabase()
    .prepare(
      `SELECT
        functional_areas.key,
        functional_areas.name,
        SUM(CASE WHEN tasks.status NOT IN ('COMPLETED', 'CANCELLED') THEN 1 ELSE 0 END) AS open_tasks,
        SUM(CASE WHEN tasks.status NOT IN ('COMPLETED', 'CANCELLED') AND tasks.due_on < date('now') THEN 1 ELSE 0 END) AS overdue_tasks,
        SUM(CASE WHEN tasks.status = 'BLOCKED' THEN 1 ELSE 0 END) AS blocked_tasks
      FROM functional_areas
      LEFT JOIN tasks ON tasks.functional_area_key = functional_areas.key
      WHERE functional_areas.is_active = 1
      GROUP BY functional_areas.key, functional_areas.name, functional_areas.display_order
      ORDER BY functional_areas.display_order ASC`
    )
    .all<{
      key: string;
      name: string;
      open_tasks: number | null;
      overdue_tasks: number | null;
      blocked_tasks: number | null;
    }>();

  return result.results.map((row) => {
    const openTasks = Number(row.open_tasks ?? 0);
    const overdueTasks = Number(row.overdue_tasks ?? 0);
    const blockedTasks = Number(row.blocked_tasks ?? 0);
    const score = Math.max(35, Math.min(100, 100 - overdueTasks * 12 - blockedTasks * 10 - Math.max(0, openTasks - 6) * 2));
    return {
      key: row.key,
      name: row.name,
      score,
      status: blockedTasks > 0 || overdueTasks > 1 ? "At Risk" : overdueTasks === 1 ? "Attention" : "On Track",
      openTasks,
      overdueTasks,
      blockedTasks
    };
  });
}

function normalizeDate(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error("Due date must use YYYY-MM-DD format.");
  return normalized;
}

function mapTask(row: TaskRow): OperationalTask {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    functionalAreaKey: row.functional_area_key,
    functionalAreaName: row.functional_area_name,
    ownerUserId: row.owner_user_id,
    ownerName: row.owner_name,
    dueOn: row.due_on,
    sourceType: row.source_type,
    sourceReference: row.source_reference,
    requiresApproval: Boolean(row.requires_approval),
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at
  };
}
