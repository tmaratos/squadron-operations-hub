import { getDatabase } from "@/lib/cloudflare";
import type {
  CustomField,
  FieldOption,
  FieldType,
  FolderNode,
  ListDetail,
  ListNode,
  ListStatus,
  SavedView,
  ScopeType,
  SpaceNode,
  StatusCategory,
  ViewConfig,
  ViewType
} from "./types";

// Structure of the workspace: spaces, folders, lists, list workflows (statuses), custom fields and saved views.
// Everything is stored in Cloudflare D1.

export const WORKSPACE_ID = "tn-170";

export const DEFAULT_STATUSES: Array<{ name: string; color: string; category: StatusCategory }> = [
  { name: "to do", color: "#87909e", category: "NOT_STARTED" },
  { name: "in progress", color: "#5f55ee", category: "ACTIVE" },
  { name: "waiting", color: "#f76808", category: "ACTIVE" },
  { name: "complete", color: "#008844", category: "CLOSED" }
];

const DEFAULT_VIEWS: Array<{ name: string; type: ViewType; config: ViewConfig }> = [
  { name: "List", type: "list", config: { groupBy: "status", sortBy: "due" } },
  { name: "Board", type: "board", config: { groupBy: "status" } },
  { name: "Table", type: "table", config: { columns: ["title", "status", "assignees", "due_on", "priority", "tags"] } },
  { name: "Calendar", type: "calendar", config: { dateField: "due_on" } }
];

