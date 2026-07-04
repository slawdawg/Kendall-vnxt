#!/usr/bin/env node
import { buildWorkerProgressSignalPlan, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

const options = parseCommonArgs(process.argv.slice(2));
printPacket(buildWorkerProgressSignalPlan(options), options);
