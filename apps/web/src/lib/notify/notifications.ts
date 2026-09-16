import { getDatabase } from "@/lib/cloudflare";

// Telling people things they are responsible for. Every notice is stored once and shown in the Hub;
// email is a delivery of the same row, never a separate stream, so the two can never disagree.

export type NotificationKind = "ASSIGNED" | "COMMENT" | "DUE_SOON" | "OVERDUE" | "STATUS" | "MENTION";

export interface NotificationRecord {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  itemId: string | null;
  listId: string | null;
  url: string | null;
  actorName: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPrefs {
  emailEnabled: boolean;
  onAssigned: boolean;
  onComment: boolean;
  onDueSoon: boolean;
  onOverdue: boolean;
  onStatus: boolean;
  cadence: "IMMEDIATE" | "DAILY";
  leadDays: number;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  emailEnabled: true,
  onAssigned: true,
  onComment: true,
  onDueSoon: true,
  onOverdue: true,
  onStatus: false,
  cadence: "DAILY",
  leadDays: 3
};

const KIND_PREF: Record<NotificationKind, keyof NotificationPrefs> = {
  ASSIGNED: "onAssigned",
  COMMENT: "onComment",
  DUE_SOON: "onDueSoon",
  OVERDUE: "onOverdue",
  STATUS: "onStatus",
  MENTION: "onAssigned"
};

export interface NewNotification {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  itemId?: string | null;
  listId?: string | null;
  url?: string | null;
  actorUserId?: string | null;
  dedupeKey?: string | null;
}

function missingTable(error: unknown): boolean {
  return error instanceof Error && /no such table/i.test(error.message);
}

export async function getPrefs(userId: string): Promise<NotificationPrefs> {
  try {
    const row = await getDatabase()
      .prepare("SELECT email_enabled, on_assigned, on_comment, on_due_soon, on_overdue, on_status, cadence, lead_days FROM notification_prefs WHERE user_id = ?")
      .bind(userId)
      .first<{ email_enabled: number; on_assigned: number; on_comment: number; on_due_soon: number; on_overdue: number; on_status: number; cadence: string; lead_days: number }>();
    if (!row) return DEFAULT_PREFS;
    return {
      emailEnabled: Boolean(row.email_enabled),
      onAssigned: Boolean(row.on_assigned),
      onComment: Boolean(row.on_comment),
      onDueSoon: Boolean(row.on_due_soon),
      onOverdue: Boolean(row.on_overdue),
      onStatus: Boolean(row.on_status),
      cadence: row.cadence === "IMMEDIATE" ? "IMMEDIATE" : "DAILY",
      leadDays: row.lead_days
    };
  } catch (error) {
    if (missingTable(error)) return DEFAULT_PREFS;
    throw error;
  }
}

export async function savePrefs(userId: string, prefs: NotificationPrefs): Promise<void> {
  await getDatabase()
    .prepare(
      "INSERT INTO notification_prefs (user_id, email_enabled, on_assigned, on_comment, on_due_soon, on_overdue, on_status, cadence, lead_days, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET " +
      "email_enabled = excluded.email_enabled, on_assigned = excluded.on_assigned, on_comment = excluded.on_comment, " +
      "on_due_soon = excluded.on_due_soon, on_overdue = excluded.on_overdue, on_status = excluded.on_status, " +
      "cadence = excluded.cadence, lead_days = excluded.lead_days, updated_at = excluded.updated_at"
    )
    .bind(
      userId,
      prefs.emailEnabled ? 1 : 0,
      prefs.onAssigned ? 1 : 0,
      prefs.onComment ? 1 : 0,
      prefs.onDueSoon ? 1 : 0,
      prefs.onOverdue ? 1 : 0,
      prefs.onStatus ? 1 : 0,
      prefs.cadence,
      Math.min(30, Math.max(0, Math.round(prefs.leadDays))),
      new Date().toISOString()
    )
    .run();
}

/**
 * Records notices, skipping anyone who has turned that kind off and anyone being told about their own
 * action. Whether an email follows is decided here too: a member with email off still sees it in the Hub.
 */
export async function notify(notices: NewNotification[]): Promise<void> {
  const wanted = notices.filter((notice) => notice.userId && notice.userId !== notice.actorUserId);
  if (!wanted.length) return;

  const prefsByUser = new Map<string, NotificationPrefs>();
  await Promise.all(
    Array.from(new Set(wanted.map((notice) => notice.userId))).map(async (userId) => {
      prefsByUser.set(userId, await getPrefs(userId));
    })
  );

  const now = new Date().toISOString();
  const db = getDatabase();
  const statements = wanted
    .filter((notice) => {
      const prefs = prefsByUser.get(notice.userId) ?? DEFAULT_PREFS;
      return Boolean(prefs[KIND_PREF[notice.kind]]);
    })
    .map((notice) => {
      const prefs = prefsByUser.get(notice.userId) ?? DEFAULT_PREFS;
      return db
        .prepare(
          "INSERT INTO notifications (id, user_id, kind, title, body, item_id, list_id, url, actor_user_id, dedupe_key, email_state, created_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING"
        )
        .bind(
          crypto.randomUUID(),
          notice.userId,
          notice.kind,
          notice.title.slice(0, 300),
          notice.body?.slice(0, 2000) ?? null,
          notice.itemId ?? null,
          notice.listId ?? null,
          notice.url ?? null,
          notice.actorUserId ?? null,
          notice.dedupeKey ?? null,
          prefs.emailEnabled ? "PENDING" : "SKIPPED",
          now
        );
    });

  if (!statements.length) return;
  try {
    await db.batch(statements);
  } catch (error) {
    // A notice is never worth failing the member's actual save.
    if (!missingTable(error)) console.error(error);
  }
}

export async function listNotifications(userId: string, limit = 50): Promise<NotificationRecord[]> {
  try {
    const result = await getDatabase()
      .prepare(
        "SELECT n.id, n.kind, n.title, n.body, n.item_id, n.list_id, n.url, n.read_at, n.created_at, u.full_name AS actor_name " +
        "FROM notifications n LEFT JOIN users u ON u.id = n.actor_user_id WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT ?"
      )
      .bind(userId, limit)
      .all<{ id: string; kind: NotificationKind; title: string; body: string | null; item_id: string | null; list_id: string | null; url: string | null; read_at: string | null; created_at: string; actor_name: string | null }>();
    return result.results.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      itemId: row.item_id,
      listId: row.list_id,
      url: row.url,
      actorName: row.actor_name,
      readAt: row.read_at,
      createdAt: row.created_at
    }));
  } catch (error) {
    if (missingTable(error)) return [];
    throw error;
  }
}

export async function unreadCount(userId: string): Promise<number> {
  try {
    const row = await getDatabase()
      .prepare("SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND read_at IS NULL")
      .bind(userId)
      .first<{ total: number }>();
    return row?.total ?? 0;
  } catch (error) {
    if (missingTable(error)) return 0;
    throw error;
  }
}

export async function markRead(userId: string, ids?: string[]): Promise<void> {
  const now = new Date().toISOString();
  const db = getDatabase();
  if (ids && ids.length) {
    const placeholders = ids.map(() => "?").join(", ");
    await db
      .prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND id IN (" + placeholders + ")")
      .bind(now, userId, ...ids)
      .run();
    return;
  }
  await db.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL").bind(now, userId).run();
}
