import type { Env, TaskPriority, TaskRow, TaskStatus } from "./types";
import { addDateDays, isoDate } from "./utils";

interface FunctionalAreaRow {
  key: string;
  name: string;
  base_score: number;
  weight: number;
}

interface ScoreContribution {
  taskId: string;
  title: string;
  amount: number;
  reason: string;
}

interface AreaScore {
  key: string;
  name: string;
  score: number;
  openTasks: number;
  contributions: ScoreContribution[];
}

const ACTIONABLE: TaskStatus[] = ["OPEN", "IN_PROGRESS", "BLOCKED"];
const OPEN_STATUSES: TaskStatus[] = ["OPEN", "IN_PROGRESS", "BLOCKED", "AWAITING_APPROVAL"];
const overduePenalty: Record<TaskPriority, number> = {
  LOW: 2,
  NORMAL: 5,
  HIGH: 8,
  CRITICAL: 12
};

export async function buildDashboard(env: Env) {
  const [areasResult, tasksResult] = await Promise.all([
    env.DB.prepare("SELECT key, name, base_score, weight FROM functional_areas ORDER BY display_order").all<FunctionalAreaRow>(),
    env.DB.prepare(`
      SELECT
        t.*,
        fa.name AS functional_area_name,
        owner.full_name AS owner_name,
        creator.full_name AS created_by_name
      FROM tasks t
      JOIN functional_areas fa ON fa.key = t.functional_area
      LEFT JOIN users owner ON owner.id = t.owner_user_id
      LEFT JOIN users creator ON creator.id = t.created_by
      WHERE t.status != 'CANCELLED'
      ORDER BY
        CASE t.priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,
        COALESCE(t.due_on, '9999-12-31'),
        t.created_at DESC
    `).all<TaskRow>()
  ]);

  const today = isoDate();
  const weekEnd = addDateDays(today, 7);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const tasks = tasksResult.results;
  const overdue = tasks.filter(task =>
    ACTIONABLE.includes(task.status) && Boolean(task.due_on) && task.due_on! < today
  ).length;
  const dueThisWeek = tasks.filter(task =>
    ACTIONABLE.includes(task.status) && Boolean(task.due_on) && task.due_on! >= today && task.due_on! <= weekEnd
  ).length;
  const awaitingApproval = tasks.filter(task => task.status === "AWAITING_APPROVAL").length;
  const openTasks = tasks.filter(task => OPEN_STATUSES.includes(task.status)).length;

  const areaScores: AreaScore[] = areasResult.results.map(area => {
    let score = area.base_score;
    const contributions: ScoreContribution[] = [];
    const areaTasks = tasks.filter(task => task.functional_area === area.key);

    for (const task of areaTasks) {
      if (ACTIONABLE.includes(task.status) && task.due_on && task.due_on < today) {
        const amount = -overduePenalty[task.priority];
        score += amount;
        contributions.push({ taskId: task.id, title: task.title, amount, reason: `${task.priority.toLowerCase()} overdue item` });
      }

      if (task.status === "BLOCKED") {
        score -= 6;
        contributions.push({ taskId: task.id, title: task.title, amount: -6, reason: "Blocked work item" });
      }

      if (ACTIONABLE.includes(task.status) && task.due_on && task.due_on >= today && task.due_on <= addDateDays(today, 3)) {
        score -= 1;
        contributions.push({ taskId: task.id, title: task.title, amount: -1, reason: "Due within three days" });
      }

      if (task.status === "AWAITING_APPROVAL") {
        const amount = Math.min(2, Math.max(1, task.readiness_weight));
        score += amount;
        contributions.push({ taskId: task.id, title: task.title, amount, reason: "Submitted and awaiting approval" });
      }

      if (task.status === "COMPLETED" && task.completed_at && task.completed_at >= thirtyDaysAgo) {
        const amount = Math.max(1, task.readiness_weight);
        score += amount;
        contributions.push({ taskId: task.id, title: task.title, amount, reason: "Approved completion within 30 days" });
      }
    }

    return {
      key: area.key,
      name: area.name,
      score: Math.max(0, Math.min(100, Math.round(score))),
      openTasks: areaTasks.filter(task => OPEN_STATUSES.includes(task.status)).length,
      contributions
    };
  });

  const weightTotal = areasResult.results.reduce((sum, area) => sum + area.weight, 0) || 1;
  const readinessScore = Math.round(areaScores.reduce((sum, score) => {
    const weight = areasResult.results.find(area => area.key === score.key)?.weight || 1;
    return sum + score.score * weight;
  }, 0) / weightTotal);

  return {
    rulesVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    metrics: { overdue, dueThisWeek, awaitingApproval, openTasks, readinessScore },
    priorityTasks: tasks.filter(task => OPEN_STATUSES.includes(task.status)).slice(0, 8),
    areas: areaScores
  };
}
