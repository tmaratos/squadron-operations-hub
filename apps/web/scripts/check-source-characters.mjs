import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";

// Stopping an invisible character from shipping.
//
// A regex in the CAPWATCH parser once read /\x08(\d{4})\x08/ - it was meant to be a word boundary, and a
// literal backspace character had been written into the file instead. It could never match, so two hundred
// service records kept a placeholder expiry date and every permanent qualification in the squadron would
// have read as decades lapsed.
//
// What made it expensive was not the mistake but how well it hid. The editor showed nothing. grep showed
// nothing. TypeScript compiled it happily, because a backspace is a perfectly legal character in a regular
// expression. It was only found by dumping the raw bytes of the line.
//
// So the check is mechanical and runs before every build: no control characters in source, except the three
// that belong there. A character nobody can see should never be the reason something silently does not work.

const ALLOWED = new Set([9, 10, 13]); // tab, newline, carriage return
const SKIP = new Set(["node_modules", ".git", ".next", ".open-next", "dist", "build", ".wrangler"]);
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".jsx", ".json", ".jsonc", ".sql", ".css"]);

async function* sourceFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (EXTENSIONS.has(extname(entry.name))) yield path;
  }
}

const problems = [];
let scanned = 0;

for await (const path of sourceFiles(process.cwd())) {
  const text = await readFile(path, "utf8");
  scanned += 1;
  for (let at = 0; at < text.length; at += 1) {
    const code = text.charCodeAt(at);
    if (code < 32 && !ALLOWED.has(code)) {
      const line = text.slice(0, at).split("\n").length;
      problems.push({
        path,
        line,
        code: "0x" + code.toString(16).padStart(2, "0"),
        // Shown with the character made visible, since the point is that it cannot normally be seen.
        context: text.slice(Math.max(0, at - 40), at + 40).replace(/[\u0000-\u001f]/g, (c) =>
          c === "\n" ? "\\n" : c === "\t" ? "\\t" : c === "\r" ? "\\r" : "<0x" + c.charCodeAt(0).toString(16) + ">")
      });
    }
  }
}

if (problems.length) {
  console.error("\nInvisible control characters found in source:\n");
  for (const problem of problems) {
    console.error("  " + problem.path + ":" + problem.line + "  " + problem.code);
    console.error("    ..." + problem.context + "...\n");
  }
  console.error(problems.length + " found. These are almost always an escape sequence that was written");
  console.error("literally - \\b, \\f or \\v - rather than as the two characters it should have been.\n");
  process.exit(1);
}

console.log("source characters: " + scanned + " files, no invisible control characters");
