#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const suites = {
  contracts: [
    "worker progress status classifies active workers from metadata only",
    "worker progress treats timestamped old checkpoints as stale signal candidates",
    "worker progress routes blocked checkpoints through source-context answer handling",
    "worker progress signals stale source-context answers instead of waiting forever",
    "worker progress signal gate writes durable request files and pastes only path pointers",
    "unverified pointer receipt metadata routes to C-m-only submit repair",
    "worker prompt probe submits only manager pointers visible in Codex input regions",
    "worker retire gate can park unsafe-question-blocked manager-owned workers with explicit flag",
    "worker question answer gate synthesizes source-context answers from blocked checkpoints",
    "worker owner delegation gate sends delegated owner override without takeover",
    "cycle packet records schema gaps instead of inferring hidden progress",
    "cycle packet scrubs raw injected summaries and continuous actions",
    "cycle continuation allows safe dispatch claims while active workers continue under stale ownership blockers",
  ],
  focused: [
    "explicit eligible source-backed packet seed feeds refill and continuous refresh",
    "cycle packet reports PR stewardship blockers while unrelated safe work continues",
    "blocked PR stewardship suppresses trusted unrelated dispatch apply",
    "cycle packet keeps unrelated work moving with combined delivery and PR stewardship blockers",
    "cycle packet reports delivery authority blocker while unrelated safe work continues",
    "cycle operational action readiness degrades on missing status evidence and normalizes time",
    "runtime readiness gates",
    "runtime parser rejects",
    "continuous execution separates",
    "continuous run plan blocks manager-only usage",
  ],
};

const requested = process.argv[2] || "all";
const names = requested === "all"
  ? [...suites.contracts, ...suites.focused]
  : suites[requested];

if (!names) {
  console.error(`Unknown manager-control-plane fast test suite: ${requested}`);
  console.error(`Expected one of: ${["all", ...Object.keys(suites)].join(", ")}`);
  process.exit(64);
}

const pattern = names.map(escapeRegExp).join("|");
const result = spawnSync(
  process.execPath,
  [
    "--test",
    "--test-reporter",
    "spec",
    "--test-name-pattern",
    pattern,
    "tests/manager-control-plane.test.mjs",
  ],
  { stdio: "inherit" },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(typeof result.status === "number" ? result.status : 1);

function escapeRegExp(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}
