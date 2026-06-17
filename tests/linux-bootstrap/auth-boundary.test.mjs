import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const bootstrapSources = [
  "scripts/linux-bootstrap.mjs",
  "scripts/bootstrap-linux.sh",
  "scripts/lib/linux-bootstrap/controller.mjs",
  "scripts/lib/linux-bootstrap/args.mjs",
  "scripts/lib/linux-bootstrap/evidence.mjs",
  "scripts/lib/linux-bootstrap/executor.mjs",
  "scripts/lib/linux-bootstrap/gates.mjs",
];

test("bootstrap sources do not invoke forbidden auth flows", () => {
  const combined = bootstrapSources.map((path) => readFileSync(path, "utf8")).join("\n");
  const forbiddenPatterns = [
    /\btailscale\s+login\b/,
    /\bcodex\s+login\b/,
    /\bclaude\s+(auth|login)\b/,
    /\bopenai\s+api/,
    /\banthropic\s+api/,
    /provider\s+token\s*=/i,
  ];

  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(combined, pattern);
  }
});
