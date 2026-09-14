import { getDatabase } from "@/lib/cloudflare";
import { nowIso, parseJson } from "./structure";
import type { Checklist, ItemComment, ItemDetail, ItemPriority, ItemTag, WorkItem } from "./types";

// Items in lists, with their assignees, tags, custom field values, checklists and comments. Stored in Cloudflare D1.

const TAG_COLORS = ["blue", "green", "amber", "red", "purple", "teal", "pink", "slate"];

function tagColor(label: string): string {
  let hash = 0;
  for (let index = 0; index < label.length; index += 1) hash = (hash * 31 + label.charCodeAt(index)) >>> 0;
  return TAG_COLORS[hash % TAG_COLORS.length];
}

function normalizeTag(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40);
}

interface ItemRow {
  id: string;
  list_id: string;
  parent_id: string | null;
  title: string;
  description: string | null;
  status_id: string | null;
  priority: ItemPriority | null;
  start_on: string | null;
  due_on: string | null;
  time_estimate_minutes: number | null;
  display_order: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  child_count: number;
  checklist_done: number;
  checklist_total: number;
  comment_count: number;
}

const ITEM_COLUMNS =
  "items.id, items.list_id, items.parent_id, items.title, NULL AS description, items.status_id, items.priority, items.start_on, items.due_on, " +
  "items.time_estimate_minutes, items.display_order, items.completed_at, items.created_at, items.updated_at, " +
  "(SELECT COUNT(*) FROM items c WHERE c.parent_id = items.id AND c.archived_at IS NULL) AS child_count, " +
  "(SELECT COUNT(*) FROM item_checklist_entries e JOIN item_checklists k ON k.id = e.checklist_id WHERE k.item_id = items.id AND e.done = 1) AS checklist_done, " +
  "(SELECT COUNT(*) FROM item_checklist_entries e JOIN item_checklists k ON k.id = e.checklist_id WHERE k.item_id = items.id) AS checklist_total, " +
  "(SELECT COUNT(*) FROM item_comments m WHERE m.item_id = items.id) AS comment_count";

async function hydrate(rows: ItemRow[]): Promise<WorkItem[]> {
  if (!rows.length) return [];
  const db = getDatabase();
  const ids = rows.map((row) => row.id);
  const marks = ids.map(() => "?").join(", ");
  const [assignees, tags, values] = await Promise.all([
    db.prepare("SELECT a.item_id, u.id, u.full_name FROM item_assignees a JOIN users u ON u.id = a.user_id WHERE a.item_id IN (" + marks + ")")
      .bind(...ids).all<{ item_id: string; id: string; full_name: string }>(),
    db.prepare("SELECT it.item_id, t.id, t.label, t.color FROM item_tags it JOIN task_tags t ON t.id = it.tag_id WHERE it.item_id IN (" + marks + ") ORDER BY t.label")
      .bind(...ids).all<{ item_id: string; id: string; label: string; color: string | null }>(),
    db.prepare("SELECT item_id, field_id, value_json FROM item_field_values WHERE item_id IN (" + marks + ")")
      .bind(...ids).all<{ item_id: string; field_id: string; value_json: string | null }>()
  ]);
  return rows.map((row) => {
    const fieldValues: Record<string, unknown> = {};
    values.results.filter((value) => value.item_id === row.id).forEach((value) => {
      fieldValues[value.field_id] = parseJson<unknown>(value.value_json, null);
    });
    return {
      id: row.id,
      listId: row.list_id,
      parentId: row.parent_id,
      title: row.title,
      description: row.description,
      statusId: row.status_id,
      priority: row.priority,
      startOn: row.start_on,
      dueOn: row.due_on,
      timeEstimateMinutes: row.time_estimate_minutes,
      order: Number(row.display_order ?? 0),
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      assignees: assignees.results.filter((person) => person.item_id === row.id).map((person) => ({ id: person.id, fullName: person.full_name })),
      tags: tags.results.filter((tag) => tag.item_id === row.id).map((tag): ItemTag => ({ id: tag.id, label: tag.label, color: tag.color || tagColor(tag.label) })),
      fieldValues,
      childCount: Number(row.child_count ?? 0),
      checklistDone: Number(row.checklist_done ?? 0),
      checklistTotal: Number(row.checklist_total ?? 0),
      commentCount: Number(row.comment_count ?? 0)
    };
  });
}

