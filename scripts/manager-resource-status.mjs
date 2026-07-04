#!/usr/bin/env node
import { buildResourceStatus, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

printPacket(buildResourceStatus(), parseCommonArgs(process.argv.slice(2)));
