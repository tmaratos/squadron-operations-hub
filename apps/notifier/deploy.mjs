// Deploying the notifier, without the two traps that cost an evening.
//
// The first: `npx --yes wrangler@<version>` pins a version that is not installed, so npm fetches a fresh
// copy and runs workerd's install script, which hangs. The workspace already has wrangler; this uses it.
//
// The second: wrangler sends usage telemetry before doing anything, and when that call fails it takes the
// whole command down with it - reporting "fetch failed" and a warning about corporate proxies and
// certificates, none of which is true. Turning telemetry off makes the deploy work instantly.
//
// Run it with: node deploy.mjs   (or: npm run deploy)

import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");

// The installed binary, wherever pnpm put it.
const candidates = [
  join(root, "node_modules", "wrangler", "bin", "wrangler.js"),
  join(root, "apps", "web", "node_modules", "wrangler", "bin", "wrangler.js")
];
const wrangler = candidates.find((path) => existsSync(path));

if (!wrangler) {
  console.error("Could not find an installed wrangler. Run `pnpm install` at the repository root first.");
  console.error("Looked in:\n  " + candidates.join("\n  "));
  process.exit(1);
}

const args = process.argv.slice(2);
const command = args.length ? args : ["deploy", "--config", join(here, "wrangler.jsonc")];

console.log("Using " + wrangler);
console.log("wrangler " + command.join(" ") + "\n");

const child = spawn(process.execPath, [wrangler, ...command], {
  stdio: "inherit",
  env: { ...process.env, WRANGLER_SEND_METRICS: "false" }
});

child.on("exit", (code) => process.exit(code ?? 1));
