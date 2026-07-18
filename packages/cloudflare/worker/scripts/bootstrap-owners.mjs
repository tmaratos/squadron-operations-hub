import { writeFile } from "node:fs/promises";

const owners = [
  { capid: "729204", email: process.env.OWNER_TRISTAN_EMAIL },
  { capid: "326320", email: process.env.OWNER_MELLARD_EMAIL }
];

for (const owner of owners) {
  owner.email = String(owner.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner.email)) {
    throw new Error(`A valid email is required for CAPID ${owner.capid}.`);
  }
}

const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const lines = [
  "-- Generated at deployment time. Do not commit this file.",
  "BEGIN TRANSACTION;",
  ...owners.map(owner => `
UPDATE users
SET email=${quote(owner.email)},
    email_norm=${quote(owner.email)},
    status='ACTIVE',
    role='OWNER',
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE capid=${quote(owner.capid)};`.trim()),
  "COMMIT;"
];

const target = new URL("../seed/bootstrap-owners.generated.sql", import.meta.url);
await writeFile(target, `${lines.join("\n\n")}\n`);
console.log(`Generated ${target.pathname}`);
