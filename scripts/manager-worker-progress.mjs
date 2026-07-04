#!/usr/bin/env node
import { buildWorkerProgressStatus, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

const options = parseCommonArgs(process.argv.slice(2));
printPacket(buildWorkerProgressStatus(options), options);
