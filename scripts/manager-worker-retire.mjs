#!/usr/bin/env node
import { buildWorkerRetirePlan, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

const options = parseCommonArgs(process.argv.slice(2));
printPacket(buildWorkerRetirePlan(options), options);
