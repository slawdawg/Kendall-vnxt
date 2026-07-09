#!/usr/bin/env node
import { buildResumeState, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

const options = parseCommonArgs(process.argv.slice(2));
printPacket(buildResumeState(options, { env: process.env }), options);
