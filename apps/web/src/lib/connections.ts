import { decryptToken, encryptToken } from "@/lib/auth/token-encryption";
import { getDatabase } from "@/lib/cloudflare";

// Personal connections. Every member connects their own accounts and AI services; nothing here is shared with other members.
// API keys are checked against the provider before they are saved, stored encrypted, and never sent back to the browser.

export type ConnectionCategory = "files" | "email" | "ai";
export type ConnectionMethod = "google_signin" | "api_key" | "coming_soon";

export interface ProviderDefinition {
  id: string;
  name: string;
  category: ConnectionCategory;
  method: ConnectionMethod;
  summary: string;
  keyUrl?: string;
  keyHelp?: string;
  needsBaseUrl?: boolean;
  color: string;
  initials: string;
}

export const PROVIDERS: ProviderDefinition[] = [
  { id: "google-drive", name: "Google Drive", category: "files", method: "google_signin", summary: "Open and attach squadron files. This uses the Google account you sign in with.", color: "#1a73e8", initials: "GD" },
  { id: "microsoft-onedrive", name: "Microsoft OneDrive", category: "files", method: "coming_soon", summary: "Attach files from your OneDrive or SharePoint.", color: "#0364b8", initials: "OD" },
  { id: "gmail", name: "Gmail", category: "email", method: "coming_soon", summary: "Turn emails into tasks and send updates from your Gmail.", color: "#d93025", initials: "GM" },
  { id: "microsoft-outlook", name: "Outlook email", category: "email", method: "coming_soon", summary: "Turn Outlook or Microsoft 365 emails into tasks.", color: "#0078d4", initials: "OL" },
  { id: "anthropic", name: "Claude (Anthropic)", category: "ai", method: "api_key", summary: "Use Claude with your own Anthropic account.", keyUrl: "https://console.anthropic.com/settings/keys", keyHelp: "Anthropic keys start with sk-ant-", color: "#c96442", initials: "CL" },
  { id: "openai", name: "ChatGPT (OpenAI)", category: "ai", method: "api_key", summary: "Use OpenAI models with your own OpenAI account.", keyUrl: "https://platform.openai.com/api-keys", keyHelp: "OpenAI keys start with sk-", color: "#10a37f", initials: "AI" },
  { id: "google-gemini", name: "Gemini (Google)", category: "ai", method: "api_key", summary: "Use Google's Gemini models with your own key.", keyUrl: "https://aistudio.google.com/app/apikey", keyHelp: "Create a key in Google AI Studio", color: "#4285f4", initials: "GE" },
  { id: "mistral", name: "Mistral", category: "ai", method: "api_key", summary: "Use Mistral models with your own key.", keyUrl: "https://console.mistral.ai/api-keys", color: "#fa520f", initials: "MI" },
  { id: "openrouter", name: "OpenRouter", category: "ai", method: "api_key", summary: "One key that works with many AI models.", keyUrl: "https://openrouter.ai/settings/keys", keyHelp: "OpenRouter keys start with sk-or-", color: "#6467f2", initials: "OR" },
  { id: "openai-compatible", name: "Other AI service", category: "ai", method: "api_key", summary: "Any AI service that works like the OpenAI API. Ask your administrator for the address.", needsBaseUrl: true, color: "#656f7d", initials: "+" }
];

export interface ConnectionSummary {
  provider: string;
  status: "CONNECTED" | "ERROR" | "REVOKED";
  accountEmail: string | null;
  keyHint: string | null;
  baseUrl: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  updatedAt: string;
}

export function findProvider(providerId: string): ProviderDefinition | undefined {
  return PROVIDERS.find((provider) => provider.id === providerId);
}

function isMissingTable(error: unknown): boolean {
  return error instanceof Error && /no such table/i.test(error.message);
}

export async function listUserConnections(userId: string, email: string): Promise<ConnectionSummary[]> {
  const db = getDatabase();
  const summaries: ConnectionSummary[] = [];

  const google = await db.prepare("SELECT scopes, updated_at FROM user_google_oauth WHERE user_id = ?").bind(userId).first<{ scopes: string; updated_at: string }>();
  if (google && /\/auth\/drive\b/.test(google.scopes)) {
    summaries.push({ provider: "google-drive", status: "CONNECTED", accountEmail: email, keyHint: null, baseUrl: null, lastCheckedAt: google.updated_at, lastError: null, updatedAt: google.updated_at });
  }

  try {
    const rows = await db
      .prepare("SELECT provider, status, account_email, key_hint, config_json, last_checked_at, last_error, updated_at FROM user_connections WHERE user_id = ?")
      .bind(userId)
      .all<{ provider: string; status: ConnectionSummary["status"]; account_email: string | null; key_hint: string | null; config_json: string; last_checked_at: string | null; last_error: string | null; updated_at: string }>();
    rows.results.forEach((row) => {
      let baseUrl: string | null = null;
      try {
        baseUrl = (JSON.parse(row.config_json) as { baseUrl?: string }).baseUrl ?? null;
      } catch {
        baseUrl = null;
      }
      summaries.push({ provider: row.provider, status: row.status, accountEmail: row.account_email, keyHint: row.key_hint, baseUrl, lastCheckedAt: row.last_checked_at, lastError: row.last_error, updatedAt: row.updated_at });
    });
  } catch (error) {
    if (!isMissingTable(error)) throw error;
  }
  return summaries;
}

