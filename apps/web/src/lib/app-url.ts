import { getCloudflareEnv } from "@/lib/cloudflare";

// The Hub's own address, for links that leave it - in emails, notifications and drafted messages.
//
// Read from the Worker's APP_URL setting. Two routes used to read process.env.APP_URL, which is not where
// Cloudflare puts a Worker's settings, so they always fell back to a hard-wired address - and would have
// gone on linking to the old domain after the Hub moved.
const FALLBACK = "https://tn170hub.faithbasedpilot.com";

export function appUrl(): string {
  return (getCloudflareEnv().APP_URL || FALLBACK).replace(/\/+$/, "");
}
