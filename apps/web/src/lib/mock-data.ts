import type {
  ActivityItem,
  DashboardMetric,
  DeadlineItem,
  FunctionalAreaStatus,
  PriorityItem
} from "./types";

export const dashboardMetrics: DashboardMetric[] = [
  {
    label: "Overdue Items",
    value: 6,
    detail: "Require immediate attention",
    tone: "danger",
    progress: 58
  },
  {
    label: "Due This Week",
    value: 11,
    detail: "Upcoming deadlines",
    tone: "warning",
    progress: 64
  },
  {
    label: "Awaiting Approval",
    value: 4,
    detail: "Items pending commander review",
    tone: "warning",
    progress: 41
  },
  {
    label: "Open Tasks",
    value: 23,
    detail: "Across all staff sections",
    tone: "info",
    progress: 46
  },
  {
    label: "Readiness Score",
    value: "88%",
    detail: "Overall squadron readiness",
    tone: "success",
    progress: 88
  }
];

export const priorityItems: PriorityItem[] = [
  {
    id: "task-finance-report",
    title: "July Finance Report",
    subtitle: "Monthly requirement",
    category: "Finance",
    due: "Jul 15, 2026",
    dueDetail: "3 days overdue",
    status: "Overdue",
    tone: "danger",
    assignedTo: "2d Lt. Maratos"
  },
  {
    id: "task-safety-briefing",
    title: "Monthly Safety Briefing",
    subtitle: "Monthly requirement",
    category: "Safety",
    due: "Jul 18, 2026",
    dueDetail: "Due tomorrow",
    status: "Due Soon",
    tone: "warning",
    assignedTo: "Unassigned"
  },
  {
    id: "task-inventory",
    title: "Quarterly Equipment Inventory",
    subtitle: "Inspection preparation",
    category: "Logistics",
    due: "Jul 20, 2026",
    dueDetail: "3 days",
    status: "In Progress",
    tone: "info",
    assignedTo: "SM R. Cooper"
  },
  {
    id: "task-plan",
    title: "Unit Training Plan",
    subtitle: "Quarterly requirement",
    category: "Cadet Programs",
    due: "Jul 31, 2026",
    dueDetail: "14 days",
    status: "Open",
    tone: "neutral",
    assignedTo: "2d Lt. Maratos"
  },
  {
    id: "task-web-review",
    title: "Website Content Review",
    subtitle: "Quarterly review",
    category: "Public Affairs",
    due: "Aug 5, 2026",
    dueDetail: "19 days",
    status: "Open",
    tone: "neutral",
    assignedTo: "Unassigned"
  }
];

export const activityItems: ActivityItem[] = [
  {
    id: "activity-1",
    title: "Task completed",
    detail: "CAPF 42 updates",
    actor: "Lt. Smith",
    timestamp: "2 hours ago",
    tone: "success"
  },
  {
    id: "activity-2",
    title: "Document approved",
    detail: "Safety Briefing, July 2026",
    actor: "2d Lt. Maratos",
    timestamp: "4 hours ago",
    tone: "success"
  },
  {
    id: "activity-3",
    title: "New task assigned",
    detail: "Update equipment inventory",
    actor: "Maj. Mellard",
    timestamp: "Yesterday",
    tone: "info"
  },
  {
    id: "activity-4",
    title: "Meeting created",
    detail: "July staff meeting",
    actor: "2d Lt. Maratos",
    timestamp: "Yesterday",
    tone: "warning"
  },
  {
    id: "activity-5",
    title: "Report submitted",
    detail: "June monthly report",
    actor: "Capt. Jones",
    timestamp: "2 days ago",
    tone: "success"
  }
];

export const deadlines: DeadlineItem[] = [
  {
    month: "JUL",
    day: "15",
    title: "July Finance Report",
    cadence: "Monthly requirement",
    timing: "3 days overdue",
    tone: "danger"
  },
  {
    month: "JUL",
    day: "18",
    title: "Safety Briefing",
    cadence: "Monthly requirement",
    timing: "Due tomorrow",
    tone: "warning"
  },
  {
    month: "JUL",
    day: "20",
    title: "Inventory Check",
    cadence: "Quarterly requirement",
    timing: "3 days",
    tone: "warning"
  },
  {
    month: "JUL",
    day: "31",
    title: "Unit Training Plan",
    cadence: "Quarterly requirement",
    timing: "14 days",
    tone: "neutral"
  }
];

export const functionalAreaStatus: FunctionalAreaStatus[] = [
  { key: "administration", name: "Administration", score: 92, status: "On Track", tone: "success" },
  { key: "personnel", name: "Personnel", score: 95, status: "On Track", tone: "success" },
  { key: "finance", name: "Finance", score: 72, status: "At Risk", tone: "warning" },
  { key: "logistics", name: "Logistics", score: 88, status: "On Track", tone: "success" },
  { key: "safety", name: "Safety", score: 75, status: "At Risk", tone: "warning" },
  { key: "aerospace", name: "Aerospace Education", score: 90, status: "On Track", tone: "success" },
  { key: "cadet-programs", name: "Cadet Programs", score: 93, status: "On Track", tone: "success" },
  { key: "emergency-services", name: "Emergency Services", score: 91, status: "On Track", tone: "success" },
  { key: "communications", name: "Communications", score: 89, status: "On Track", tone: "success" },
  { key: "it-systems", name: "IT and Systems", score: 94, status: "On Track", tone: "success" },
  { key: "public-affairs", name: "Public Affairs", score: 87, status: "On Track", tone: "success" },
  { key: "recruiting", name: "Recruiting", score: 68, status: "Needs Attention", tone: "danger" }
];
