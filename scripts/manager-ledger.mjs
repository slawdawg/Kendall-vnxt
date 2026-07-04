#!/usr/bin/env node
import { ledgerCommand, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

const options = parseCommonArgs(process.argv.slice(2));
printPacket(ledgerCommand(options), options);
