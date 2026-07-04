#!/usr/bin/env node
import { buildWorkerStatus, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

const options = parseCommonArgs(process.argv.slice(2));
printPacket(buildWorkerStatus(options), options);
