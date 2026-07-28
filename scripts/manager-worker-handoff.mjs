#!/usr/bin/env node
import { buildActiveWorkerDeliveryInstructionPlan, buildDeliverySessionReceiptPlan, buildWorkerHandoffPlan, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

const options = parseCommonArgs(process.argv.slice(2));
const operationCount = [options.deliverySessionReceipt, options.deliveryInstruction, options.deliveryAck].filter(Boolean).length;
if (operationCount > 1) {
  throw new Error("Choose exactly one delivery operation: --delivery-session-receipt, --delivery-instruction, or --delivery-ack.");
}
printPacket(options.deliveryInstruction || options.deliveryAck ? buildActiveWorkerDeliveryInstructionPlan(options) : options.deliverySessionReceipt ? buildDeliverySessionReceiptPlan(options) : buildWorkerHandoffPlan(options), options);
