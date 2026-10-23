import { getDatabase } from "@/lib/cloudflare";
import { AiBudgetSpentError, isLocalAiConfigured, LocalAiNotConfiguredError, localChat, type ChatMessage } from "./local";
import { isVendorProvider, providerLabel, vendorChat } from "./vendors";

export { providerLabel };

// Where the Hub's intelligence comes from:
// 1. The squadron's own AI (Cloudflare Workers AI in the squadron's account) - free inside a daily budget the Hub
//    enforces, and no outside AI company sees the data. This is the default for everyone.
// 2. A member's own AI account (Claude, ChatGPT, Gemini, Mistral, OpenRouter, or any OpenAI-compatible service),
//    chosen by that member in My connections and paid for by them.
// The Hub never uses a paid service on the squadron's behalf.

export type AiSource = "squadron-server" | "none";

export class AiUnavailableError extends Error {
  constructor(message = "The Hub assistant isn't switched on yet. Ask your administrator, or connect your own AI account in My connections.") {
    super(message);
  }
}

export function aiSource(): AiSource {
  return isLocalAiConfigured() ? "squadron-server" : "none";
}

export async function aiChat(messages: ChatMessage[], options: { json?: boolean; maxTokens?: number; model?: string } = {}): Promise<string> {
  if (!isLocalAiConfigured()) throw new AiUnavailableError();
  try {
    return await localChat(messages, options);
  } catch (error) {
    if (error instanceof AiBudgetSpentError || error instanceof LocalAiNotConfiguredError) throw new AiUnavailableError(error.message);
    throw error;
  }
}

// Which service this member picked in My connections. "squadron-server" is the shared free one; anything else is their own account.
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

export async function sourceForUser(userId: string): Promise<{ available: boolean; source: string }> {
  const choice = await preferredProvider(userId);
  if (choice && isVendorProvider(choice)) return { available: true, source: choice };
  return { available: isLocalAiConfigured(), source: "squadron-server" };
}

export async function aiChatFor(userId: string, messages: ChatMessage[], options: { json?: boolean; maxTokens?: number; model?: string } = {}): Promise<string> {
  const choice = await preferredProvider(userId);
  if (choice && isVendorProvider(choice)) return vendorChat(choice, userId, messages, options);
  return aiChat(messages, options);
}
