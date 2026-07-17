export type TaskStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "AWAITING_APPROVAL"
  | "COMPLETED"
  | "CANCELLED";

export type TaskPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";

export interface SquadronTask {
  id: string;
  squadronId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt?: Date;
  ownerUserId?: string;
  functionalAreaId?: string;
  sourceType?: "MANUAL" | "MEETING" | "DISCORD" | "COMPLIANCE" | "SYSTEM";
  sourceReference?: string;
}
