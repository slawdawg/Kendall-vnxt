#!/usr/bin/env node
import { buildDirtyWorkspacePreservation, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

const options = parseCommonArgs(process.argv.slice(2));
printPacket(buildDirtyWorkspacePreservation(options), options);
