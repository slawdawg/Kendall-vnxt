#!/usr/bin/env node
import { buildWorkerSubmitPendingPlan, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

const options = parseCommonArgs(process.argv.slice(2));
printPacket(buildWorkerSubmitPendingPlan(options), options);
