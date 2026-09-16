import { getCloudflareEnv } from "@/lib/cloudflare";
import { getDatabase } from "@/lib/cloudflare";
import { isLocalAiConfigured, localChat, type ChatMessage } from "./local";
import { isVendorProvider, vendorChat } from "./vendors";

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

// Which service this member picked in My connections. "cloudflare" and "squadron-server" are shared; anything else is the member's own account.
export async function preferredProvider(userId: string): Promise<string | null> {
  try {
    const row = await getDatabase().prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'ai_provider'").bind(userId).first<{ value: string }>();
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export async function setPreferredProvider(userId: string, value: string): Promise<void> {
  await getDatabase()
    .prepare("INSERT INTO user_settings (user_id, key, value, updated_at) VALUES (?, 'ai_provider', ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(userId, value, new Date().toISOString())
    .run();
}

export async function aiChatFor(userId: string, messages: ChatMessage[], options: { json?: boolean; maxTokens?: number } = {}): Promise<string> {
  const choice = await preferredProvider(userId);
  if (choice && isVendorProvider(choice)) return vendorChat(choice, userId, messages, options);
  if (choice === "squadron-server" && isLocalAiConfigured()) return localChat(messages, options);
  return aiChat(messages, options);
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
