import { getDatabase } from "@/lib/cloudflare";
import { WORKSPACE_ID } from "@/lib/work/structure";
import { loadDashboardItems } from "@/lib/work/dashboards";

// Goals: what the squadron is trying to achieve, as opposed to what it has to do.
//
// The difference that matters is distance. A task is done or not; a goal is somewhere between, and the
// useful question is how far there is left to go and whether the date is close. QCUA, Squadron of Merit
// and the AEX award are all of this shape, and all three were sitting in lists as tasks.

export type Horizon = "SHORT" | "LONG";
export type GoalStatus = "OPEN" | "MET" | "MISSED" | "ABANDONED";
export type TargetKind = "NUMBER" | "CHECK" | "TASKS";

export interface GoalTarget {
  id: string;
  label: string;
  kind: TargetKind;
  currentValue: number;
  targetValue: number;
  unit: string | null;
  sourceListId: string | null;
  sourceTag: string | null;
  /** 0..1. For a TASKS target this is read from the work, not stored. */
  progress: number;
  /** Said in words, because "7 of 12 done" beats a bar on its own. */
  readout: string;
}

export interface Goal {
  id: string;
  name: string;
  detail: string | null;
  horizon: Horizon;
  targetDate: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  status: GoalStatus;
  targets: GoalTarget[];
  /** The mean of its targets, 0..1. A goal with no targets sits at zero rather than pretending. */
  progress: number;
  daysLeft: number | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export async function listGoals(): Promise<Goal[]> {
  const db = getDatabase();
  try {
    const [goalRows, targetRows] = await Promise.all([
      db.prepare(
        "SELECT g.id, g.name, g.detail, g.horizon, g.target_date, g.owner_user_id, g.status, u.full_name AS owner_name " +
        "FROM goals g LEFT JOIN users u ON u.id = g.owner_user_id " +
        "WHERE g.workspace_id = ? ORDER BY g.horizon, g.target_date IS NULL, g.target_date, g.name COLLATE NOCASE"
      ).bind(WORKSPACE_ID).all<Record<string, unknown>>(),
      db.prepare("SELECT * FROM goal_targets ORDER BY display_order, rowid").all<Record<string, unknown>>()
    ]);

    // Only read the work if something actually depends on it.
    const needsWork = targetRows.results.some((row) => row.kind === "TASKS");
    const items = needsWork ? await loadDashboardItems().catch(() => []) : [];
    const today = new Date().toISOString().slice(0, 10);

    const byGoal = new Map<string, GoalTarget[]>();
    targetRows.results.forEach((row) => {
      const kind = row.kind as TargetKind;
      const target = Number(row.target_value) || 1;
      let current = Number(row.current_value) || 0;
      let readout = "";

      if (kind === "TASKS") {
        // Counted from the work itself, so the goal cannot quietly go stale.
        const scoped = items.filter((item) => {
          if (row.source_list_id && item.listId !== row.source_list_id) return false;
          if (row.source_tag && !item.tags.includes(row.source_tag as string)) return false;
          return Boolean(row.source_list_id || row.source_tag);
        });
        const done = scoped.filter((item) => item.closed).length;
        current = done;
        readout = scoped.length ? done + " of " + scoped.length + " done" : "nothing matches yet";
        byGoal.set(row.goal_id as string, [...(byGoal.get(row.goal_id as string) ?? []), {
          id: row.id as string,
          label: row.label as string,
          kind,
          currentValue: done,
          targetValue: scoped.length || 1,
          unit: (row.unit as string | null) ?? null,
          sourceListId: (row.source_list_id as string | null) ?? null,
          sourceTag: (row.source_tag as string | null) ?? null,
          progress: scoped.length ? clamp(done / scoped.length) : 0,
          readout
        }]);
        return;
      }

      if (kind === "CHECK") {
        readout = current >= 1 ? "done" : "not yet";
      } else {
        readout = current + (row.unit ? " " + row.unit : "") + " of " + target + (row.unit ? " " + row.unit : "");
      }

      byGoal.set(row.goal_id as string, [...(byGoal.get(row.goal_id as string) ?? []), {
        id: row.id as string,
        label: row.label as string,
        kind,
        currentValue: current,
        targetValue: target,
        unit: (row.unit as string | null) ?? null,
        sourceListId: null,
        sourceTag: null,
        progress: clamp(current / (target || 1)),
        readout
      }]);
    });

    return goalRows.results.map((row) => {
      const targets = byGoal.get(row.id as string) ?? [];
      const targetDate = (row.target_date as string | null) ?? null;
      return {
        id: row.id as string,
        name: row.name as string,
        detail: (row.detail as string | null) ?? null,
        horizon: row.horizon as Horizon,
        targetDate,
        ownerUserId: (row.owner_user_id as string | null) ?? null,
        ownerName: (row.owner_name as string | null) ?? null,
        status: row.status as GoalStatus,
        targets,
        progress: targets.length ? targets.reduce((sum, entry) => sum + entry.progress, 0) / targets.length : 0,
        daysLeft: targetDate
          ? Math.round((new Date(targetDate + "T12:00:00Z").getTime() - new Date(today + "T12:00:00Z").getTime()) / 86400000)
          : null
      };
    });
  } catch {
    return []; // the tables are not there yet
  }
}

export async function createGoal(input: {
  name: string;
  detail?: string | null;
  horizon: Horizon;
  targetDate?: string | null;
  ownerUserId?: string | null;
  userId: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  const now = nowIso();
  await getDatabase()
    .prepare(
      "INSERT INTO goals (id, workspace_id, name, detail, horizon, target_date, owner_user_id, status, created_by, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)"
    )
    .bind(id, WORKSPACE_ID, input.name.trim().slice(0, 160), input.detail?.trim().slice(0, 2000) || null,
      input.horizon, input.targetDate || null, input.ownerUserId || null, input.userId, now, now)
    .run();
  return id;
}

export async function updateGoal(id: string, input: {
  name?: string;
  detail?: string | null;
  horizon?: Horizon;
  targetDate?: string | null;
  ownerUserId?: string | null;
  status?: GoalStatus;
}): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown) => { sets.push(column + " = ?"); values.push(value); };
  if (input.name !== undefined) set("name", input.name.trim().slice(0, 160));
  if (input.detail !== undefined) set("detail", input.detail?.trim().slice(0, 2000) || null);
  if (input.horizon !== undefined) set("horizon", input.horizon);
  if (input.targetDate !== undefined) set("target_date", input.targetDate || null);
  if (input.ownerUserId !== undefined) set("owner_user_id", input.ownerUserId || null);
  if (input.status !== undefined) set("status", input.status);
  if (!sets.length) return;
  set("updated_at", nowIso());
  values.push(id);
  await getDatabase().prepare("UPDATE goals SET " + sets.join(", ") + " WHERE id = ?").bind(...values).run();
}

