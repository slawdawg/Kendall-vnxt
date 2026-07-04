#!/usr/bin/env node
import { buildWorkerHandoffPlan, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

const options = parseCommonArgs(process.argv.slice(2));
printPacket(buildWorkerHandoffPlan(options), options);
