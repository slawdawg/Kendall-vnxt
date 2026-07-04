#!/usr/bin/env node
import { buildWorkerRecoveryInspection, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

const options = parseCommonArgs(process.argv.slice(2));
printPacket(buildWorkerRecoveryInspection(options), options);