// Only public https addresses are allowed for custom AI services, so the Hub can never be pointed at internal networks.
export function safeBaseUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host.startsWith("[")) return null;
    if (/^(0|10|127)\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null;
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export async function checkApiKey(providerId: string, apiKey: string, baseUrl?: string | null): Promise<{ ok: boolean; message: string }> {
  const headers: Record<string, string> = { Accept: "application/json" };
  let url = "";
  switch (providerId) {
    case "anthropic":
      url = "https://api.anthropic.com/v1/models?limit=1";
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
      break;
    case "openai":
      url = "https://api.openai.com/v1/models";
      headers.Authorization = "Bearer " + apiKey;
      break;
    case "google-gemini":
      url = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1";
      headers["x-goog-api-key"] = apiKey;
      break;
    case "mistral":
      url = "https://api.mistral.ai/v1/models";
      headers.Authorization = "Bearer " + apiKey;
      break;
    case "openrouter":
      url = "https://openrouter.ai/api/v1/key";
      headers.Authorization = "Bearer " + apiKey;
      break;
    case "openai-compatible": {
      const safe = safeBaseUrl(baseUrl);
      if (!safe) return { ok: false, message: "Enter the service address. It must start with https://" };
      url = safe + "/models";
      headers.Authorization = "Bearer " + apiKey;
      break;
    }
    default:
      return { ok: false, message: "This service can't be connected with a key." };
  }

  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (response.ok) return { ok: true, message: "Connected. Your key works." };
    if (response.status === 401 || response.status === 403) return { ok: false, message: "That key was not accepted. Make sure you copied the whole key." };
    if (response.status === 429) return { ok: true, message: "Your key works, but the service says you've hit your usage limit for now." };
    return { ok: false, message: "The service answered with an error (" + response.status + "). Try again in a minute." };
  } catch {
    return { ok: false, message: "Couldn't reach the service. Check your internet or the address and try again." };
  }
}

export async function saveApiKeyConnection(input: { userId: string; providerId: string; apiKey: string; baseUrl?: string | null }): Promise<{ ok: boolean; message: string }> {
  const provider = findProvider(input.providerId);
  if (!provider || provider.method !== "api_key") return { ok: false, message: "This service can't be connected with a key." };
  const apiKey = input.apiKey.trim();
  const baseUrl = provider.needsBaseUrl ? safeBaseUrl(input.baseUrl) : null;
  const result = await checkApiKey(provider.id, apiKey, baseUrl);
  if (!result.ok) return result;

  const now = new Date().toISOString();
  await getDatabase()
    .prepare(
      "INSERT INTO user_connections (id, user_id, provider, kind, secret_encrypted, key_hint, config_json, status, last_checked_at, last_error, created_at, updated_at) " +
      "VALUES (?, ?, ?, 'api_key', ?, ?, ?, 'CONNECTED', ?, NULL, ?, ?) " +
      "ON CONFLICT(user_id, provider) DO UPDATE SET secret_encrypted = excluded.secret_encrypted, key_hint = excluded.key_hint, config_json = excluded.config_json, " +
      "status = 'CONNECTED', last_checked_at = excluded.last_checked_at, last_error = NULL, updated_at = excluded.updated_at"
    )
    .bind(crypto.randomUUID(), input.userId, provider.id, await encryptToken(apiKey), "••••" + apiKey.slice(-4), JSON.stringify(baseUrl ? { baseUrl } : {}), now, now, now)
    .run();
  return result;
}

export async function recheckConnection(userId: string, providerId: string): Promise<{ ok: boolean; message: string }> {
  const db = getDatabase();
  const row = await db.prepare("SELECT secret_encrypted, config_json FROM user_connections WHERE user_id = ? AND provider = ? AND kind = 'api_key'").bind(userId, providerId)
    .first<{ secret_encrypted: string | null; config_json: string }>();
  if (!row?.secret_encrypted) return { ok: false, message: "Nothing is connected for this service yet." };
  const config = JSON.parse(row.config_json || "{}") as { baseUrl?: string };
  const result = await checkApiKey(providerId, await decryptToken(row.secret_encrypted), config.baseUrl);
  const now = new Date().toISOString();
  await db.prepare("UPDATE user_connections SET status = ?, last_checked_at = ?, last_error = ?, updated_at = ? WHERE user_id = ? AND provider = ?")
    .bind(result.ok ? "CONNECTED" : "ERROR", now, result.ok ? null : result.message, now, userId, providerId)
    .run();
  return result;
}

export async function disconnectConnection(userId: string, providerId: string): Promise<void> {
  await getDatabase().prepare("DELETE FROM user_connections WHERE user_id = ? AND provider = ?").bind(userId, providerId).run();
}

// Server-only: used by future AI features to call the member's own provider. Never expose the result to the browser.
export async function getApiKeyForUser(userId: string, providerId: string): Promise<{ apiKey: string; baseUrl: string | null } | null> {
  const row = await getDatabase().prepare("SELECT secret_encrypted, config_json FROM user_connections WHERE user_id = ? AND provider = ? AND kind = 'api_key' AND status = 'CONNECTED'")
    .bind(userId, providerId).first<{ secret_encrypted: string | null; config_json: string }>();
  if (!row?.secret_encrypted) return null;
  const config = JSON.parse(row.config_json || "{}") as { baseUrl?: string };
  return { apiKey: await decryptToken(row.secret_encrypted), baseUrl: config.baseUrl ?? null };
}
