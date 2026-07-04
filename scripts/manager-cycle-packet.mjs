#!/usr/bin/env node
import { buildCyclePacket, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

const options = parseCommonArgs(process.argv.slice(2));
printPacket(buildCyclePacket(options), options);
