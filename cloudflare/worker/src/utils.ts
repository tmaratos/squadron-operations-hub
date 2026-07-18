import type { Env } from "./types";

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    }
  });
}

export function redirect(location: string, headers: HeadersInit = {}): Response {
  return new Response(null, { status: 302, headers: { location, ...headers } });
}

export async function readJson<T>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) throw new HttpError(415, "Expected application/json.");
  try {
    return await request.json<T>();
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function addMinutes(value: Date, minutes: number): string {
  return new Date(value.getTime() + minutes * 60_000).toISOString();
}

export function addDays(value: Date, days: number): string {
  return new Date(value.getTime() + days * 86_400_000).toISOString();
}

export function isoDate(value = new Date()): string {
  return value.toISOString().slice(0, 10);
}

export function addDateDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return isoDate(value);
}

export function parseCookies(request: Request): Record<string, string> {
  const result: Record<string, string> = {};
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

export function randomToken(bytes = 32): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return base64Url(data);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function base64Url(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function safeAppUrl(env: Env, path = "/index.html"): string {
  const base = new URL(env.PUBLIC_APP_URL);
  return new URL(path, base).toString();
}

export function verifyWriteOrigin(request: Request, env: Env): void {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  if (!origin) return;
  const expected = new URL(env.PUBLIC_APP_URL).origin;
  if (origin !== expected) throw new HttpError(403, "Origin is not allowed.");
}

export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

export function intEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
