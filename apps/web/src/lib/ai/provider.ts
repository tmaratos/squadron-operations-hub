import { getCloudflareEnv } from "@/lib/cloudflare";
import { getDatabase } from "@/lib/cloudflare";
import { isLocalAiConfigured, localChat, type ChatMessage } from "./local";
import { isVendorProvider, vendorChat } from "./vendors";

// Where the Hub's intelligence comes from:
// 1. The squadron's own Ollama server - always free and private. This is the default.
// 2. Cloudflare Workers AI - faster and smarter, but only free up to a daily allowance, so it stays OFF
//    until an administrator sets AI_ALLOW_CLOUDFLARE to "true". It can then cost money past that allowance.
// 3. A member's own AI account (Claude, ChatGPT, Gemini and so on) - see aiChatFor; they pay for their own use.
const DEFAULT_WORKERS_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

export type AiSource = "cloudflare" | "squadron-server" | "none";

interface AiEnv {
  AI?: { run: (model: string, input: Record<string, unknown>) => Promise<unknown> };
  WORKERS_AI_MODEL?: string;
  AI_ALLOW_CLOUDFLARE?: string;
}

function cloudflareAllowed(env: AiEnv): boolean {
  return Boolean(env.AI) && env.AI_ALLOW_CLOUDFLARE === "true";
}

export class AiUnavailableError extends Error {
  constructor() {
    super("The Hub assistant isn't switched on yet. Ask your administrator.");
  }
}

export function aiSource(): AiSource {
  const env = getCloudflareEnv() as unknown as AiEnv;
  if (isLocalAiConfigured()) return "squadron-server";
  if (cloudflareAllowed(env)) return "cloudflare";
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
  if (choice === "cloudflare") return aiChat(messages, options);
  return aiChat(messages, options);
}

export async function aiChat(messages: ChatMessage[], options: { json?: boolean; maxTokens?: number } = {}): Promise<string> {
  const source = aiSource();
  if (source === "squadron-server") return localChat(messages, options);
  if (source === "none") throw new AiUnavailableError();

  const env = getCloudflareEnv() as unknown as AiEnv;
  if (!cloudflareAllowed(env) || !env.AI) throw new AiUnavailableError();
  const result = (await env.AI.run(env.WORKERS_AI_MODEL || DEFAULT_WORKERS_MODEL, {
    messages,
    max_tokens: options.maxTokens ?? 300,
    temperature: 0.2,
    ...(options.json ? { response_format: { type: "json_object" } } : {})
  })) as { response?: string } | string;
  const text = typeof result === "string" ? result : result.response ?? "";
  return text.trim();
}
