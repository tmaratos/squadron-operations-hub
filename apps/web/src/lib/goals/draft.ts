import { aiChatFor } from "@/lib/ai/provider";
import { getWorkspaceTree } from "@/lib/work/structure";
import { listGoals, type Horizon } from "@/lib/goals/goals";

// Describing a goal out loud, and getting something real back.
//
// Setting up a goal by hand meant a name, a horizon, a date, then targets one at a time, each with a kind
// and a source - which is a lot of form for something somebody can say in a sentence. So they say the
// sentence and the Hub proposes the rest.
//
// The rule this file exists to enforce: the assistant proposes and a person decides. Nothing here writes
// anything. It returns a draft, every field of it editable, together with a list of what could and could not
// be checked - and the checking is done here in code, against the squadron's real lists and goals, not by
// asking the model whether it is confident. A model's confidence is not evidence.

export interface DraftStep {
  title: string;
  /** Suggested, never applied without a person seeing it. */
  dueOn: string | null;
  /** Which list the task would be made in. Resolved here against real lists; null when nothing matched. */
  listId: string | null;
  listName: string | null;
}

export interface GoalDraft {
  name: string;
  detail: string | null;
  horizon: Horizon;
  targetDate: string | null;
  steps: DraftStep[];
}

export type CheckTone = "OK" | "WARN";

export interface Check {
  tone: CheckTone;
  says: string;
}

export interface DraftResult {
  draft: GoalDraft;
  checks: Check[];
}

const SYSTEM = [
  "You turn a Civil Air Patrol squadron officer's description of a goal into a structured draft.",
  "Reply with JSON only, no prose, in this exact shape:",
  '{"name": string, "detail": string, "horizon": "SHORT" | "LONG", "targetDate": "YYYY-MM-DD" or null, "steps": [{"title": string, "dueOn": "YYYY-MM-DD" or null, "list": string or null}]}',
  "",
  "name: short, what is to be true when this is achieved. Not a task.",
  "detail: one or two sentences on what counts as done.",
  "horizon: SHORT if it lands inside this fiscal year, LONG if it is beyond it.",
  "steps: the concrete jobs somebody has to do. Between two and eight. Each one a real piece of work a person",
  "could pick up, in the order they would happen. Not restatements of the goal.",
  "list: the name of the squadron list the step belongs in, chosen from the list names given to you, or null.",
  "",
  "Do not invent regulation numbers, form numbers, deadlines or award criteria. If the officer did not say a",
  "date, use null rather than guessing one. It is better to leave a field empty than to fill it with something",
  "plausible."
].join("\n");


/**
 * Which real list a name the model produced refers to, if any.
 *
 * Loose matching here was quietly dangerous. Accepting any substring meant a list abbreviated "ES" matched
 * the word "files", and a step would be filed somewhere nobody expected without anybody being told - the
 * worst kind of wrong, because it looks like it worked. A short name now has to match exactly, and a longer
 * one has to line up on a word boundary.
 */
export function matchList<T extends { name: string }>(wanted: string, lists: T[]): T | undefined {
  const want = wanted.trim().toLowerCase();
  if (!want) return undefined;

  const exact = lists.find((list) => list.name.trim().toLowerCase() === want);
  if (exact) return exact;

  // Below this length a partial match is a coincidence rather than a reference.
  const words = (value: string) => value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const wantWords = words(want);

  const candidates = lists.filter((list) => {
    const listWords = words(list.name);
    if (!listWords.length || listWords.join("").length < 4) return false;
    // Every word of the list name has to appear in what was asked for, or the other way round.
    return listWords.every((word) => wantWords.includes(word)) || wantWords.every((word) => listWords.includes(word));
  });

  // Two lists it could equally be means it is neither. Better to ask than to guess.
  return candidates.length === 1 ? candidates[0] : undefined;
}

function parseJson(reply: string): Record<string, unknown> | null {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(reply.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + "T12:00:00Z"));
}

/**
 * Turns a sentence into a draft goal, and says what it could not verify.
 *
 * Everything the model returns is treated as a suggestion to be checked, never as fact. List names are
 * matched against real lists; dates are parsed and rejected if they are not dates; anything in the past is
 * flagged rather than quietly accepted; a goal that looks like one the squadron already has is pointed out.
 */
