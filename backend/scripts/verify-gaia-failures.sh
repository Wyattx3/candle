#!/usr/bin/env bash
# Wait for the in-progress full L1 run to finish, then re-run EVERY failure once
# in isolation (one task per process, endpoint otherwise idle) to separate
# throttle artifacts from genuine failures. Per benchmark memory: never trust a
# full-run failure at face value — only a failure that reproduces alone is real.
set -u
cd "$(dirname "$0")/.."
RESULTS=benchmark-data/results
MAIN_OUT=$RESULTS/final2-L1.out
MAIN_JSONL=$RESULTS/final2-L1.jsonl
META=benchmark-data/gaia/validation/metadata.jsonl

echo "[verify] waiting for main run to finish…"
until grep -q "GAIA RESULT" "$MAIN_OUT" 2>/dev/null; do sleep 20; done
echo "[verify] main run complete."
grep "GAIA RESULT" "$MAIN_OUT" | tail -1

# Collect short ids of failures from the main run.
FAILS=$(node -e '
const fs=require("fs");
const lines=fs.readFileSync(process.argv[1],"utf8").split("\n").filter(Boolean);
const seen={};
for(const l of lines){const r=JSON.parse(l); seen[r.taskId]=r.correct;}
console.log(Object.keys(seen).filter(id=>!seen[id]).join(" "));
' "$MAIN_JSONL")

echo "[verify] failures to re-run in isolation: $FAILS"
CONFIRMED=""
RECOVERED=""
for short in $FAILS; do
  full=$(node -e '
const fs=require("fs");
const m=fs.readFileSync(process.argv[1],"utf8").split("\n").filter(Boolean);
for(const l of m){const o=JSON.parse(l); if((o.task_id||"").startsWith(process.argv[2])){console.log(o.task_id);break;}}
' "$META" "$short")
  echo "[verify] === re-running $short ($full) alone ==="
  out=$(npx ts-node src/benchmark/run-gaia.ts --level 1 --ids "$full" 2>&1)
  if echo "$out" | grep -qE "^  ✓ \[L1\] $short"; then
    echo "[verify] $short → PASS in isolation (was a throttle artifact)"
    RECOVERED="$RECOVERED $short"
  else
    echo "[verify] $short → still FAILS alone (genuine)"
    CONFIRMED="$CONFIRMED $short"
  fi
done

echo ""
echo "============================================================"
echo "[verify] RECONCILED RESULT"
echo "  recovered (throttle artifacts, pass alone):$RECOVERED"
echo "  genuine failures (fail alone):$CONFIRMED"
echo "============================================================"
