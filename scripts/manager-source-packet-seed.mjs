#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import {
  buildSourceBackedPacketSeedPlan,
  parseCommonArgs,
  printPacket,
} from "./lib/manager-control-plane/core.mjs";

export function runManagerSourcePacketSeed(argv = process.argv.slice(2), context = {}) {
  const options = parseCommonArgs(argv);
  return { options, result: buildSourceBackedPacketSeedPlan(options, context) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { options, result } = runManagerSourcePacketSeed();
  printPacket(result, options);
}
