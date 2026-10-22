import { getCloudflareEnv } from "@/lib/cloudflare";

/**
 * Refuses a change that a page on some other site asked a member's browser to make.
 *
 * A request from the Hub's own pages carries the Hub's origin. The Hub answers on more than one address while
 * it moves domains - tn170adminhub.tristanmaratos.com and tn170hub.faithbasedpilot.com - so the origin is
 * compared with the address this request actually arrived on, and with the configured one. Comparing with
 * the configured address alone refused every save made on the other address.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;

  const allowed = new Set<string>([new URL(request.url).origin]);
  const configuredUrl = getCloudflareEnv().APP_URL;
  if (configuredUrl) allowed.add(new URL(configuredUrl).origin);

  if (!allowed.has(origin)) {
    throw new Error("Invalid request origin.");
  }
}
