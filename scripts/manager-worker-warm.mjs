#!/usr/bin/env node
import { buildWorkerWarmPlan, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

const options = parseCommonArgs(process.argv.slice(2));
printPacket(buildWorkerWarmPlan(options), options);
