import { aiChatFor } from "@/lib/ai/provider";
import { findPassages, knowledgeSize, type Passage } from "@/lib/regs/knowledge";

// Filling in what a goal actually requires, from the regulation that requires it.
//
// A Subordinate Unit Inspection has a published checklist. So does the Quality Cadet Unit Award. Asking a
// member to type those out one "+ Add a step" at a time is asking them to copy a document the squadron
// already has into a form, and it is the reason those goals sit at nothing per cent with no steps under them.
//
// The rule here is the one the development ladder already follows, for the same reason: nothing is invented.
// Every step comes from a passage in the squadron's own documents and carries the document it came from, so a
// member can check it. A model asked about SUI criteria from memory will produce a confident, plausible and
// wrong list - right shape, invented particulars - and a squadron would prepare against it for months.
//
// Which means this returns nothing rather than something when the library has nothing to say. An empty answer
// is a fact about the library and can be fixed by reading more documents; a fabricated checklist looks exactly
// like a real one and cannot be spotted at all.

export interface Benchmark {
  title: string;
  /** The document this came out of, shown beside it. Never null: a step with no source is not returned. */
  source: string;
  webViewLink: string | null;
  /** The sentence it was drawn from, so somebody can see the working. */
  quote: string;
}

export interface BenchmarkResult {
  benchmarks: Benchmark[];
  /** Said plainly to the member when there is nothing to offer, with the reason. */
  message: string;
  /** What was searched, so an empty result is explainable rather than mysterious. */
  documentsSearched: number;
}

const SYSTEM = [
  "You turn passages from Civil Air Patrol regulations into the checklist a squadron would work through.",
  "",
  "Rules, in order of importance:",
  "1. Use ONLY what the passages say. If a passage does not state a requirement, it does not become a step.",
  "2. Never supply a form number, a deadline, a percentage or a frequency that is not written in the passages.",
  "3. Quote the sentence each step came from, exactly, from the passage text.",
  "4. If the passages do not describe requirements for this goal, return an empty list. That is a correct answer.",
  "",
  "Each step is one thing somebody can do and then tick off. Write it as an instruction, not a topic:",
  "'Confirm every senior member has a current Level I' rather than 'Level I'.",
  "",
  'Reply as JSON: {"steps":[{"title":"...","quote":"...","from":"<document name exactly as given>"}]}'
].join("\n");

/**
 * Proposes the steps a goal needs, from the regulations.
 *
 * Nothing is written. The caller shows these to a person, who decides - the same contract as goal drafting.
 */
export async function benchmarksFor(input: {
  userId: string;
  goalName: string;
  goalDetail?: string | null;
}): Promise<BenchmarkResult> {
  const size = await knowledgeSize();

  if (!size.passages) {
    return {
      benchmarks: [],
      documentsSearched: 0,
      message:
        "The Hub has not read the squadron's documents yet, so there is nothing to draw this from. Open Docs " +
        "and read the Shared Drive, and this will have the regulations to work from."
    };
  }

  // The goal's own words are the query. A goal named "Pass the next Subordinate Unit Inspection" carries the
  // terms the regulation uses; a member does not have to know which document to look in.
  const question = [input.goalName, input.goalDetail ?? ""].filter(Boolean).join(" ");
  const passages = await findPassages(question, 8);

  if (!passages.length) {
    return {
      benchmarks: [],
      documentsSearched: size.documents,
      message:
        "Nothing in the " + size.documents + " document" + (size.documents === 1 ? "" : "s") +
        " the Hub has read mentions this. Either the regulation that covers it is not in the Shared Drive, or " +
        "the goal is worded differently from the document. Adding the steps by hand is the honest option here."
    };
  }

  const answer = await aiChatFor(
    input.userId,
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content:
          "Goal: " + input.goalName +
          (input.goalDetail ? "\nWhat it means: " + input.goalDetail : "") +
          "\n\nPassages from the squadron's documents:\n\n" +
          passages.map((passage, at) => "[" + (at + 1) + "] " + passage.documentName + "\n" + passage.text).join("\n\n---\n\n")
      }
    ],
    { json: true, maxTokens: 1600 }
  );

  const proposed = readSteps(answer);
  const benchmarks = keepOnlyGrounded(proposed, passages);

  return {
    benchmarks,
    documentsSearched: size.documents,
    message: benchmarks.length
      ? benchmarks.length + " step" + (benchmarks.length === 1 ? "" : "s") +
        " drawn from the squadron's documents. Each shows where it came from — check them before adding."
      : "The passages the Hub found do not set out requirements for this. Nothing has been made up to fill the gap."
  };
}

interface Proposed {
  title?: unknown;
  quote?: unknown;
  from?: unknown;
}

function readSteps(answer: string): Proposed[] {
  try {
    const parsed = JSON.parse(answer) as { steps?: unknown };
    return Array.isArray(parsed.steps) ? (parsed.steps as Proposed[]) : [];
  } catch {
    return [];
  }
}

/**
 * Throws away anything the passages do not actually support.
 *
 * This is the part that matters, and it is done in code rather than by trusting the instruction above. A model
 * told not to invent things will still occasionally invent one, and it will look exactly like the others. So
 * every proposed step has to name a real document and quote text that is genuinely in it - a quote the model
 * composed itself will not be found, and the step goes.
 */
function keepOnlyGrounded(proposed: Proposed[], passages: Passage[]): Benchmark[] {
  const kept: Benchmark[] = [];
  const seen = new Set<string>();

  for (const step of proposed) {
    const title = typeof step.title === "string" ? step.title.trim() : "";
    const quote = typeof step.quote === "string" ? step.quote.trim() : "";
    const from = typeof step.from === "string" ? step.from.trim() : "";
    if (!title || !quote || title.length > 200) continue;

    // Matched loosely on whitespace and case only - a model reflowing a line out of a PDF is not the failure
    // being guarded against here, and being strict about spacing would throw away true steps along with false
    // ones. Inventing a sentence is what this catches, and a made-up sentence matches nothing.
    const needle = normalise(quote);
    if (needle.length < 25) continue;

    const source = passages.find((passage) => normalise(passage.text).includes(needle));
    if (!source) continue;
    if (from && normalise(from) !== normalise(source.documentName)) {
      // It quoted one document and credited another. Both cannot be right, and there is no way to tell which.
      continue;
    }

    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    kept.push({
      title,
      source: source.documentName,
      webViewLink: source.webViewLink,
      quote: quote.length > 400 ? quote.slice(0, 400) + "…" : quote
    });
  }

  return kept;
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}