export async function draftGoal(prompt: string, userId: string): Promise<DraftResult> {
  const [spaces, existing] = await Promise.all([
    getWorkspaceTree().catch(() => []),
    listGoals().catch(() => [])
  ]);

  const lists = spaces.flatMap((space) => space.lists.map((list) => ({ id: list.id, name: list.name, spaceName: space.name })));
  const today = new Date().toISOString().slice(0, 10);

  const reply = await aiChatFor(userId, [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: [
        "Today is " + today + ".",
        "The squadron's lists are: " + (lists.map((list) => list.name).join(", ") || "none yet") + ".",
        "",
        "The officer says:",
        prompt.trim().slice(0, 2000)
      ].join("\n")
    }
  ], { json: true, maxTokens: 900 });

  const parsed = parseJson(reply);
  if (!parsed) {
    throw new Error("The assistant did not give back something usable. Try saying it a different way.");
  }

  const checks: Check[] = [];

  const name = typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim().slice(0, 160) : prompt.trim().slice(0, 160);
  const detail = typeof parsed.detail === "string" && parsed.detail.trim() ? parsed.detail.trim().slice(0, 2000) : null;
  const horizon: Horizon = parsed.horizon === "LONG" ? "LONG" : "SHORT";

  let targetDate: string | null = null;
  if (isDate(parsed.targetDate)) {
    targetDate = parsed.targetDate;
    if (targetDate < today) {
      checks.push({ tone: "WARN", says: "The date it suggested, " + targetDate + ", has already passed. Change it before saving." });
    }
  } else if (parsed.targetDate) {
    checks.push({ tone: "WARN", says: "It offered a date that is not a date, so the goal has none. Set one yourself." });
  } else {
    checks.push({ tone: "WARN", says: "No date was set. A goal with no date is never late, so nothing ever chases it." });
  }

  const rawSteps = Array.isArray(parsed.steps) ? parsed.steps : [];
  const steps: DraftStep[] = [];
  let unmatchedLists = 0;
  let droppedDates = 0;

  rawSteps.slice(0, 10).forEach((entry) => {
    const step = entry as Record<string, unknown>;
    const title = typeof step.title === "string" ? step.title.trim().slice(0, 200) : "";
    if (title.length < 3) return;

    // The list is matched against ones that exist. A name the model invented becomes "you choose".
    const wanted = typeof step.list === "string" ? step.list.trim().toLowerCase() : "";
    const match = wanted ? matchList(wanted, lists) : undefined;
    if (wanted && !match) unmatchedLists += 1;

    let dueOn: string | null = null;
    if (isDate(step.dueOn)) {
      dueOn = step.dueOn;
    } else if (step.dueOn) {
      droppedDates += 1;
    }

    steps.push({ title, dueOn, listId: match?.id ?? null, listName: match?.name ?? null });
  });

  if (!steps.length) {
    checks.push({ tone: "WARN", says: "It did not come back with any steps. Add them yourself, or describe the goal with more of what has to happen." });
  } else {
    checks.push({ tone: "OK", says: steps.length + (steps.length === 1 ? " step" : " steps") + " proposed. Each one becomes a real task you can assign and put a date on." });
  }
  if (unmatchedLists) {
    checks.push({ tone: "WARN", says: unmatchedLists + (unmatchedLists === 1 ? " step named a list" : " steps named lists") + " the squadron does not have. Pick where those go." });
  }
  if (droppedDates) {
    checks.push({ tone: "WARN", says: droppedDates + (droppedDates === 1 ? " step had a date" : " steps had dates") + " that were not real dates, so they were left empty." });
  }

  // Something very like this may already exist, which is worth saying before a second copy is made.
  const near = existing.find((goal) => {
    const left = goal.name.toLowerCase();
    const right = name.toLowerCase();
    return left === right || left.includes(right) || right.includes(left);
  });
  if (near) {
    checks.push({ tone: "WARN", says: "The squadron already has a goal called “" + near.name + "”. This may be the same thing twice." });
  }

  checks.push({
    tone: "OK",
    says: "Nothing has been created. Change anything you like below, and it is only real once you press the button."
  });

  return { draft: { name, detail, horizon, targetDate, steps }, checks };
}
