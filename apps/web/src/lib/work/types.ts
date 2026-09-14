// Types for the flexible work structure stored in Cloudflare D1 (migration 0009).
// Workspace > Space > Folder (optional) > List > Item > sub-items.

export type StatusCategory = "NOT_STARTED" | "ACTIVE" | "DONE" | "CLOSED";
export type ItemPriority = "URGENT" | "HIGH" | "NORMAL" | "LOW";
export type FieldType =
  | "text"
  | "long_text"
  | "number"
  | "currency"
  | "date"
  | "checkbox"
  | "dropdown"
  | "labels"
  | "person"
  | "url"
  | "email"
  | "phone"
  | "rating"
  | "progress";
export type ViewType = "list" | "board" | "table" | "calendar" | "timeline";
export type ScopeType = "workspace" | "space" | "folder" | "list";

export interface SpaceNode {
  id: string;
  name: string;
  color: string;
  description: string | null;
  folders: FolderNode[];
  lists: ListNode[];
}

export interface FolderNode {
  id: string;
  spaceId: string;
  name: string;
  lists: ListNode[];
}

export interface ListNode {
  id: string;
  spaceId: string;
  folderId: string | null;
  name: string;
  color: string | null;
  openItems: number;
}

export interface ListStatus {
  id: string;
  listId: string;
  name: string;
  color: string;
  category: StatusCategory;
  order: number;
}

export interface FieldOption {
  id: string;
  name: string;
  color?: string | null;
}

export interface CustomField {
  id: string;
  listId: string | null;
  spaceId: string | null;
  name: string;
  type: FieldType;
  options: FieldOption[];
  required: boolean;
  order: number;
}

export interface SavedView {
  id: string;
  scopeType: ScopeType;
  scopeId: string;
  name: string;
  type: ViewType;
  config: ViewConfig;
  isDefault: boolean;
  order: number;
}

export interface ViewConfig {
  groupBy?: "status" | "priority" | "assignee" | "due" | "none";
  sortBy?: "due" | "priority" | "updated" | "title" | "manual";
  filters?: {
    due?: "overdue" | "today" | "next7" | "next14" | "none";
    statusIds?: string[];
    statusName?: string;
    assigneeIds?: string[];
    tags?: string[];
    priorities?: ItemPriority[];
    includeClosed?: boolean;
    search?: string;
  };
  columns?: string[];
  showSubitems?: boolean;
  dateField?: "due_on" | "start_on";
}

export interface ListDetail {
  id: string;
  spaceId: string;
  spaceName: string;
  folderId: string | null;
  folderName: string | null;
  name: string;
  description: string | null;
  statuses: ListStatus[];
  fields: CustomField[];
  views: SavedView[];
}

export interface ItemPerson {
  id: string;
  fullName: string;
}

export interface ItemTag {
  id: string;
  label: string;
  color: string;
}

export interface WorkItem {
  id: string;
  listId: string;
  parentId: string | null;
  title: string;
  description: string | null;
  statusId: string | null;
  priority: ItemPriority | null;
  startOn: string | null;
  dueOn: string | null;
  timeEstimateMinutes: number | null;
  order: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignees: ItemPerson[];
  tags: ItemTag[];
  fieldValues: Record<string, unknown>;
  childCount: number;
  checklistDone: number;
  checklistTotal: number;
  commentCount: number;
}

export interface ChecklistEntry {
  id: string;
  label: string;
  done: boolean;
  assigneeUserId: string | null;
  order: number;
}

export interface Checklist {
  id: string;
  name: string;
  order: number;
  entries: ChecklistEntry[];
}

export interface ItemComment {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ItemRelation {
  itemId: string;
  title: string;
  type: "blocks" | "waiting_on" | "related";
}

export interface ItemAttachment {
  id: string;
  name: string;
  url: string | null;
  driveFileId: string | null;
  createdAt: string;
}

export interface ItemDetail extends WorkItem {
  listName: string;
  children: WorkItem[];
  checklists: Checklist[];
  comments: ItemComment[];
  relations: ItemRelation[];
  attachments: ItemAttachment[];
  ancestors: Array<{ id: string; title: string }>;
}

export type WidgetType = "count" | "item_list" | "status_breakdown" | "assignee_workload" | "tag_breakdown" | "text";

export interface DashboardWidget {
  id: string;
  dashboardId: string;
  type: WidgetType;
  title: string;
  config: {
    filters?: ViewConfig["filters"];
    listIds?: string[];
    sortBy?: ViewConfig["sortBy"];
    limit?: number;
    tone?: "danger" | "warning" | "info" | "success" | "accent";
    text?: string;
  };
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Dashboard {
  id: string;
  name: string;
  description: string | null;
  isHome: boolean;
  widgets: DashboardWidget[];
}

export type AutomationTrigger =
  | { type: "item_created" }
  | { type: "status_changed"; toStatusName?: string }
  | { type: "assignee_added" }
  | { type: "priority_changed"; toPriority?: ItemPriority }
  | { type: "tag_added"; tag?: string };

export type AutomationCondition =
  | { type: "has_tag"; tag: string }
  | { type: "priority_is"; priority: ItemPriority }
  | { type: "status_is"; statusName: string }
  | { type: "no_assignee" };

export type AutomationAction =
  | { type: "set_status"; statusName: string }
  | { type: "set_priority"; priority: ItemPriority }
  | { type: "add_tag"; tag: string }
  | { type: "remove_tag"; tag: string }
  | { type: "assign"; userId: string }
  | { type: "add_comment"; body: string }
  | { type: "set_due_in_days"; days: number };

export interface Automation {
  id: string;
  scopeType: ScopeType;
  scopeId: string;
  name: string;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  enabled: boolean;
  lastRunAt: string | null;
}
