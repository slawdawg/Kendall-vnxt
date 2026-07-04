#!/usr/bin/env node
import { buildUsageStatus, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

printPacket(buildUsageStatus(), parseCommonArgs(process.argv.slice(2)));
