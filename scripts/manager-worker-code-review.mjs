#!/usr/bin/env node
import { buildWorkerCodeReviewPlan, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

const options = parseCommonArgs(process.argv.slice(2));
printPacket(buildWorkerCodeReviewPlan(options), options);
