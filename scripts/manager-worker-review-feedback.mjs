#!/usr/bin/env node
import { buildWorkerReviewFeedbackPlan, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

const options = parseCommonArgs(process.argv.slice(2));
printPacket(buildWorkerReviewFeedbackPlan(options), options);
