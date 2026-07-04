#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { buildDispatchPreview, buildRefillPlan, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

export function runManagerRefillPlan(argv = process.argv.slice(2), context = {}) {
  const options = parseCommonArgs(argv);
  const dispatchPreview = context.dispatchPreview || buildDispatchPreview(options, context);
  return { options, result: buildRefillPlan(options, { ...context, dispatchPreview, discoverDefaultSources: true }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { options, result } = runManagerRefillPlan();
  printPacket(result, options);
}
