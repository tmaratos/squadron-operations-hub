import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { LEVELS, canonicalDevelopmentLevel } from "../src/lib/org/development-levels.ts";

test("all canonical CAPWATCH levels remain stable", () => {
  assert.deepEqual(LEVELS, ["LV1", "LV2", "LV3", "LV4", "LV5"]);
  for (const value of LEVELS) assert.equal(canonicalDevelopmentLevel(value), value);
});

test("legacy roman levels remain readable without changing database records", () => {
  for (const [legacy, expected] of [
    ["I", "LV1"], ["II", "LV2"], ["III", "LV3"], ["IV", "LV4"], ["V", "LV5"]
  ]) assert.equal(canonicalDevelopmentLevel(legacy), expected);
  assert.equal(canonicalDevelopmentLevel(null), null);
  assert.equal(canonicalDevelopmentLevel(undefined), null);
});

test("member and progression APIs accept the same values as the UI", () => {
  const current = path.dirname(fileURLToPath(import.meta.url));
  const ui = readFileSync(path.join(current, "../src/components/work/development-board.tsx"), "utf8");
  const api = readFileSync(path.join(current, "../src/app/api/development/route.ts"), "utf8");
  for (const value of LEVELS) {
    assert.ok(ui.includes('"' + value + '"'), "UI has " + value);
    assert.ok(api.includes('"' + value + '"'), "API accepts " + value);
  }
});
