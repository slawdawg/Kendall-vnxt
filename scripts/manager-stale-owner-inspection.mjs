#!/usr/bin/env node
import { buildStaleOwnerInspection, parseCommonArgs, printPacket } from "./lib/manager-control-plane/core.mjs";

const options = parseCommonArgs(process.argv.slice(2));
options.compactEvidence = {
  ...(options.compactEvidence || {}),
  changedFiles: [
    "scripts/manager-stale-owner-inspection.mjs",
    "scripts/lib/manager-control-plane/core.mjs",
    "tests/manager-control-plane.test.mjs",
  ],
  verification: [
    "node ./scripts/manager-stale-owner-inspection.mjs --summary-json",
    "node --test tests/manager-control-plane.test.mjs",
    "node ./scripts/check-manager-control-plane.mjs",
  ],
  storyArtifact: "_bmad-output/implementation-artifacts/23-3-stale-owner-takeover-inspection-packet.md",
};
printPacket(buildStaleOwnerInspection(options), options);
