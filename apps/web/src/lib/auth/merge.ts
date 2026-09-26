import { getDatabase } from "@/lib/cloudflare";

// One person, one account.
//
// A member who signs in with their CAP address one week and their personal Google account the next ends up
// with two records, and the Hub treats them as two people: work assigned to one is invisible to the other,
// and - worse - the two can carry different privileges, so which account somebody happens to use decides
// what they are allowed to do. That is an access control fault wearing the costume of a display bug.
//
// Merging is deliberately a decision somebody makes rather than something the Hub does on a matching name.
// Two members really can be called the same thing, and silently combining two people's work would be far
// harder to undo than leaving a duplicate on screen.

/**
 * Every place a user id is recorded, so a merge leaves nothing pointing at the account that goes.
 *
 * Generated from the schema rather than remembered: these are the foreign keys into users. Missing one
 * would strand somebody's work under an account that no longer exists.
 */
const USER_REFERENCES: Array<[table: string, column: string]> = [
  ["users", "approved_by"], ["users", "suspended_by"],
  ["access_requests", "reviewed_by"],
  ["audit_events", "actor_user_id"],
  ["functional_permissions", "user_id"], ["functional_permissions", "granted_by"],
  ["app_settings", "updated_by"],
  ["tasks", "created_by"], ["tasks", "owner_user_id"],
  ["task_comments", "author_user_id"],
  ["compliance_requirements", "created_by"], ["compliance_requirements", "responsible_user_id"],
  ["compliance_completions", "completed_by"],
  ["personnel_members", "user_id"],
  ["task_tags", "created_by"], ["task_tag_assignments", "assigned_by"],
  ["workspace_integrations", "updated_by"],
  ["spaces", "created_by"], ["lists", "created_by"], ["items", "created_by"],
  ["item_assignees", "user_id"],
  ["item_checklist_entries", "assignee_user_id"],
  ["item_comments", "author_user_id"],
  ["item_attachments", "added_by"],
  ["views", "created_by"], ["dashboards", "created_by"], ["automations", "created_by"],
  ["user_connections", "user_id"], ["user_settings", "user_id"],
  ["ai_conversations", "user_id"],
  ["role_duties", "created_by"], ["role_duties", "confirmed_by"],
  ["notification_prefs", "user_id"],
  ["announcements", "sent_by"],
  ["notifications", "user_id"],
  ["capability_requests", "asked_by"],
  ["mail_suggestions", "user_id"],
  ["ai_agents", "owner_user_id"], ["agent_messages", "user_id"],
  ["goals", "owner_user_id"],
  ["item_watchers", "user_id"],
  ["finance_transactions", "approved_by"],
  ["user_mail_accounts", "user_id"],
  ["duty_assignments", "user_id"], ["duty_assignments", "assigned_by"],
  ["user_google_oauth", "user_id"]
];

/** Credentials and sessions are never moved. They belong to the sign-in that created them. */
const DISCARD_FOR_LOSER: string[] = ["sessions", "login_tokens"];

export interface DuplicatePair {
  keep: { id: string; name: string; email: string; role: string; status: string };
  drop: { id: string; name: string; email: string; role: string; status: string };
  /** Why the Hub thinks these are one person. Stated, so somebody can disagree with it. */
  because: string;
}

function normaliseName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

/** First and last name, so "Mel Osborne" and "Mel W Osborne" are recognised as the same person. */
function endsOf(value: string): string {
  const parts = normaliseName(value).split(" ");
  if (parts.length < 2) return normaliseName(value);
  return parts[0] + " " + parts[parts.length - 1];
}

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  global_role: string;
  status: string;
  created_at: string;
}

/**
 * Accounts that look like the same person, with the one to keep chosen but not acted on.
 *
 * The approved account wins over a pending one, and an older account wins over a newer one, because the
 * older is the one other records already point at. Neither rule is applied without somebody agreeing.
 */
export async function findDuplicates(): Promise<DuplicatePair[]> {
  const rows = await getDatabase()
    .prepare("SELECT id, full_name, email, global_role, status, created_at FROM users WHERE status NOT IN ('ARCHIVED') ORDER BY created_at")
    .all<UserRow>();

  const byName = new Map<string, UserRow[]>();
  rows.results.forEach((row) => {
    const key = endsOf(row.full_name);
    if (!key) return;
    byName.set(key, [...(byName.get(key) ?? []), row]);
  });

  const pairs: DuplicatePair[] = [];
  byName.forEach((group) => {
    if (group.length < 2) return;
    // Approved before pending, then oldest first: the account most of the Hub already refers to.
    const ordered = [...group].sort((left, right) => {
      const leftApproved = left.status === "APPROVED" ? 0 : 1;
      const rightApproved = right.status === "APPROVED" ? 0 : 1;
      if (leftApproved !== rightApproved) return leftApproved - rightApproved;
      return left.created_at.localeCompare(right.created_at);
    });
    const keep = ordered[0];
    ordered.slice(1).forEach((drop) => {
      pairs.push({
        keep: { id: keep.id, name: keep.full_name, email: keep.email, role: keep.global_role, status: keep.status },
        drop: { id: drop.id, name: drop.full_name, email: drop.email, role: drop.global_role, status: drop.status },
        because: keep.global_role !== drop.global_role
          ? "Same name, two accounts, and they carry different privileges — " +
            keep.global_role.replace(/_/g, " ").toLowerCase() + " and " + drop.global_role.replace(/_/g, " ").toLowerCase() +
            ". Which account they sign in with decides what they can do."
          : "Same name, two accounts, two email addresses. Work assigned to one is invisible to the other."
      });
    });
  });

  return pairs;
}

/**
 * Moves everything from one account onto another and removes the account that goes.
 *
 * UPDATE OR IGNORE does the work: where the account being kept already has the equivalent row - both are
 * assigned the same task, both have a notification preference - the move is skipped rather than failing on
 * a unique constraint, and the leftover is deleted afterwards. The result either way is one row, on the
 * account that stays.
 */
export async function mergeUsers(input: { keepId: string; dropId: string }): Promise<{ moved: number }> {
  if (input.keepId === input.dropId) throw new Error("That is the same account twice.");
  const db = getDatabase();

  const keep = await db.prepare("SELECT id FROM users WHERE id = ?").bind(input.keepId).first<{ id: string }>();
  const drop = await db.prepare("SELECT id FROM users WHERE id = ?").bind(input.dropId).first<{ id: string }>();
  if (!keep || !drop) throw new Error("One of those accounts is already gone.");

  let moved = 0;
  for (const [table, column] of USER_REFERENCES) {
    try {
      const result = await db
        .prepare("UPDATE OR IGNORE " + table + " SET " + column + " = ? WHERE " + column + " = ?")
        .bind(input.keepId, input.dropId)
        .run();
      moved += result.meta?.changes ?? 0;
      // Anything that could not move because the kept account already had it.
      await db.prepare("DELETE FROM " + table + " WHERE " + column + " = ?").bind(input.dropId).run();
    } catch {
      // A table that does not exist in this database yet is not a reason to abandon the merge.
      continue;
    }
  }

  for (const table of DISCARD_FOR_LOSER) {
    try {
      await db.prepare("DELETE FROM " + table + " WHERE user_id = ?").bind(input.dropId).run();
    } catch {
      continue;
    }
  }

  await db.prepare("DELETE FROM users WHERE id = ?").bind(input.dropId).run();
  return { moved };
}
