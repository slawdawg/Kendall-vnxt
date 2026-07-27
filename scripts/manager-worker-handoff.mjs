#!/usr/bin/env node
import { buildActiveWorkerDeliveryInstructionPlan, buildDeliverySessionReceiptPlan, buildWorkerHandoffPlan, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

const options = parseCommonArgs(process.argv.slice(2));
printPacket(options.deliveryInstruction || options.deliveryAck ? buildActiveWorkerDeliveryInstructionPlan(options) : options.deliverySessionReceipt ? buildDeliverySessionReceiptPlan(options) : buildWorkerHandoffPlan(options), options);
