#!/usr/bin/env bash
# Run the BUILT Worker and load real pages from it.
#
# A typecheck, `next build`, `opennextjs-cloudflare build` and a wrangler dry
# run all pass without ever starting the server. On 22 October 2026 that let a
# Next.js / OpenNext mismatch through every check and into production, where
# every request threw "Unexpected loadManifest(...preview-props.json)". This is
# the check that would have caught it: it starts the Worker the build produced
# and asks it for pages.
#
# Run from apps/web after `pnpm run cf:build`. Needs no Cloudflare credentials:
# it uses a copy of wrangler.jsonc without the two bindings that only exist on
# the real account (Workers AI and the private link to the AI server), neither
# of which is touched while the server starts.
set -euo pipefail

PORT="${SMOKE_PORT:-8789}"
LOG="$(mktemp)"

node -e '
  const fs = require("fs");
  let s = fs.readFileSync("wrangler.jsonc", "utf8");
  s = s.replace(/"ai":\s*\{[^}]*\},\s*/, "").replace(/"vpc_services":\s*\[[\s\S]*?\],\s*/, "");
  if (/"ai"\s*:|vpc_services/.test(s)) { console.error("could not strip remote-only bindings"); process.exit(1); }
  fs.writeFileSync("wrangler.smoke.jsonc", s);
'

npx wrangler d1 migrations apply squadron-operations-hub --local --config wrangler.smoke.jsonc >/dev/null

npx wrangler dev --config wrangler.smoke.jsonc --port "$PORT" --ip 127.0.0.1 >"$LOG" 2>&1 &
DEV=$!
trap 'kill $DEV 2>/dev/null || true; rm -f wrangler.smoke.jsonc' EXIT

for _ in $(seq 1 90); do
  curl -s -o /dev/null "http://127.0.0.1:$PORT/login" && break
  sleep 1
done

failed=0
# path and the status a signed-out visitor must get
for check in "/login 200" "/ 307" "/tasks 307" "/api/notifications 401"; do
  set -- $check
  got="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT$1")"
  if [ "$got" = "$2" ]; then
    echo "ok    $1 -> $got"
  else
    echo "FAIL  $1 -> $got (expected $2)"
    failed=1
  fi
done

if grep -q -E 'Unexpected loadManifest|Exception Thrown|\[wrangler:error\]' "$LOG"; then
  echo "FAIL  the Worker logged errors:"
  grep -E 'Unexpected loadManifest|Exception Thrown|\[wrangler:error\]|Error:' "$LOG" | head -20
  failed=1
fi

if [ "$failed" -ne 0 ]; then
  echo "--- wrangler dev output ---"
  tail -60 "$LOG"
  exit 1
fi
echo "The built Worker serves pages."