// Every non-archived item in a list, top-level and nested. The client builds the tree from parentId.
export async function listItems(listId: string): Promise<WorkItem[]> {
  const result = await getDatabase()
    .prepare("SELECT " + ITEM_COLUMNS + " FROM items WHERE items.list_id = ? AND items.archived_at IS NULL ORDER BY items.display_order ASC, items.created_at ASC")
    .bind(listId)
    .all<ItemRow>();
  return hydrate(result.results);
}

export async function getItemDetail(itemId: string): Promise<ItemDetail | null> {
  const db = getDatabase();
  const row = await db.prepare("SELECT " + ITEM_COLUMNS.replace("NULL AS description", "items.description") + ", lists.name AS list_name FROM items JOIN lists ON lists.id = items.list_id WHERE items.id = ? LIMIT 1")
    .bind(itemId).first<ItemRow & { list_name: string }>();
  if (!row) return null;

  const [[item], children, checklistRows, entryRows, commentRows, relationRows, attachmentRows, ancestors] = await Promise.all([
    hydrate([row]),
    db.prepare("SELECT " + ITEM_COLUMNS + " FROM items WHERE items.parent_id = ? AND items.archived_at IS NULL ORDER BY items.display_order ASC, items.created_at ASC")
      .bind(itemId).all<ItemRow>().then((result) => hydrate(result.results)),
    db.prepare("SELECT id, name, display_order FROM item_checklists WHERE item_id = ? ORDER BY display_order").bind(itemId)
      .all<{ id: string; name: string; display_order: number }>(),
    db.prepare("SELECT e.id, e.checklist_id, e.label, e.done, e.assignee_user_id, e.display_order FROM item_checklist_entries e JOIN item_checklists k ON k.id = e.checklist_id WHERE k.item_id = ? ORDER BY e.display_order")
      .bind(itemId).all<{ id: string; checklist_id: string; label: string; done: number; assignee_user_id: string | null; display_order: number }>(),
    db.prepare("SELECT c.id, c.author_user_id, COALESCE(u.full_name, 'Unknown') AS author_name, c.body, c.created_at, c.updated_at FROM item_comments c LEFT JOIN users u ON u.id = c.author_user_id WHERE c.item_id = ? ORDER BY c.created_at ASC")
      .bind(itemId).all<{ id: string; author_user_id: string; author_name: string; body: string; created_at: string; updated_at: string }>(),
    db.prepare("SELECT r.related_item_id, r.relation_type, i.title FROM item_relations r JOIN items i ON i.id = r.related_item_id WHERE r.item_id = ?")
      .bind(itemId).all<{ related_item_id: string; relation_type: "blocks" | "waiting_on" | "related"; title: string }>(),
    db.prepare("SELECT id, name, url, drive_file_id, created_at FROM item_attachments WHERE item_id = ? ORDER BY created_at")
      .bind(itemId).all<{ id: string; name: string; url: string | null; drive_file_id: string | null; created_at: string }>(),
    loadAncestors(row.parent_id)
  ]);

  const checklists: Checklist[] = checklistRows.results.map((checklist) => ({
    id: checklist.id,
    name: checklist.name,
    order: checklist.display_order,
    entries: entryRows.results.filter((entry) => entry.checklist_id === checklist.id).map((entry) => ({
      id: entry.id,
      label: entry.label,
      done: Boolean(entry.done),
      assigneeUserId: entry.assignee_user_id,
      order: entry.display_order
    }))
  }));
  const comments: ItemComment[] = commentRows.results.map((comment) => ({
    id: comment.id,
    authorId: comment.author_user_id,
    authorName: comment.author_name,
    body: comment.body,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at
  }));

  return {
    ...item,
    listName: row.list_name,
    children,
    checklists,
    comments,
    relations: relationRows.results.map((relation) => ({ itemId: relation.related_item_id, title: relation.title, type: relation.relation_type })),
    attachments: attachmentRows.results.map((file) => ({ id: file.id, name: file.name, url: file.url, driveFileId: file.drive_file_id, createdAt: file.created_at })),
    ancestors
  };
}

