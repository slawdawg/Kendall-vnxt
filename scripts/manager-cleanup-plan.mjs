#!/usr/bin/env node
import { buildCleanupPlan, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

const options = parseCommonArgs(process.argv.slice(2));
printPacket(buildCleanupPlan(options), options);
