import { getDatabase } from "@/lib/cloudflare";
import { loadDashboardItems } from "@/lib/work/dashboards";

// An agent looking at what it watches, on its own, and saying what it found.
//
// Deliberately narrow. A scheduled run reports; it never creates, assigns, moves or deletes anything. The
// whole reason an agent is safe to leave running is that the worst it can do is be wrong in a message
// somebody can ignore. Anything that changes the squadron's work still goes through a plan a person
// confirms.
//
// The findings are counted, not written by a model. A watcher that says "three overdue, one unowned" is
// useful and checkable; one that writes prose about the state of the squadron is neither.

export interface AgentMessage {
  id: string;
  agentId: string;
  agentName: string;
  agentEmoji: string;
  title: string;
  body: string;
  url: string | null;
  readAt: string | null;
  createdAt: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Unread counts per agent, for the badges in the sidebar. */
export async function unreadByAgent(userId: string): Promise<Record<string, number>> {
  try {
    const rows = await getDatabase()
      .prepare("SELECT agent_id, COUNT(*) AS unread FROM agent_messages WHERE user_id = ? AND read_at IS NULL GROUP BY agent_id")
      .bind(userId)
      .all<{ agent_id: string; unread: number }>();
    const counts: Record<string, number> = {};
    rows.results.forEach((row) => { counts[row.agent_id] = row.unread; });
    return counts;
  } catch {
    return {};
  }
}

export async function messagesFor(userId: string, agentId: string, limit = 30): Promise<AgentMessage[]> {
  try {
    const rows = await getDatabase()
      .prepare(
        "SELECT m.id, m.agent_id, m.title, m.body, m.url, m.read_at, m.created_at, a.name AS agent_name, a.emoji AS agent_emoji " +
        "FROM agent_messages m JOIN ai_agents a ON a.id = m.agent_id " +
        "WHERE m.user_id = ? AND m.agent_id = ? ORDER BY m.created_at DESC LIMIT ?"
      )
      .bind(userId, agentId, limit)
      .all<Record<string, unknown>>();
    return rows.results.map((row) => ({
      id: row.id as string,
      agentId: row.agent_id as string,
      agentName: row.agent_name as string,
      agentEmoji: (row.agent_emoji as string) || "🤖",
      title: row.title as string,
      body: row.body as string,
      url: (row.url as string | null) ?? null,
      readAt: (row.read_at as string | null) ?? null,
      createdAt: row.created_at as string
    }));
  } catch {
    return [];
  }
}

export async function markRead(userId: string, agentId: string): Promise<void> {
  await getDatabase()
    .prepare("UPDATE agent_messages SET read_at = ? WHERE user_id = ? AND agent_id = ? AND read_at IS NULL")
    .bind(new Date().toISOString(), userId, agentId)
    .run();
}

async function say(input: { agentId: string; userId: string; title: string; body: string; url?: string | null; dedupe: string }): Promise<boolean> {
  try {
    await getDatabase()
      .prepare(
        "INSERT OR IGNORE INTO agent_messages (id, agent_id, user_id, title, body, url, dedupe_key, created_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(crypto.randomUUID(), input.agentId, input.userId, input.title, input.body, input.url ?? null, input.dedupe, new Date().toISOString())
      .run();
    return true;
  } catch {
    return false;
  }
}

interface RunnableAgent {
  id: string;
  name: string;
  owner_user_id: string | null;
  scope_type: "list" | "space" | null;
  scope_id: string | null;
}

/**
 * Runs every agent that is due, and returns how many things were said.
 *
 * An agent with no schedule is never run. An agent with no scope watches the whole squadron; one scoped to
 * a list or department watches only that, which is the point of giving it a scope.
 */
export async function runDueAgents(): Promise<{ ran: number; said: number }> {
  const db = getDatabase();
  let agents: RunnableAgent[] = [];
  try {
    const rows = await db
      .prepare(
        "SELECT id, name, owner_user_id, scope_type, scope_id FROM ai_agents " +
        "WHERE schedule = 'DAILY' AND (last_run_at IS NULL OR substr(last_run_at, 1, 10) < ?)"
      )
      .bind(today())
      .all<RunnableAgent>();
    agents = rows.results;
  } catch {
    return { ran: 0, said: 0 };
  }
  if (!agents.length) return { ran: 0, said: 0 };

  const items = await loadDashboardItems().catch(() => []);
  const stamp = today();
  let said = 0;

  for (const agent of agents) {
    // Who hears it: the owner of a personal agent, or everybody with an account for a shared one.
    let audience: string[] = [];
    if (agent.owner_user_id) {
      audience = [agent.owner_user_id];
    } else {
      const people = await db
        .prepare("SELECT id FROM users WHERE status = 'APPROVED'")
        .all<{ id: string }>()
        .catch(() => ({ results: [] as Array<{ id: string }> }));
      audience = people.results.map((row) => row.id);
    }

    const watched = items.filter((item) => {
      if (item.closed) return false;
      if (agent.scope_type === "list") return item.listId === agent.scope_id;
      return true; // no scope, or a department: the whole squadron's work
    });

    const late = watched.filter((item) => item.dueOn && item.dueOn < stamp);
    const unowned = watched.filter((item) => item.dueOn && !item.assigneeIds.length);
    if (!late.length && !unowned.length) {
      await db.prepare("UPDATE ai_agents SET last_run_at = ? WHERE id = ?").bind(new Date().toISOString(), agent.id).run();
      continue;
    }

    // Counted, not composed. Every number here can be checked against the list it came from.
    const lines = [
      late.length ? late.length + (late.length === 1 ? " thing is overdue" : " things are overdue") : "",
      unowned.length ? unowned.length + (unowned.length === 1 ? " dated thing has no owner" : " dated things have no owner") : ""
    ].filter(Boolean);

    const body = lines.join(", ") + ".\n\n" +
      [...late.slice(0, 5).map((item) => "Overdue: " + item.title + " (due " + item.dueOn + ")"),
       ...unowned.slice(0, 5).map((item) => "No owner: " + item.title + " (due " + item.dueOn + ")")].join("\n");

    for (const userId of audience) {
      if (await say({
        agentId: agent.id,
        userId,
        title: lines.join(" and "),
        body,
        url: agent.scope_type === "list" && agent.scope_id ? "/lists/" + agent.scope_id : "/tasks?due=overdue",
        dedupe: stamp
      })) said += 1;
    }

    await db.prepare("UPDATE ai_agents SET last_run_at = ? WHERE id = ?").bind(new Date().toISOString(), agent.id).run();
  }

  return { ran: agents.length, said };
}
