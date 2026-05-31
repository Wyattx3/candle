#!/usr/bin/env node
/**
 * CLI entry for the trajectory-driven skill miner.
 *
 * Usage (from the backend/ directory):
 *   node scripts/mine-skills.js
 *
 * Re-scans `data/checkpoints/*.json`, emits new entries under
 * `data/skill-suggestions/<id>.json`, and prints a summary. Safe to run on
 * a cron — IDs are deterministic on the canonical tool sequence + prompt
 * vocabulary, so duplicate suggestions are skipped silently.
 */

require("ts-node/register");
const { mineSkillSuggestions, listSuggestions } = require("../src/agent/skill-miner");

const summary = mineSkillSuggestions();
console.log("[skill-miner] summary:");
console.log("  scanned runs    :", summary.scannedRuns);
console.log("  qualifying runs :", summary.qualifyingRuns);
console.log("  clusters found  :", summary.clustersFound);
console.log("  new suggestions :", summary.newSuggestions);
console.log("  total queue     :", summary.totalSuggestions);

if (summary.newSuggestions > 0) {
  console.log("\nReview pending suggestions:");
  for (const suggestion of listSuggestions().slice(0, 10)) {
    console.log(`  - ${suggestion.id}  ${suggestion.name}  (cluster=${suggestion.clusterSize}, status=${suggestion.status})`);
  }
  console.log("\nApprove/reject via the HTTP API:");
  console.log("  POST /skill-suggestions/<id>/approve");
  console.log("  POST /skill-suggestions/<id>/reject");
  console.log("  DELETE /skill-suggestions/<id>");
}
