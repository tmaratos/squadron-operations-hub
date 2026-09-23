import { getCloudflareEnv } from "@/lib/cloudflare";

// Squadron AI: the Ollama server on the squadron's own hardware, reached through a Cloudflare Tunnel
// that is locked behind a Cloudflare Access service token. Task data never goes to an outside AI company.

// qwen3:1.7b is the largest model that answers in reasonable time on the squadron server (2 CPU cores,
// 5.7 GB RAM, no GPU). It is what anybody waiting for an answer gets.
const DEFAULT_MODEL = "qwen3:1.7b";

// Reading a regulation is worth more care than speed: it happens in the background, a person is not sitting
// watching it, and a missed requirement is expensive. The bigger model is used only for work like that.
export const CAREFUL_MODEL = "qwen3:4b";

interface LocalAiEnv {
  // Preferred: a private VPC Service binding that reaches Ollama through the hp-server tunnel. No keys, never public.
  SQUADRON_AI?: { fetch: (input: string | Request, init?: RequestInit) => Promise<Response> };
  LOCAL_AI_URL?: string;
  LOCAL_AI_MODEL?: string;
  LOCAL_AI_ACCESS_CLIENT_ID?: string;
  LOCAL_AI_ACCESS_CLIENT_SECRET?: string;
}

export class LocalAiNotConfiguredError extends Error {
  constructor() {
    super("Squadron AI isn't set up yet. Ask your administrator.");
  }
}

function env(): LocalAiEnv {
  return getCloudflareEnv() as unknown as LocalAiEnv;
}

export function isLocalAiConfigured(): boolean {
  const values = env();
  if (values.SQUADRON_AI) return true;
  return Boolean(values.LOCAL_AI_URL && values.LOCAL_AI_ACCESS_CLIENT_ID && values.LOCAL_AI_ACCESS_CLIENT_SECRET);
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Qwen3 models sometimes think out loud even when asked not to; the /no_think switch keeps replies short and direct.
function withNoThink(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message, index) => (index === messages.length - 1 && message.role === "user" ? { ...message, content: message.content + "\n/no_think" } : message));
}

export async function localChat(messages: ChatMessage[], options: { json?: boolean; maxTokens?: number; model?: string } = {}): Promise<string> {
  const values = env();
  const usingBinding = Boolean(values.SQUADRON_AI);
  if (!usingBinding && (!values.LOCAL_AI_URL || !values.LOCAL_AI_ACCESS_CLIENT_ID || !values.LOCAL_AI_ACCESS_CLIENT_SECRET)) throw new LocalAiNotConfiguredError();

  const url = usingBinding ? "http://squadron-ai/api/chat" : values.LOCAL_AI_URL!.replace(/\/+$/, "") + "/api/chat";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!usingBinding) {
    headers["CF-Access-Client-Id"] = values.LOCAL_AI_ACCESS_CLIENT_ID!;
    headers["CF-Access-Client-Secret"] = values.LOCAL_AI_ACCESS_CLIENT_SECRET!;
  }

  const request = {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: options.model || values.LOCAL_AI_MODEL || DEFAULT_MODEL,
      messages: withNoThink(messages),
      stream: false,
      think: false,
      keep_alive: "24h",
      ...(options.json ? { format: "json" } : {}),
      // A chunk of regulation plus the instructions is well past the default window, and Ollama silently
      // drops what will not fit - so the careful model gets a window big enough to see what it was sent.
      options: { temperature: 0.2, num_predict: options.maxTokens ?? 300, num_ctx: options.model ? 8192 : 4096 }
    }),
    // The careful model is slower on hardware without a GPU, so it is given longer before giving up.
    signal: AbortSignal.timeout(options.model ? 240000 : 90000)
  };

  const response = usingBinding && values.SQUADRON_AI ? await values.SQUADRON_AI.fetch(url, request) : await fetch(url, request);
  if (!response.ok) throw new Error("Squadron AI answered with an error (" + response.status + "). Try again in a minute.");
  const data = (await response.json()) as { message?: { content?: string } };
  return (data.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
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
