import { getDatabase } from "@/lib/cloudflare";
import type { AppliedStep, PlanStep } from "./agent";

// Assistant conversations belong to the member who had them. They are kept for a while so people can look back,
// they can delete any of them at any time, and deleting one never undoes work the assistant already did.

export const RETENTION_DAYS = 60;

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  expiresAt: string;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  steps: PlanStep[] | null;
  applied: AppliedStep[] | null;
  createdAt: string;
}

function parse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function isMissingTable(error: unknown): boolean {
  return error instanceof Error && /no such table/i.test(error.message);
}

// Removes conversations past their keep-until date. Called whenever a member opens the assistant.
export async function purgeExpired(userId: string): Promise<void> {
  try {
    await getDatabase().prepare("DELETE FROM ai_conversations WHERE user_id = ? AND expires_at < ?").bind(userId, new Date().toISOString()).run();
  } catch (error) {
    if (!isMissingTable(error)) throw error;
  }
}

export async function listConversations(userId: string, limit = 20): Promise<ConversationSummary[]> {
  try {
    const result = await getDatabase()
      .prepare("SELECT id, title, updated_at, expires_at FROM ai_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?")
      .bind(userId, limit)
      .all<{ id: string; title: string; updated_at: string; expires_at: string }>();
    return result.results.map((row) => ({ id: row.id, title: row.title, updatedAt: row.updated_at, expiresAt: row.expires_at }));
  } catch (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
}

export async function readConversation(conversationId: string, userId: string): Promise<ConversationMessage[]> {
  try {
    const owned = await getDatabase().prepare("SELECT id FROM ai_conversations WHERE id = ? AND user_id = ?").bind(conversationId, userId).first<{ id: string }>();
    if (!owned) return [];
    const result = await getDatabase()
      .prepare("SELECT id, role, content, plan_json, applied_json, created_at FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 100")
      .bind(conversationId)
      .all<{ id: string; role: ConversationMessage["role"]; content: string; plan_json: string | null; applied_json: string | null; created_at: string }>();
    return result.results.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      steps: parse<PlanStep[]>(row.plan_json),
      applied: parse<AppliedStep[]>(row.applied_json),
      createdAt: row.created_at
    }));
  } catch (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
}

export async function ensureConversation(userId: string, conversationId: string | null, title: string): Promise<string> {
  const db = getDatabase();
  const now = new Date();
  const nowIso = now.toISOString();
  const expires = new Date(now.getTime() + RETENTION_DAYS * 86400000).toISOString();

  if (conversationId) {
    const owned = await db.prepare("SELECT id FROM ai_conversations WHERE id = ? AND user_id = ?").bind(conversationId, userId).first<{ id: string }>();
    if (owned) {
      await db.prepare("UPDATE ai_conversations SET updated_at = ?, expires_at = ? WHERE id = ?").bind(nowIso, expires, conversationId).run();
      return conversationId;
    }
  }

  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO ai_conversations (id, user_id, title, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, userId, title.slice(0, 100) || "New conversation", nowIso, nowIso, expires)
    .run();
  return id;
}

export async function addMessage(input: {
  conversationId: string;
  role: ConversationMessage["role"];
  content: string;
  steps?: PlanStep[] | null;
  applied?: AppliedStep[] | null;
}): Promise<void> {
  await getDatabase()
    .prepare("INSERT INTO ai_messages (id, conversation_id, role, content, plan_json, applied_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(
      crypto.randomUUID(),
      input.conversationId,
      input.role,
      input.content.slice(0, 8000),
      input.steps ? JSON.stringify(input.steps) : null,
      input.applied ? JSON.stringify(input.applied) : null,
      new Date().toISOString()
    )
    .run();
}

// Deletes the chat record only. Tasks, lists and dashboard cards the assistant created are left untouched.
export async function deleteConversation(conversationId: string, userId: string): Promise<boolean> {
  const result = await getDatabase().prepare("DELETE FROM ai_conversations WHERE id = ? AND user_id = ?").bind(conversationId, userId).run();
  return Boolean(result.meta?.changes);
}
