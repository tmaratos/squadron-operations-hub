import { getDatabase } from "@/lib/cloudflare";
import { describeRecurrence, nextDue, type Frequency, type RecurrenceRule } from "./recurrence";

// Routines: work the squadron does on a schedule, which the Hub creates so nobody has to remember to.

export interface Routine extends RecurrenceRule {
  id: string;
  listId: string;
  listName?: string;
  title: string;
  description: string | null;
  priority: string | null;
  leadDays: number;
  assigneeUserId: string | null;
  tags: string[];
  nextDue: string;
  active: boolean;
  summary: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function createRoutine(input: {
  listId: string;
  title: string;
  description?: string | null;
  priority?: string | null;
  frequency: Frequency;
  dayOfMonth?: number | null;
  weekday?: number | null;
  weekOfMonth?: number | null;
  monthOfPeriod?: number | null;
  leadDays?: number;
  assigneeUserId?: string | null;
  tags?: string[];
  userId: string;
}): Promise<{ id: string; nextDue: string }> {
  const rule: RecurrenceRule = {
    frequency: input.frequency,
    dayOfMonth: input.dayOfMonth ?? null,
    weekday: input.weekday ?? null,
    weekOfMonth: input.weekOfMonth ?? null,
    monthOfPeriod: input.monthOfPeriod ?? null
  };
  const due = nextDue(rule, today());
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await getDatabase()
    .prepare(
      "INSERT INTO recurring_tasks (id, list_id, title, description, priority, frequency, day_of_month, weekday, week_of_month, month_of_period, lead_days, assignee_user_id, tags, next_due, active, created_by, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)"
    )
    .bind(
      id,
      input.listId,
      input.title.trim().slice(0, 300),
      input.description?.trim() || null,
      input.priority ?? null,
      input.frequency,
      rule.dayOfMonth,
      rule.weekday,
      rule.weekOfMonth,
      rule.monthOfPeriod,
      Math.min(60, Math.max(0, input.leadDays ?? 7)),
      input.assigneeUserId ?? null,
      input.tags?.length ? JSON.stringify(input.tags) : null,
      due,
      input.userId,
      now,
      now
    )
    .run();

  return { id, nextDue: due };
}

export async function listRoutines(listId?: string): Promise<Routine[]> {
  try {
    const rows = await getDatabase()
      .prepare(
        "SELECT r.*, l.name AS list_name FROM recurring_tasks r JOIN lists l ON l.id = r.list_id " +
        (listId ? "WHERE r.list_id = ? " : "WHERE 1 = 1 ") +
        "ORDER BY r.active DESC, r.next_due"
      )
      .bind(...(listId ? [listId] : []))
      .all<Record<string, unknown>>();

    return rows.results.map((row) => {
      const rule: RecurrenceRule = {
        frequency: row.frequency as Frequency,
        dayOfMonth: (row.day_of_month as number | null) ?? null,
        weekday: (row.weekday as number | null) ?? null,
        weekOfMonth: (row.week_of_month as number | null) ?? null,
        monthOfPeriod: (row.month_of_period as number | null) ?? null
      };
      return {
        ...rule,
        id: row.id as string,
        listId: row.list_id as string,
        listName: row.list_name as string,
        title: row.title as string,
        description: (row.description as string | null) ?? null,
        priority: (row.priority as string | null) ?? null,
        leadDays: row.lead_days as number,
        assigneeUserId: (row.assignee_user_id as string | null) ?? null,
        tags: row.tags ? (JSON.parse(row.tags as string) as string[]) : [],
        nextDue: row.next_due as string,
        active: Boolean(row.active),
        summary: describeRecurrence(rule)
      };
    });
  } catch {
    return [];
  }
}

export async function setRoutineActive(id: string, active: boolean): Promise<void> {
  await getDatabase()
    .prepare("UPDATE recurring_tasks SET active = ?, updated_at = ? WHERE id = ?")
    .bind(active ? 1 : 0, new Date().toISOString(), id)
    .run();
}

export async function deleteRoutine(id: string): Promise<void> {
  await getDatabase().prepare("DELETE FROM recurring_tasks WHERE id = ?").bind(id).run();
}
