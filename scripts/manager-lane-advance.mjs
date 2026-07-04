#!/usr/bin/env node
import { buildLaneAdvancementPlan, parseCommonArgs } from "./lib/manager-control-plane/core.mjs";

const options = parseCommonArgs(process.argv.slice(2));
const packet = buildLaneAdvancementPlan(options);

if (options.summaryJson) {
  console.log(JSON.stringify(packet));
} else {
  console.log(packet.summary?.readyLaneCount > 0 ? JSON.stringify(packet.summary, null, 2) : "No review-ready manager lanes detected.");
}

if (!packet.ok) {
  process.exitCode = 1;
}
