import { getCloudflareEnv, getDatabase } from "@/lib/cloudflare";

// Squadron AI: Cloudflare Workers AI, in the same Cloudflare account that already holds the Hub and its data.
// Task data never goes to an outside AI company.
//
// It used to be Ollama on the squadron's laptop server, reached through the tunnel. Two CPU cores read a
// prompt at about nine tokens a second, so answers took one to five minutes and most of them timed out.
// Workers AI answers in seconds with a far larger model.

// Qwen3 30B (mixture of experts, about 3B active): the same family the laptop ran, at a size it never could.
const DEFAULT_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";

// Background work - reading a regulation - passes this to be given more room to answer. It is the same model:
// what protects the quality of an extraction is the quote check, not the size of the model.
export const CAREFUL_MODEL = DEFAULT_MODEL;

// Qwen3 reasons before it answers, and that is left on. With /no_think it read budget figures backwards and
// followed instructions written into the data it was given. The reasoning comes back in its own field, is
// never shown, and is why every request allows this many tokens beyond the answer itself.
const REASONING_TOKENS = 1500;

// It has to cost the squadron nothing, enforced rather than hoped for, exactly like dictation. Cloudflare gives
// every account 10,000 Neurons a day; dictation keeps itself under about 7,400 of them. This is the rest,
// with room to spare. A task summary or tag suggestion costs about 12 Neurons and a long chat 30 or 40, so
// this is somewhere between fifty and a hundred and fifty answers a day.
const DAILY_BUDGET_NEURONS = 2000;
// Workers AI prices for this model, used when a response does not report what it cost.
const NEURONS_PER_INPUT_TOKEN = 4625 / 1_000_000;
const NEURONS_PER_OUTPUT_TOKEN = 30475 / 1_000_000;

interface WorkersAiEnv {
  AI?: { run: (model: string, input: Record<string, unknown>) => Promise<unknown> };
}

export class LocalAiNotConfiguredError extends Error {
  constructor() {
    super("Squadron AI isn't set up yet. Ask your administrator.");
  }
}

export class AiBudgetSpentError extends Error {
  constructor() {
    super("The squadron has used today's free AI. It resets overnight, or connect your own AI account in My connections.");
  }
}

function env(): WorkersAiEnv {
  return getCloudflareEnv() as unknown as WorkersAiEnv;
}

export function isLocalAiConfigured(): boolean {
  return Boolean(env().AI);
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function neuronsUsedToday(): Promise<number> {
  try {
    const row = await getDatabase().prepare("SELECT chat_neurons FROM ai_usage WHERE day = ?").bind(today()).first<{ chat_neurons: number }>();
    return row?.chat_neurons ?? 0;
  } catch {
    // No column means no migration yet. Counting nothing would make the budget meaningless, so this refuses.
    return Number.POSITIVE_INFINITY;
  }
}

async function addNeurons(neurons: number): Promise<void> {
  try {
    await getDatabase()
      .prepare(
        "INSERT INTO ai_usage (day, chat_neurons, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(day) DO UPDATE SET chat_neurons = chat_neurons + excluded.chat_neurons, updated_at = excluded.updated_at"
      )
      .bind(today(), neurons, new Date().toISOString())
      .run();
  } catch { /* the budget is best effort; the daily check above is the stop */ }
}

interface Completion {
  choices?: { message?: { content?: unknown }; finish_reason?: unknown }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; neurons?: number };
}

/** What a response cost, erring upwards: the larger of what it reports and what its tokens price at. */
function neuronsSpent(usage: Completion["usage"]): number {
  const fromTokens = (usage?.prompt_tokens ?? 0) * NEURONS_PER_INPUT_TOKEN + (usage?.completion_tokens ?? 0) * NEURONS_PER_OUTPUT_TOKEN;
  return Math.max(typeof usage?.neurons === "number" ? usage.neurons : 0, fromTokens, 1);
}

export async function localChat(messages: ChatMessage[], options: { json?: boolean; maxTokens?: number; model?: string } = {}): Promise<string> {
  const ai = env().AI;
  if (!ai) throw new LocalAiNotConfiguredError();
  if ((await neuronsUsedToday()) >= DAILY_BUDGET_NEURONS) throw new AiBudgetSpentError();

  const careful = options.model === CAREFUL_MODEL;
  const answerTokens = options.maxTokens ?? 300;
  let result: Completion;
  try {
    result = (await ai.run(DEFAULT_MODEL, {
      messages,
      temperature: 0.2,
      max_tokens: answerTokens + REASONING_TOKENS * (careful ? 2 : 1),
      ...(options.json ? { response_format: { type: "json_object" } } : {})
    })) as Completion;
  } catch {
    throw new Error("Squadron AI could not answer just now. Try again in a minute.");
  }
  await addNeurons(neuronsSpent(result.usage));

  const choice = result.choices?.[0];
  const content = typeof choice?.message?.content === "string" ? choice.message.content : "";
  return content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

export function parseJsonReply<T>(reply: string, fallback: T): T {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) return fallback;
  try {
    return JSON.parse(reply.slice(start, end + 1)) as T;
  } catch {
    return fallback;
  }
}
