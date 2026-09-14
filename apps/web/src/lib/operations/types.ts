export type TaskStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "AWAITING_APPROVAL"
  | "COMPLETED"
  | "CANCELLED";

export type TaskPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
export type TaskSourceType = "MANUAL" | "MEETING" | "DISCORD" | "COMPLIANCE" | "SYSTEM";

export interface FunctionalAreaRecord {
  key: string;
  name: string;
  description: string | null;
  displayOrder: number;
}

export interface TaskTag {
  id: string;
  label: string;
  color: string;
}

export interface OperationalTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  functionalAreaKey: string;
  functionalAreaName: string;
  ownerUserId: string | null;
  ownerName: string | null;
  dueOn: string | null;
  sourceType: TaskSourceType;
  sourceReference: string | null;
  requiresApproval: boolean;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  tags?: TaskTag[];
}

export interface TaskCreateInput {
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  functionalAreaKey: string;
  ownerUserId?: string | null;
  dueOn?: string | null;
  sourceType?: TaskSourceType;
  sourceReference?: string | null;
  requiresApproval?: boolean;
  tags?: string[];
}

export interface TaskUpdateInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  functionalAreaKey?: string;
  ownerUserId?: string | null;
  dueOn?: string | null;
  requiresApproval?: boolean;
  tags?: string[];
}

export interface DashboardTaskSummary {
  open: number;
  inProgress: number;
  blocked: number;
  awaitingApproval: number;
  completed: number;
  overdue: number;
  dueThisWeek: number;
}

export interface FunctionalAreaReadiness {
  key: string;
  name: string;
  score: number;
  status: string;
  openTasks: number;
  overdueTasks: number;
  blockedTasks: number;
}
