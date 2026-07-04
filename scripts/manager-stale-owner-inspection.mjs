#!/usr/bin/env node
import { buildStaleOwnerInspection, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

const options = parseCommonArgs(process.argv.slice(2));
printPacket(buildStaleOwnerInspection(options), options);
