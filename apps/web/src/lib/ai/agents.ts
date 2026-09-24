import { getDatabase } from "@/lib/cloudflare";

// Agents: assistants the squadron keeps, shared or personal.
//
// An agent is a name, what it is for, and standing instructions. Nothing more - it is the same assistant
// underneath, with a brief in front of it. That matters for trust: an agent cannot do anything a member
// could not already ask for, and everything it proposes is still confirmed before it happens.

export interface Agent {
  id: string;
  name: string;
  purpose: string | null;
  brief: string | null;
  emoji: string;
  /** Null when the whole squadron shares it. */
  ownerUserId: string | null;
  ownerName?: string | null;
  shared: boolean;
  /** Whether the member looking at it may change it. */
  canEdit: boolean;
  scopeType: "list" | "space" | null;
  scopeId: string | null;
  scopeName?: string | null;
  /** DAILY, or null when it only answers when spoken to. */
  schedule: string | null;
  lastRunAt: string | null;
  createdBy: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

interface AgentRow {
  id: string;
  name: string;
  purpose: string | null;
  brief: string | null;
  emoji: string;
  owner_user_id: string | null;
  owner_name: string | null;
  scope_type: "list" | "space" | null;
  scope_id: string | null;
  scope_name: string | null;
  schedule: string | null;
  last_run_at: string | null;
  created_by: string;
}

function toAgent(row: AgentRow, userId: string, isAdmin: boolean): Agent {
  return {
    id: row.id,
    name: row.name,
    purpose: row.purpose,
    brief: row.brief,
    emoji: row.emoji || "🤖",
    ownerUserId: row.owner_user_id,
    ownerName: row.owner_name,
    shared: row.owner_user_id === null,
    // Your own agent is yours. A shared one belongs to the squadron, so it is changed by the people who
    // run the Hub rather than by whoever opened it last.
    canEdit: row.owner_user_id === userId || (row.owner_user_id === null && (isAdmin || row.created_by === userId)),
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    scopeName: row.scope_name,
    schedule: row.schedule,
    lastRunAt: row.last_run_at,
    createdBy: row.created_by
  };
}

const SELECT =
  "SELECT a.id, a.name, a.purpose, a.brief, a.emoji, a.owner_user_id, a.scope_type, a.scope_id, a.schedule, a.last_run_at, a.created_by, " +
  "u.full_name AS owner_name, " +
  "COALESCE(l.name, s.name) AS scope_name " +
  "FROM ai_agents a " +
  "LEFT JOIN users u ON u.id = a.owner_user_id " +
  "LEFT JOIN lists l ON a.scope_type = 'list' AND l.id = a.scope_id " +
  "LEFT JOIN spaces s ON a.scope_type = 'space' AND s.id = a.scope_id ";

/** Every agent this member may use: the squadron's, and their own. Never anybody else's private ones. */
export async function listAgents(userId: string, isAdmin = false): Promise<Agent[]> {
  try {
    const rows = await getDatabase()
      .prepare(SELECT + "WHERE a.owner_user_id IS NULL OR a.owner_user_id = ? ORDER BY a.owner_user_id IS NOT NULL, a.name COLLATE NOCASE")
      .bind(userId)
      .all<AgentRow>();
    return rows.results.map((row) => toAgent(row, userId, isAdmin));
  } catch {
    return []; // the table is not there yet
  }
}

export async function getAgent(id: string, userId: string, isAdmin = false): Promise<Agent | null> {
  try {
    const row = await getDatabase()
      .prepare(SELECT + "WHERE a.id = ? AND (a.owner_user_id IS NULL OR a.owner_user_id = ?)")
      .bind(id, userId)
      .first<AgentRow>();
    return row ? toAgent(row, userId, isAdmin) : null;
  } catch {
    return null;
  }
}

export async function createAgent(input: {
  name: string;
  purpose?: string | null;
  brief?: string | null;
  emoji?: string | null;
  shared: boolean;
  scopeType?: "list" | "space" | null;
  scopeId?: string | null;
  schedule?: string | null;
  userId: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  const now = nowIso();
  await getDatabase()
    .prepare(
      "INSERT INTO ai_agents (id, name, purpose, brief, emoji, owner_user_id, scope_type, scope_id, schedule, created_by, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      id,
      input.name.trim().slice(0, 60),
      input.purpose?.trim().slice(0, 160) || null,
      input.brief?.trim().slice(0, 4000) || null,
      input.emoji?.trim().slice(0, 8) || "🤖",
      input.shared ? null : input.userId,
      input.scopeType ?? null,
      input.scopeId ?? null,
      input.schedule ?? null,
      input.userId,
      now,
      now
    )
    .run();
  return id;
}

export async function updateAgent(id: string, input: {
  name?: string;
  purpose?: string | null;
  brief?: string | null;
  emoji?: string | null;
  shared?: boolean;
  scopeType?: "list" | "space" | null;
  scopeId?: string | null;
  schedule?: string | null;
  userId: string;
}): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown) => { sets.push(column + " = ?"); values.push(value); };

  if (input.name !== undefined) set("name", input.name.trim().slice(0, 60));
  if (input.purpose !== undefined) set("purpose", input.purpose?.trim().slice(0, 160) || null);
  if (input.brief !== undefined) set("brief", input.brief?.trim().slice(0, 4000) || null);
  if (input.emoji !== undefined) set("emoji", input.emoji?.trim().slice(0, 8) || "🤖");
  if (input.shared !== undefined) set("owner_user_id", input.shared ? null : input.userId);
  if (input.scopeType !== undefined) set("scope_type", input.scopeType);
  if (input.scopeId !== undefined) set("scope_id", input.scopeId);
  if (input.schedule !== undefined) set("schedule", input.schedule);
  if (!sets.length) return;

  set("updated_at", nowIso());
  values.push(id);
  await getDatabase().prepare("UPDATE ai_agents SET " + sets.join(", ") + " WHERE id = ?").bind(...values).run();
}

export async function deleteAgent(id: string): Promise<void> {
  // Conversations held with it are kept and simply lose the agent, because the record of what was asked
  // and what was approved should outlive the assistant that helped.
  const db = getDatabase();
  await db.prepare("UPDATE ai_conversations SET agent_id = NULL WHERE agent_id = ?").bind(id).run();
  await db.prepare("DELETE FROM ai_agents WHERE id = ?").bind(id).run();
}

/** The standing instructions for an agent, to sit in front of whatever it is asked. */
export async function briefFor(agentId: string | null | undefined): Promise<string> {
  if (!agentId) return "";
  try {
    const row = await getDatabase()
      .prepare("SELECT name, purpose, brief FROM ai_agents WHERE id = ?")
      .bind(agentId)
      .first<{ name: string; purpose: string | null; brief: string | null }>();
    if (!row) return "";
    return [
      "You are " + row.name + ", an assistant this squadron keeps for one job.",
      row.purpose ? "What you are for: " + row.purpose : "",
      row.brief ? "Standing instructions from the squadron:\n" + row.brief : "",
      "These instructions narrow what you do. They never let you skip a confirmation or invent a fact."
    ].filter(Boolean).join("\n");
  } catch {
    return "";
  }
}
