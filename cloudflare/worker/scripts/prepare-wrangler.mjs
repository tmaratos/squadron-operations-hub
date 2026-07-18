import { readFile, writeFile } from "node:fs/promises";

const sourceUrl = new URL("../wrangler.jsonc", import.meta.url);
const targetUrl = new URL("../wrangler.generated.jsonc", import.meta.url);
const checkOnly = process.argv.includes("--check");
const placeholder = "REPLACE_WITH_D1_DATABASE_ID";
const fallbackId = "00000000-0000-0000-0000-000000000000";
const databaseId = String(process.env.CLOUDFLARE_D1_DATABASE_ID || fallbackId).trim();

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(databaseId)) {
  throw new Error("CLOUDFLARE_D1_DATABASE_ID must be a valid UUID.");
}

const source = await readFile(sourceUrl, "utf8");
if (!source.includes(placeholder)) {
  throw new Error(`Expected placeholder ${placeholder} in wrangler.jsonc.`);
}

const generated = source.replaceAll(placeholder, databaseId);
JSON.parse(generated);

if (checkOnly) {
  console.log("Wrangler configuration is valid.");
} else {
  await writeFile(targetUrl, generated);
  console.log(`Generated ${targetUrl.pathname}`);
}
