#!/usr/bin/env node
import { consumeWorkerLocalDeliveryInstruction, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

const options = parseCommonArgs(process.argv.slice(2));
printPacket(consumeWorkerLocalDeliveryInstruction(options), options);
