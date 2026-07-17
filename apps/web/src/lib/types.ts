export type Tone = "danger" | "warning" | "success" | "info" | "neutral";

export interface DashboardMetric {
  label: string;
  value: string | number;
  detail: string;
  tone: Tone;
  progress?: number;
}

export interface PriorityItem {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  due: string;
  dueDetail: string;
  status: string;
  tone: Tone;
  assignedTo: string;
}

export interface ActivityItem {
  id: string;
  title: string;
  detail: string;
  actor: string;
  timestamp: string;
  tone: Tone;
}

export interface DeadlineItem {
  month: string;
  day: string;
  title: string;
  cadence: string;
  timing: string;
  tone: Tone;
}

export interface FunctionalAreaStatus {
  key: string;
  name: string;
  score: number;
  status: "On Track" | "At Risk" | "Needs Attention";
  tone: Tone;
}

export interface ModuleStat {
  label: string;
  value: string | number;
  detail: string;
  tone: Tone;
}

export interface ModuleAction {
  label: string;
  description: string;
}

export interface ModuleRecord {
  id: string;
  primary: string;
  secondary: string;
  tertiary?: string;
  status: string;
  tone: Tone;
}

export interface ModuleDefinition {
  key: string;
  title: string;
  subtitle: string;
  description: string;
  stats: ModuleStat[];
  actions: ModuleAction[];
  records: ModuleRecord[];
  emptyState?: string;
}
