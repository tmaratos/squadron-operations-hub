import { getCloudflareEnv } from "@/lib/cloudflare";

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;

  const configuredUrl = getCloudflareEnv().APP_URL;
  const expectedOrigin = configuredUrl ? new URL(configuredUrl).origin : new URL(request.url).origin;

  if (origin !== expectedOrigin) {
    throw new Error("Invalid request origin.");
  }
}
