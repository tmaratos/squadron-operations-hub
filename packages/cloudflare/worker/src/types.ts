export interface D1Result<T = Record<string, unknown>> {
  success: boolean;
  results: T[];
  meta?: Record<string, unknown>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<unknown>;
}

export interface Env {
  DB: D1Database;
  PUBLIC_APP_URL: string;
  SESSION_COOKIE?: string;
  MAGIC_LINK_TTL_MINUTES?: string;
  SESSION_TTL_DAYS?: string;
  MAIL_MODE?: string;
  MAILGUN_BASE_URL?: string;
  MAILGUN_API_KEY?: string;
  MAILGUN_DOMAIN?: string;
  MAIL_FROM?: string;
}

export type UserRole = "OWNER" | "MEMBER";
export type UserStatus = "PENDING_EMAIL" | "ACTIVE" | "SUSPENDED";
export type TaskStatus = "OPEN" | "IN_PROGRESS" | "BLOCKED" | "AWAITING_APPROVAL" | "COMPLETED" | "CANCELLED";
export type TaskPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";

export type CalendarEventType = "MEETING" | "DEADLINE" | "ACTIVITY" | "INSPECTION" | "TRAINING" | "OTHER";
export type CalendarEventStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";
export type CalendarPreparation = "NONE" | "NEEDS_ACTION" | "IN_PROGRESS" | "READY";


export interface UserRow {
  id: string;
  capid: string;
  rank: string;
  full_name: string;
  email: string | null;
  email_norm: string | null;
  role: UserRole;
  status: UserStatus;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthUser {
  id: string;
  capid: string;
  rank: string;
  fullName: string;
  email: string;
  role: UserRole;
}

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  functional_area: string;
  functional_area_name: string;
  owner_user_id: string | null;
  owner_name: string | null;
  created_by: string;
  created_by_name: string | null;
  due_on: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  readiness_weight: number;
  requires_approval: number;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}



export interface CalendarEventRow {
  id: string;
  title: string;
  description: string | null;
  event_type: CalendarEventType;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  all_day: number;
  location: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  created_by: string;
  created_by_name: string | null;
  status: CalendarEventStatus;
  preparation: CalendarPreparation;
  link_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export interface ScheduledController {
  scheduledTime: number;
  cron: string;
}
