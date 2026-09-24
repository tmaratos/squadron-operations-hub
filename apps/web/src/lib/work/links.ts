import { getDatabase } from "@/lib/cloudflare";
import { loadDashboardItems, type DashboardItem } from "@/lib/work/dashboards";

// What one task means for another, and the contradictions that follow from it.
//
// The contradictions here are arithmetic, not judgement. Every one of them is a statement about dates and
// direction that can be checked against the two tasks it names, and a member can see for themselves
// whether it is right. That is deliberate: a checker that offers opinions is a machine for sounding
// authoritative, and the squadron would learn to scroll past it.

export type LinkKind = "BLOCKS" | "RELATES";

export interface ItemLink {
  id: string;
  kind: LinkKind;
  /** From the point of view of the task being looked at. */
  direction: "blocking" | "blockedBy" | "related";
  otherId: string;
  otherTitle: string;
  otherListId: string;
  otherListName: string;
  otherDueOn: string | null;
  otherClosed: boolean;
}

export interface Contradiction {
  kind: "ORDER" | "CYCLE" | "DONE_BEFORE_BLOCKER" | "SAME_DAY";
  /** Said plainly enough that somebody can agree or disagree with it. */
  text: string;
  itemIds: string[];
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function addLink(input: { fromItemId: string; toItemId: string; kind: LinkKind; userId: string }): Promise<void> {
  if (input.fromItemId === input.toItemId) return; // a task does not block itself
  await getDatabase()
    .prepare("INSERT OR IGNORE INTO item_links (id, from_item_id, to_item_id, kind, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), input.fromItemId, input.toItemId, input.kind, input.userId, nowIso())
    .run();
}

export async function removeLink(linkId: string): Promise<void> {
  await getDatabase().prepare("DELETE FROM item_links WHERE id = ?").bind(linkId).run();
}

/** Every link touching this task, said from its point of view. */
export async function linksFor(itemId: string): Promise<ItemLink[]> {
  try {
    const rows = await getDatabase()
      .prepare(
        "SELECT l.id, l.kind, l.from_item_id, l.to_item_id, " +
        "i.id AS other_id, i.title AS other_title, i.list_id AS other_list_id, i.due_on AS other_due, " +
        "lists.name AS other_list_name, s.category AS other_category " +
        "FROM item_links l " +
        "JOIN items i ON i.id = CASE WHEN l.from_item_id = ?1 THEN l.to_item_id ELSE l.from_item_id END " +
        "JOIN lists ON lists.id = i.list_id " +
        "LEFT JOIN list_statuses s ON s.id = i.status_id " +
        "WHERE (l.from_item_id = ?1 OR l.to_item_id = ?1) AND i.archived_at IS NULL"
      )
      .bind(itemId)
      .all<Record<string, unknown>>();

    return rows.results.map((row) => {
      const kind = row.kind as LinkKind;
      const isFrom = row.from_item_id === itemId;
      return {
        id: row.id as string,
        kind,
        direction: kind === "RELATES" ? "related" : isFrom ? "blocking" : "blockedBy",
        otherId: row.other_id as string,
        otherTitle: row.other_title as string,
        otherListId: row.other_list_id as string,
        otherListName: row.other_list_name as string,
        otherDueOn: (row.other_due as string | null) ?? null,
        otherClosed: ["DONE", "CLOSED"].includes((row.other_category as string) ?? "")
      };
    });
  } catch {
    return [];
  }
}

/**
 * Everything the recorded links contradict.
 *
 * Only what follows arithmetically from the links and the dates. Nothing here is a guess about whether a
 * plan is wise, because that is the squadron's business and not the Hub's.
 */
export async function contradictions(): Promise<Contradiction[]> {
  const db = getDatabase();
  let links: Array<{ from_item_id: string; to_item_id: string; kind: LinkKind }> = [];
  try {
    const rows = await db.prepare("SELECT from_item_id, to_item_id, kind FROM item_links").all<{ from_item_id: string; to_item_id: string; kind: LinkKind }>();
    links = rows.results;
  } catch {
    return [];
  }

  const items = await loadDashboardItems().catch(() => [] as DashboardItem[]);
  const byId = new Map(items.map((item) => [item.id, item]));
  const found: Contradiction[] = [];
  const name = (id: string) => byId.get(id)?.title ?? "a task that is gone";

  const blocks = links.filter((link) => link.kind === "BLOCKS");

  for (const link of blocks) {
    const blocker = byId.get(link.from_item_id);
    const blocked = byId.get(link.to_item_id);
    if (!blocker || !blocked) continue;

    // A blocker due after the thing it blocks cannot be met in the order recorded.
    if (blocker.dueOn && blocked.dueOn && blocker.dueOn > blocked.dueOn) {
      found.push({
        kind: "ORDER",
        text: '"' + blocker.title + '" has to happen before "' + blocked.title + '", but it is due ' +
          blocker.dueOn + " and that one is due " + blocked.dueOn + ". One of the two dates is wrong.",
        itemIds: [blocker.id, blocked.id]
      });
    }

    // Something finished while the thing that had to come first is still open.
    if (blocked.closed && !blocker.closed) {
      found.push({
        kind: "DONE_BEFORE_BLOCKER",
        text: '"' + blocked.title + '" is marked finished, but "' + blocker.title + '" was supposed to come first and is still open.',
        itemIds: [blocked.id, blocker.id]
      });
    }
  }

  // A loop: each waiting on the other, so neither can ever start.
  const forward = new Map<string, string[]>();
  blocks.forEach((link) => forward.set(link.from_item_id, [...(forward.get(link.from_item_id) ?? []), link.to_item_id]));
  const seen = new Set<string>();
  for (const start of forward.keys()) {
    const stack: Array<{ id: string; path: string[] }> = [{ id: start, path: [start] }];
    while (stack.length) {
      const here = stack.pop()!;
      for (const next of forward.get(here.id) ?? []) {
        if (next === start) {
          const key = [...here.path, next].sort().join("|");
          if (!seen.has(key)) {
            seen.add(key);
            found.push({
              kind: "CYCLE",
              text: "These wait on each other in a loop, so none of them can start: " + here.path.map(name).map((title) => '"' + title + '"').join(" → ") + ".",
              itemIds: here.path
            });
          }
          continue;
        }
        if (here.path.includes(next) || here.path.length > 8) continue;
        stack.push({ id: next, path: [...here.path, next] });
      }
    }
  }

  // Two things recorded as bearing on each other, falling on the same day.
  for (const link of links.filter((entry) => entry.kind === "RELATES")) {
    const left = byId.get(link.from_item_id);
    const right = byId.get(link.to_item_id);
    if (!left || !right || left.closed || right.closed) continue;
    if (left.dueOn && left.dueOn === right.dueOn) {
      found.push({
        kind: "SAME_DAY",
        text: '"' + left.title + '" and "' + right.title + '" are both on ' + left.dueOn + ", and they are recorded as bearing on each other.",
        itemIds: [left.id, right.id]
      });
    }
  }

  return found;
}
