import { getCloudflareContext } from "@opennextjs/cloudflare";

export function getCloudflareEnv(): CloudflareEnv {
  return getCloudflareContext().env;
}

export function getDatabase(): D1Database {
  const env = getCloudflareEnv();
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding DB is not configured.");
  }
  return env.DB;
}

export function getOptionalEnv<K extends keyof CloudflareEnv>(key: K): CloudflareEnv[K] | undefined {
  return getCloudflareEnv()[key];
}
