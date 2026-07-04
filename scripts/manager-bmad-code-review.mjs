#!/usr/bin/env node
import { buildBmadCodeReviewRequestPlan, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

const options = parseCommonArgs(process.argv.slice(2));
const result = buildBmadCodeReviewRequestPlan(options);
printPacket(result, options);
