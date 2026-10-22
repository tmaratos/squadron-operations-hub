#!/usr/bin/env node
// Package private ChatGPT MCP plugin once the NEW Hub domain is known and verified.
// node scripts/prepare-chatgpt-plugin.mjs https://real-hub-domain.tld
// Never include a member access token in plugin files.
import fs from "node:fs";
import path from "node:path";

const raw = process.argv[2];
if (!raw) throw new Error("Pass the final, verified Hub HTTPS origin as the only argument.");
const target = new URL(raw);
if (target.protocol !== "https:" || target.username || target.password || target.search || target.hash || target.pathname !== "/" ||
  !target.hostname.includes(".") || /\.(example|test|invalid)$/i.test(target.hostname)) {
  throw new Error("Use a real HTTPS Hub origin with no path, credentials, query or fragment.");
}
const endpoint = target.origin + "/api/mcp";
const out = path.resolve("dist/tn170-operations-hub-plugin");
fs.mkdirSync(path.join(out, "skills/tn170-hub"), { recursive: true });
const manifest = {
  $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  name: "tn170-operations-hub",
  version: "0.1.0",
  description: "Private read-only TN-170 squadron work and tasks connection.",
  author: { name: "TN-170 Hub administrator" },
  extensions: { "com.openai": { interface: {
    displayName: "TN-170 Operations Hub",
    shortDescription: "Squadron tasks and workspaces",
    longDescription: "Access permitted squadron tasks and workspaces using individual revocable Hub credentials.",
    developerName: "TN-170 Hub administrator",
    category: "Productivity",
    capabilities: ["Interactive"],
    defaultPrompt: "Show my open TN-170 Hub tasks."
  } } }
};
const mcp = {
  $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  mcpServers: { "tn170-hub": {
    type: "streamable-http",
    url: endpoint,
    extensions: { "com.openai": { auth: { type: "api_key", headerScheme: "bearer" } } }
  } }
};
const skill = [
  "---",
  "name: tn170-hub",
  "description: Use when an approved member wants to read TN-170 squadron tasks and workspaces in ChatGPT.",
  "---",
  "",
  "# TN-170 Operations Hub",
  "",
  "- Only use the approved member's authenticated personal connection.",
  "- This version is READ ONLY: no creating, editing, emailing, syncing or approving.",
  "- Use hub_identity and hub_tasks with onlyMine true for personal task requests.",
  "- Obtain list IDs via hub_workspaces before hub_list_items or hub_item.",
  "- Never ask a user to paste a connection key into a chat. Use client settings only.",
  "- Keys can be revoked under Hub Settings > Connect ChatGPT or Claude.",
  "- Respect individual Hub roles and squadron data confidentiality.",
  "- Explain that writes are unavailable and direct users to the Hub for them.",
  "- If the domain changes again, the owner must update the plugin's server URL."
].join("\n") + "\n";
for (const [file, value] of [["plugin.json", manifest], ["mcp.json", mcp]]) {
  fs.writeFileSync(path.join(out, file), JSON.stringify(value, null, 2) + "\n");
}
fs.writeFileSync(path.join(out, "skills/tn170-hub/SKILL.md"), skill);
console.log("PRIVATE plugin package prepared:", out);
console.log("MCP endpoint:", endpoint);
console.log("No credentials included. Review before ZIP/upload.");