async function loadAncestors(parentId: string | null): Promise<Array<{ id: string; title: string }>> {
  const chain: Array<{ id: string; title: string }> = [];
  let current = parentId;
  while (current && chain.length < 10) {
    const parent: { id: string; title: string; parent_id: string | null } | null = await getDatabase()
      .prepare("SELECT id, title, parent_id FROM items WHERE id = ?").bind(current).first<{ id: string; title: string; parent_id: string | null }>();
    if (!parent) break;
    chain.unshift({ id: parent.id, title: parent.title });
    current = parent.parent_id;
  }
  return chain;
}

export async function createItem(input: {
  listId: string;
  parentId?: string | null;
  title: string;
  statusId?: string | null;
  priority?: ItemPriority | null;
  dueOn?: string | null;
  userId: string;
}): Promise<string> {
  const db = getDatabase();
  const id = crypto.randomUUID();
  const now = nowIso();
  const statusId = input.statusId ?? (await db.prepare("SELECT id FROM list_statuses WHERE list_id = ? ORDER BY display_order LIMIT 1").bind(input.listId).first<{ id: string }>())?.id ?? null;
  await db.prepare(
    "INSERT INTO items (id, list_id, parent_id, title, status_id, priority, due_on, display_order, created_by, created_at, updated_at) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM items WHERE list_id = ?), ?, ?, ?)"
  ).bind(id, input.listId, input.parentId || null, input.title.trim(), statusId, input.priority ?? null, input.dueOn || null, input.listId, input.userId, now, now).run();
  return id;
}

export interface ItemUpdate {
  title?: string;
  description?: string | null;
  statusId?: string | null;
  priority?: ItemPriority | null;
  startOn?: string | null;
  dueOn?: string | null;
  parentId?: string | null;
  tags?: string[];
  assigneeIds?: string[];
  fieldValues?: Record<string, unknown>;
}

