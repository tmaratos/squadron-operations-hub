import { readFile, writeFile } from "node:fs/promises";

const members = JSON.parse(await readFile(new URL("../seed/members.json", import.meta.url), "utf8"));
const lines = [
  "-- Generated from seed/members.json.",
  "-- Only members with a non-empty email are included.",
  ""
];

for (const member of members) {
  const email = String(member.email || "").trim().toLowerCase();
  if (!email) continue;
  const escapedEmail = email.replaceAll("'", "''");
  const escapedCapid = String(member.capid).replaceAll("'", "''");
  lines.push(
    `UPDATE users SET email='${escapedEmail}', email_norm='${escapedEmail}', status='ACTIVE', ` +
    `updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE capid='${escapedCapid}';`
  );
}

const target = new URL("../seed/member-emails.sql", import.meta.url);
await writeFile(target, lines.join("\n") + "\n");
console.log(`Generated ${target.pathname} with ${lines.length - 3} account update(s).`);
