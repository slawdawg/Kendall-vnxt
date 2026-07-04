#!/usr/bin/env node
import { buildWorkerPromptProbePlan, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

const options = parseCommonArgs(process.argv.slice(2));
printPacket(buildWorkerPromptProbePlan(options), options);
