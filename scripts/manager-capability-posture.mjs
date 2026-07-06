#!/usr/bin/env node
import { buildManagerCapabilityPostureControlPlan, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

const options = parseCommonArgs(process.argv.slice(2));
printPacket(buildManagerCapabilityPostureControlPlan(options), options);
