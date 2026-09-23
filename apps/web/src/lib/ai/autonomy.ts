import { getDatabase } from "@/lib/cloudflare";

// How much the assistant is allowed to do on its own. This is the member's own setting, because the right
// answer differs by person: a commander who lives in the Hub wants it to just build the thing, and someone
// who joined last week wants to see what it intends first.
//
// Nothing here lets the assistant exceed what that member could do by hand - it is about approval, not power.

export type AutonomyLevel = "SUGGEST" | "CONFIRM" | "BUILD";

export const AUTONOMY_LABELS: Record<AutonomyLevel, { title: string; detail: string }> = {
  SUGGEST: {
    title: "Show me what it would do",
    detail: "The assistant writes the plan. Nothing happens until you press Build."
  },
  CONFIRM: {
    title: "Ask once, then build",
    detail: "You approve the whole plan in one click. Best for most people."
  },
  BUILD: {
    title: "Just build it and tell me",
    detail: "Small, safe changes happen straight away. Anything that deletes or reassigns still asks."
  }
};

export const DEFAULT_AUTONOMY: AutonomyLevel = "CONFIRM";

export async function getAutonomy(userId: string): Promise<AutonomyLevel> {
  try {
    const row = await getDatabase()
      .prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'ai_autonomy'")
      .bind(userId)
      .first<{ value: string }>();
    const value = row?.value;
    return value === "SUGGEST" || value === "CONFIRM" || value === "BUILD" ? value : DEFAULT_AUTONOMY;
  } catch {
    return DEFAULT_AUTONOMY;
  }
}

export async function setAutonomy(userId: string, level: AutonomyLevel): Promise<void> {
  await getDatabase()
    .prepare(
      "INSERT INTO user_settings (user_id, key, value, updated_at) VALUES (?, 'ai_autonomy', ?, ?) " +
      "ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
    .bind(userId, level, new Date().toISOString())
    .run();
}

/**
 * Steps that change the shape of the squadron's workspace, rather than adding to it. Even on the most
 * permissive setting these are confirmed, because undoing a deleted list is not a one-click job.
 */
const ALWAYS_CONFIRM = new Set(["delete_field", "archive_list", "assign_person", "create_automation"]);

export function needsConfirmation(level: AutonomyLevel, stepTypes: string[]): boolean {
  if (level !== "BUILD") return true;
  return stepTypes.some((type) => ALWAYS_CONFIRM.has(type));
}
