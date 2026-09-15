import { getCloudflareEnv } from "@/lib/cloudflare";

// Squadron AI: the Ollama server on the squadron's own hardware, reached through a Cloudflare Tunnel
// that is locked behind a Cloudflare Access service token. Task data never goes to an outside AI company.

const DEFAULT_MODEL = "qwen3:4b";

interface LocalAiEnv {
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
  return Boolean(values.LOCAL_AI_URL && values.LOCAL_AI_ACCESS_CLIENT_ID && values.LOCAL_AI_ACCESS_CLIENT_SECRET);
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function localChat(messages: ChatMessage[], options: { json?: boolean; maxTokens?: number } = {}): Promise<string> {
  const values = env();
  if (!values.LOCAL_AI_URL || !values.LOCAL_AI_ACCESS_CLIENT_ID || !values.LOCAL_AI_ACCESS_CLIENT_SECRET) throw new LocalAiNotConfiguredError();

  const response = await fetch(values.LOCAL_AI_URL.replace(/\/+$/, "") + "/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Access-Client-Id": values.LOCAL_AI_ACCESS_CLIENT_ID,
      "CF-Access-Client-Secret": values.LOCAL_AI_ACCESS_CLIENT_SECRET
    },
    body: JSON.stringify({
      model: values.LOCAL_AI_MODEL || DEFAULT_MODEL,
      messages,
      stream: false,
      think: false,
      keep_alive: "15m",
      ...(options.json ? { format: "json" } : {}),
      options: { temperature: 0.2, num_predict: options.maxTokens ?? 300, num_ctx: 4096 }
    }),
    signal: AbortSignal.timeout(90000)
  });
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
