import { getApiKeyForUser, safeBaseUrl } from "@/lib/connections";
import type { ChatMessage } from "./local";

// Calls a member's own AI account with the key they connected. Keys stay on the server and are never returned to the browser.

export const VENDOR_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-4o-mini",
  "google-gemini": "gemini-2.0-flash",
  mistral: "mistral-small-latest",
  openrouter: "openai/gpt-4o-mini",
  "openai-compatible": "gpt-4o-mini"
};

export function isVendorProvider(providerId: string): boolean {
  return Object.prototype.hasOwnProperty.call(VENDOR_MODELS, providerId);
}

export class VendorNotConnectedError extends Error {
  constructor(providerId: string) {
    super("Your " + providerId + " account isn't connected. Open My connections to add it.");
  }
}

interface Options {
  json?: boolean;
  maxTokens?: number;
}

function splitSystem(messages: ChatMessage[]) {
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const rest = messages.filter((message) => message.role !== "system");
  return { system, rest };
}

async function readError(response: Response): Promise<string> {
  if (response.status === 401 || response.status === 403) return "Your key was not accepted. Check it in My connections.";
  if (response.status === 429) return "Your AI account is over its usage limit right now.";
  return "The AI service answered with an error (" + response.status + ").";
}

export async function vendorChat(providerId: string, userId: string, messages: ChatMessage[], options: Options = {}): Promise<string> {
  const credentials = await getApiKeyForUser(userId, providerId);
  if (!credentials) throw new VendorNotConnectedError(providerId);
  const model = VENDOR_MODELS[providerId] ?? VENDOR_MODELS.openai;
  const maxTokens = options.maxTokens ?? 400;
  const { system, rest } = splitSystem(messages);
  const signal = AbortSignal.timeout(60000);

  if (providerId === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": credentials.apiKey, "anthropic-version": "2023-06-01" },
      // Anthropic has no JSON mode, so when JSON is wanted the reply is started for it with an opening
      // brace. The model then has nowhere to put a preamble, and the brace is put back before parsing.
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0.2,
        system: system || undefined,
        messages: [
          ...rest.map((message) => ({ role: message.role, content: message.content })),
          ...(options.json ? [{ role: "assistant" as const, content: "{" }] : [])
        ]
      }),
      signal
    });
    if (!response.ok) throw new Error(await readError(response));
    const data = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
    const text = (data.content ?? []).filter((part) => part.type === "text").map((part) => part.text ?? "").join("").trim();
    return options.json && !text.startsWith("{") ? "{" + text : text;
  }

  if (providerId === "google-gemini") {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": credentials.apiKey },
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents: rest.map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] })),
        generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens, ...(options.json ? { responseMimeType: "application/json" } : {}) }
      }),
      signal
    });
    if (!response.ok) throw new Error(await readError(response));
    const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return (data.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("").trim();
  }

  const base = providerId === "openai" ? "https://api.openai.com/v1"
    : providerId === "mistral" ? "https://api.mistral.ai/v1"
    : providerId === "openrouter" ? "https://openrouter.ai/api/v1"
    : safeBaseUrl(credentials.baseUrl);
  if (!base) throw new Error("That AI service has no valid address saved.");

  const response = await fetch(base + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + credentials.apiKey },
    body: JSON.stringify({
      model,
      messages: messages.map((message) => ({ role: message.role, content: message.content })),
      temperature: 0.2,
      max_tokens: maxTokens,
      ...(options.json ? { response_format: { type: "json_object" } } : {})
    }),
    signal
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return (data.choices?.[0]?.message?.content ?? "").trim();
}
