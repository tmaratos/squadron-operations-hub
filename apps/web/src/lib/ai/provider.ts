import { getCloudflareEnv } from "@/lib/cloudflare";
import { isLocalAiConfigured, localChat, type ChatMessage } from "./local";

// Where the Hub's intelligence comes from, in order of preference:
// 1. Cloudflare Workers AI - runs on the same platform as the Hub, nothing for the squadron to set up.
// 2. The squadron's own Ollama server - private but slow; used when Workers AI is not bound.
const DEFAULT_WORKERS_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

export type AiSource = "cloudflare" | "squadron-server" | "none";

interface AiEnv {
  AI?: { run: (model: string, input: Record<string, unknown>) => Promise<unknown> };
  WORKERS_AI_MODEL?: string;
}

export class AiUnavailableError extends Error {
  constructor() {
    super("The Hub assistant isn't switched on yet. Ask your administrator.");
  }
}

export function aiSource(): AiSource {
  const env = getCloudflareEnv() as unknown as AiEnv;
  if (env.AI) return "cloudflare";
  if (isLocalAiConfigured()) return "squadron-server";
  return "none";
}

export async function aiChat(messages: ChatMessage[], options: { json?: boolean; maxTokens?: number } = {}): Promise<string> {
  const source = aiSource();
  if (source === "squadron-server") return localChat(messages, options);
  if (source === "none") throw new AiUnavailableError();

  const env = getCloudflareEnv() as unknown as AiEnv;
  if (!env.AI) throw new AiUnavailableError();
  const result = (await env.AI.run(env.WORKERS_AI_MODEL || DEFAULT_WORKERS_MODEL, {
    messages,
    max_tokens: options.maxTokens ?? 300,
    temperature: 0.2,
    ...(options.json ? { response_format: { type: "json_object" } } : {})
  })) as { response?: string } | string;
  const text = typeof result === "string" ? result : result.response ?? "";
  return text.trim();
}
