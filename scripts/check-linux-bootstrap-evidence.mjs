#!/usr/bin/env node

import { readFileSync } from "node:fs";

import { validateLinuxEvidence } from "./lib/linux-bootstrap/evidence-schema.mjs";

const paths = process.argv.slice(2).filter((arg) => arg !== "--");

if (paths.length === 0) {
  console.error("Usage: node ./scripts/check-linux-bootstrap-evidence.mjs <evidence.json> [...]");
  process.exit(2);
}

let failed = false;

for (const path of paths) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    console.error(`${path}: cannot read or parse JSON: ${error.message}`);
    failed = true;
    continue;
  }

  const errors = validateLinuxEvidence(parsed);
  if (errors.length > 0) {
    failed = true;
    console.error(`${path}: invalid Linux evidence`);
    for (const error of errors) {
      console.error(`- ${error}`);
    }
  } else {
    console.log(`${path}: Linux evidence OK`);
  }
}

if (failed) {
  process.exit(1);
}