export async function deleteGoal(id: string): Promise<void> {
  await getDatabase().prepare("DELETE FROM goals WHERE id = ?").bind(id).run();
}

export async function addTarget(input: {
  goalId: string;
  label: string;
  kind: TargetKind;
  targetValue?: number;
  unit?: string | null;
  sourceListId?: string | null;
  sourceTag?: string | null;
}): Promise<string> {
  const id = crypto.randomUUID();
  const now = nowIso();
  await getDatabase()
    .prepare(
      "INSERT INTO goal_targets (id, goal_id, label, kind, current_value, target_value, unit, source_list_id, source_tag, display_order, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM goal_targets WHERE goal_id = ?), ?, ?)"
    )
    .bind(id, input.goalId, input.label.trim().slice(0, 160), input.kind, input.targetValue ?? 1,
      input.unit?.trim().slice(0, 24) || null, input.sourceListId || null, input.sourceTag || null, input.goalId, now, now)
    .run();
  return id;
}

export async function setTargetValue(targetId: string, current: number): Promise<void> {
  await getDatabase()
    .prepare("UPDATE goal_targets SET current_value = ?, updated_at = ? WHERE id = ?")
    .bind(current, nowIso(), targetId)
    .run();
}

export async function removeTarget(targetId: string): Promise<void> {
  await getDatabase().prepare("DELETE FROM goal_targets WHERE id = ?").bind(targetId).run();
}