export function nowIso(): string {
  return new Date().toISOString();
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function getWorkspaceTree(workspaceId = WORKSPACE_ID): Promise<SpaceNode[]> {
  const db = getDatabase();
  const [spaces, folders, lists] = await Promise.all([
    db.prepare(
      "SELECT id, name, color, description FROM spaces WHERE workspace_id = ? AND archived_at IS NULL ORDER BY display_order ASC, name COLLATE NOCASE ASC"
    ).bind(workspaceId).all<{ id: string; name: string; color: string; description: string | null }>(),
    db.prepare(
      "SELECT folders.id, folders.space_id, folders.name FROM folders JOIN spaces ON spaces.id = folders.space_id " +
      "WHERE spaces.workspace_id = ? AND folders.archived_at IS NULL ORDER BY folders.display_order ASC, folders.name COLLATE NOCASE ASC"
    ).bind(workspaceId).all<{ id: string; space_id: string; name: string }>(),
    db.prepare(
      "SELECT lists.id, lists.space_id, lists.folder_id, lists.name, lists.color, " +
      "(SELECT COUNT(*) FROM items LEFT JOIN list_statuses s ON s.id = items.status_id " +
      " WHERE items.list_id = lists.id AND items.archived_at IS NULL AND items.parent_id IS NULL " +
      " AND (s.category IS NULL OR s.category NOT IN ('DONE', 'CLOSED'))) AS open_items " +
      "FROM lists JOIN spaces ON spaces.id = lists.space_id " +
      "WHERE spaces.workspace_id = ? AND lists.archived_at IS NULL ORDER BY lists.display_order ASC, lists.name COLLATE NOCASE ASC"
    ).bind(workspaceId).all<{ id: string; space_id: string; folder_id: string | null; name: string; color: string | null; open_items: number }>()
  ]);

  const listNodes: ListNode[] = lists.results.map((row) => ({
    id: row.id,
    spaceId: row.space_id,
    folderId: row.folder_id,
    name: row.name,
    color: row.color,
    openItems: Number(row.open_items ?? 0)
  }));

  return spaces.results.map((space) => {
    const spaceFolders: FolderNode[] = folders.results
      .filter((folder) => folder.space_id === space.id)
      .map((folder) => ({
        id: folder.id,
        spaceId: folder.space_id,
        name: folder.name,
        lists: listNodes.filter((list) => list.folderId === folder.id)
      }));
    return {
      id: space.id,
      name: space.name,
      color: space.color,
      description: space.description,
      folders: spaceFolders,
      lists: listNodes.filter((list) => list.spaceId === space.id && !list.folderId)
    };
  });
}

export async function getListDetail(listId: string): Promise<ListDetail | null> {
  const db = getDatabase();
  const list = await db.prepare(
    "SELECT lists.id, lists.space_id, spaces.name AS space_name, lists.folder_id, folders.name AS folder_name, lists.name, lists.description " +
    "FROM lists JOIN spaces ON spaces.id = lists.space_id LEFT JOIN folders ON folders.id = lists.folder_id WHERE lists.id = ? LIMIT 1"
  ).bind(listId).first<{ id: string; space_id: string; space_name: string; folder_id: string | null; folder_name: string | null; name: string; description: string | null }>();
  if (!list) return null;

  const [statuses, fields, views] = await Promise.all([
    listStatuses(listId),
    listFields(listId, list.space_id),
    listViews("list", listId)
  ]);

  return {
    id: list.id,
    spaceId: list.space_id,
    spaceName: list.space_name,
    folderId: list.folder_id,
    folderName: list.folder_name,
    name: list.name,
    description: list.description,
    statuses,
    fields,
    views
  };
}

export async function listStatuses(listId: string): Promise<ListStatus[]> {
  const result = await getDatabase()
    .prepare("SELECT id, list_id, name, color, category, display_order FROM list_statuses WHERE list_id = ? ORDER BY display_order ASC")
    .bind(listId)
    .all<{ id: string; list_id: string; name: string; color: string; category: StatusCategory; display_order: number }>();
  return result.results.map((row) => ({ id: row.id, listId: row.list_id, name: row.name, color: row.color, category: row.category, order: row.display_order }));
}

export async function listFields(listId: string, spaceId: string): Promise<CustomField[]> {
  const result = await getDatabase()
    .prepare(
      "SELECT id, list_id, space_id, name, field_type, options_json, required, display_order FROM custom_fields " +
      "WHERE list_id = ? OR (list_id IS NULL AND space_id = ?) ORDER BY display_order ASC, name COLLATE NOCASE ASC"
    )
    .bind(listId, spaceId)
    .all<{ id: string; list_id: string | null; space_id: string | null; name: string; field_type: FieldType; options_json: string | null; required: number; display_order: number }>();
  return result.results.map((row) => ({
    id: row.id,
    listId: row.list_id,
    spaceId: row.space_id,
    name: row.name,
    type: row.field_type,
    options: parseJson<FieldOption[]>(row.options_json, []),
    required: Boolean(row.required),
    order: row.display_order
  }));
}

export async function listViews(scopeType: ScopeType, scopeId: string): Promise<SavedView[]> {
  const result = await getDatabase()
    .prepare("SELECT id, scope_type, scope_id, name, view_type, config_json, is_default, display_order FROM views WHERE scope_type = ? AND scope_id = ? ORDER BY display_order ASC")
    .bind(scopeType, scopeId)
    .all<{ id: string; scope_type: ScopeType; scope_id: string; name: string; view_type: ViewType; config_json: string; is_default: number; display_order: number }>();
  return result.results.map((row) => ({
    id: row.id,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    name: row.name,
    type: row.view_type,
    config: parseJson<ViewConfig>(row.config_json, {}),
    isDefault: Boolean(row.is_default),
    order: row.display_order
  }));
}

export async function createSpace(input: { name: string; color?: string; description?: string | null; userId: string; workspaceId?: string }): Promise<string> {
  const id = crypto.randomUUID();
  const now = nowIso();
  await getDatabase()
    .prepare(
      "INSERT INTO spaces (id, workspace_id, name, description, color, display_order, created_by, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM spaces WHERE workspace_id = ?), ?, ?, ?)"
    )
    .bind(id, input.workspaceId ?? WORKSPACE_ID, input.name.trim(), input.description?.trim() || null, input.color ?? "purple", input.workspaceId ?? WORKSPACE_ID, input.userId, now, now)
    .run();
  return id;
}

export async function createFolder(input: { spaceId: string; name: string }): Promise<string> {
  const id = crypto.randomUUID();
  const now = nowIso();
  await getDatabase()
    .prepare(
      "INSERT INTO folders (id, space_id, name, display_order, created_at, updated_at) " +
      "VALUES (?, ?, ?, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM folders WHERE space_id = ?), ?, ?)"
    )
    .bind(id, input.spaceId, input.name.trim(), input.spaceId, now, now)
    .run();
  return id;
}

export async function createList(input: { spaceId: string; folderId?: string | null; name: string; description?: string | null; userId: string }): Promise<string> {
  const db = getDatabase();
  const id = crypto.randomUUID();
  const now = nowIso();
  const statements = [
    db.prepare(
      "INSERT INTO lists (id, space_id, folder_id, name, description, display_order, created_by, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM lists WHERE space_id = ?), ?, ?, ?)"
    ).bind(id, input.spaceId, input.folderId || null, input.name.trim(), input.description?.trim() || null, input.spaceId, input.userId, now, now)
  ];
  DEFAULT_STATUSES.forEach((status, index) => {
    statements.push(
      db.prepare("INSERT INTO list_statuses (id, list_id, name, color, category, display_order) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), id, status.name, status.color, status.category, index)
    );
  });
  DEFAULT_VIEWS.forEach((view, index) => {
    statements.push(
      db.prepare(
        "INSERT INTO views (id, workspace_id, scope_type, scope_id, name, view_type, config_json, is_default, display_order, created_by, created_at, updated_at) " +
        "VALUES (?, ?, 'list', ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(crypto.randomUUID(), WORKSPACE_ID, id, view.name, view.type, JSON.stringify(view.config), index === 0 ? 1 : 0, index, input.userId, now, now)
    );
  });
  await db.batch(statements);
  return id;
}

export async function renameNode(kind: "space" | "folder" | "list", id: string, name: string): Promise<void> {
  const table = kind === "space" ? "spaces" : kind === "folder" ? "folders" : "lists";
  await getDatabase().prepare("UPDATE " + table + " SET name = ?, updated_at = ? WHERE id = ?").bind(name.trim(), nowIso(), id).run();
}

export async function archiveNode(kind: "space" | "folder" | "list", id: string): Promise<void> {
  const table = kind === "space" ? "spaces" : kind === "folder" ? "folders" : "lists";
  const now = nowIso();
  await getDatabase().prepare("UPDATE " + table + " SET archived_at = ?, updated_at = ? WHERE id = ?").bind(now, now, id).run();
}

export async function updateListDescription(listId: string, description: string | null): Promise<void> {
  await getDatabase().prepare("UPDATE lists SET description = ?, updated_at = ? WHERE id = ?").bind(description?.trim() || null, nowIso(), listId).run();
}

export async function saveStatuses(listId: string, statuses: Array<{ id?: string | null; name: string; color: string; category: StatusCategory }>): Promise<ListStatus[]> {
  const db = getDatabase();
  const existing = await listStatuses(listId);
  const keepIds = new Set(statuses.map((status) => status.id).filter((id): id is string => Boolean(id)));
  const statements = existing
    .filter((status) => !keepIds.has(status.id))
    .map((status) => db.prepare("DELETE FROM list_statuses WHERE id = ?").bind(status.id));
  statuses.forEach((status, index) => {
    if (status.id && existing.some((item) => item.id === status.id)) {
      statements.push(
        db.prepare("UPDATE list_statuses SET name = ?, color = ?, category = ?, display_order = ? WHERE id = ?")
          .bind(status.name.trim(), status.color, status.category, index, status.id)
      );
    } else {
      statements.push(
        db.prepare("INSERT INTO list_statuses (id, list_id, name, color, category, display_order) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(crypto.randomUUID(), listId, status.name.trim(), status.color, status.category, index)
      );
    }
  });
  if (statements.length) await db.batch(statements);
  return listStatuses(listId);
}

export async function createField(input: { listId: string; name: string; type: FieldType; options?: FieldOption[] }): Promise<string> {
  const id = crypto.randomUUID();
  const now = nowIso();
  await getDatabase()
    .prepare(
      "INSERT INTO custom_fields (id, list_id, name, field_type, options_json, display_order, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM custom_fields WHERE list_id = ?), ?, ?)"
    )
    .bind(id, input.listId, input.name.trim(), input.type, input.options?.length ? JSON.stringify(input.options) : null, input.listId, now, now)
    .run();
  return id;
}

export async function updateField(id: string, input: { name?: string; options?: FieldOption[] }): Promise<void> {
  const current = await getDatabase().prepare("SELECT name, options_json FROM custom_fields WHERE id = ?").bind(id).first<{ name: string; options_json: string | null }>();
  if (!current) throw new Error("Field not found.");
  await getDatabase()
    .prepare("UPDATE custom_fields SET name = ?, options_json = ?, updated_at = ? WHERE id = ?")
    .bind(input.name?.trim() || current.name, input.options ? JSON.stringify(input.options) : current.options_json, nowIso(), id)
    .run();
}

export async function deleteField(id: string): Promise<void> {
  await getDatabase().prepare("DELETE FROM custom_fields WHERE id = ?").bind(id).run();
}

export async function createView(input: { scopeType: ScopeType; scopeId: string; name: string; type: ViewType; config: ViewConfig; userId: string }): Promise<string> {
  const id = crypto.randomUUID();
  const now = nowIso();
  await getDatabase()
    .prepare(
      "INSERT INTO views (id, workspace_id, scope_type, scope_id, name, view_type, config_json, is_default, display_order, created_by, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, 0, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM views WHERE scope_type = ? AND scope_id = ?), ?, ?, ?)"
    )
    .bind(id, WORKSPACE_ID, input.scopeType, input.scopeId, input.name.trim(), input.type, JSON.stringify(input.config), input.scopeType, input.scopeId, input.userId, now, now)
    .run();
  return id;
}

export async function updateView(id: string, input: { name?: string; type?: ViewType; config?: ViewConfig }): Promise<void> {
  const current = await getDatabase().prepare("SELECT name, view_type, config_json FROM views WHERE id = ?").bind(id).first<{ name: string; view_type: ViewType; config_json: string }>();
  if (!current) throw new Error("View not found.");
  await getDatabase()
    .prepare("UPDATE views SET name = ?, view_type = ?, config_json = ?, updated_at = ? WHERE id = ?")
    .bind(input.name?.trim() || current.name, input.type ?? current.view_type, input.config ? JSON.stringify(input.config) : current.config_json, nowIso(), id)
    .run();
}

export async function deleteView(id: string): Promise<void> {
  await getDatabase().prepare("DELETE FROM views WHERE id = ?").bind(id).run();
}