export async function updateItem(itemId: string, input: ItemUpdate): Promise<void> {
  const db = getDatabase();
  const now = nowIso();
  const sets: string[] = [];
  const values: unknown[] = [];
  const assign = (column: string, value: unknown) => {
    sets.push(column + " = ?");
    values.push(value);
  };
  if (input.title !== undefined) assign("title", input.title.trim());
  if (input.description !== undefined) assign("description", input.description?.trim() ? input.description : null);
  if (input.priority !== undefined) assign("priority", input.priority);
  if (input.startOn !== undefined) assign("start_on", input.startOn || null);
  if (input.dueOn !== undefined) assign("due_on", input.dueOn || null);
  if (input.parentId !== undefined) {
    if (input.parentId === itemId) throw new Error("An item cannot be nested inside itself.");
    assign("parent_id", input.parentId || null);
  }
  if (input.statusId !== undefined) {
    assign("status_id", input.statusId);
    const status = input.statusId
      ? await db.prepare("SELECT category FROM list_statuses WHERE id = ?").bind(input.statusId).first<{ category: string }>()
      : null;
    assign("completed_at", status && ["DONE", "CLOSED"].includes(status.category) ? now : null);
  }

  const statements: D1PreparedStatement[] = [];
  if (sets.length) {
    statements.push(db.prepare("UPDATE items SET " + sets.join(", ") + ", updated_at = ? WHERE id = ?").bind(...values, now, itemId));
  }
  if (input.tags) {
    const labels = Array.from(new Set(input.tags.map(normalizeTag).filter(Boolean)));
    statements.push(db.prepare("DELETE FROM item_tags WHERE item_id = ?").bind(itemId));
    labels.forEach((label) => {
      const tagId = "tg-" + label.replace(/[^a-z0-9]+/g, "-");
      statements.push(db.prepare("INSERT OR IGNORE INTO task_tags (id, label, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(tagId, label, tagColor(label), now, now));
      statements.push(db.prepare("INSERT OR IGNORE INTO item_tags (item_id, tag_id) SELECT ?, id FROM task_tags WHERE label = ?").bind(itemId, label));
    });
  }
  if (input.assigneeIds) {
    statements.push(db.prepare("DELETE FROM item_assignees WHERE item_id = ?").bind(itemId));
    Array.from(new Set(input.assigneeIds)).forEach((userId) => {
      statements.push(db.prepare("INSERT OR IGNORE INTO item_assignees (item_id, user_id, assigned_at) VALUES (?, ?, ?)").bind(itemId, userId, now));
    });
  }
  if (input.fieldValues) {
    Object.entries(input.fieldValues).forEach(([fieldId, value]) => {
      statements.push(
        value === null || value === undefined || value === ""
          ? db.prepare("DELETE FROM item_field_values WHERE item_id = ? AND field_id = ?").bind(itemId, fieldId)
          : db.prepare("INSERT INTO item_field_values (item_id, field_id, value_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(item_id, field_id) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at")
            .bind(itemId, fieldId, JSON.stringify(value), now)
      );
    });
  }
  if (statements.length) await db.batch(statements);
}

export async function archiveItem(itemId: string): Promise<void> {
  const now = nowIso();
  await getDatabase().prepare("UPDATE items SET archived_at = ?, updated_at = ? WHERE id = ? OR parent_id = ?").bind(now, now, itemId, itemId).run();
}

export async function addComment(input: { itemId: string; body: string; userId: string }): Promise<void> {
  const now = nowIso();
  await getDatabase().prepare("INSERT INTO item_comments (id, item_id, author_user_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), input.itemId, input.userId, input.body.trim(), now, now).run();
}

export async function addChecklist(input: { itemId: string; name: string }): Promise<string> {
  const id = crypto.randomUUID();
  await getDatabase().prepare("INSERT INTO item_checklists (id, item_id, name, display_order) VALUES (?, ?, ?, (SELECT COALESCE(MAX(display_order), -1) + 1 FROM item_checklists WHERE item_id = ?))")
    .bind(id, input.itemId, input.name.trim(), input.itemId).run();
  return id;
}

export async function addChecklistEntry(input: { checklistId: string; label: string }): Promise<string> {
  const id = crypto.randomUUID();
  await getDatabase().prepare("INSERT INTO item_checklist_entries (id, checklist_id, label, done, display_order) VALUES (?, ?, ?, 0, (SELECT COALESCE(MAX(display_order), -1) + 1 FROM item_checklist_entries WHERE checklist_id = ?))")
    .bind(id, input.checklistId, input.label.trim(), input.checklistId).run();
  return id;
}

export async function setChecklistEntryDone(entryId: string, done: boolean): Promise<void> {
  await getDatabase().prepare("UPDATE item_checklist_entries SET done = ? WHERE id = ?").bind(done ? 1 : 0, entryId).run();
}

export async function listAssignableUsers(): Promise<Array<{ id: string; fullName: string }>> {
  const result = await getDatabase().prepare("SELECT id, full_name FROM users WHERE suspended_at IS NULL ORDER BY full_name COLLATE NOCASE").all<{ id: string; full_name: string }>();
  return result.results.map((user) => ({ id: user.id, fullName: user.full_name }));
}
