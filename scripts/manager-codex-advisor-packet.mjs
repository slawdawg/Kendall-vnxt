#!/usr/bin/env node
import { buildCodexAdvisorClassificationPlan, buildCodexAdvisorPacketPlan, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

const options = parseCommonArgs(process.argv.slice(2));
const plan = options.command === "classify"
  ? buildCodexAdvisorClassificationPlan(options)
  : buildCodexAdvisorPacketPlan(options);
printPacket(plan, options);
