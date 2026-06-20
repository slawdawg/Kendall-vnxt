#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const requiredFiles = [
  "docs/workflows/product-requirements-boundary.md",
  "docs/linux-install/index.md",
  "docs/linux-install/install-playbook.md",
  "docs/linux-install/one-command-bootstrap-plan.md",
  "docs/linux-install/fresh-host-proof-procedure.md",
  "docs/linux-install/install-contract.md",
  "docs/linux-install/validation-matrix.md",
  "docs/linux-install/goal-run-contract.md",
  "docs/linux-install/provider-login-policy.md",
  "docs/linux-install/troubleshooting.md",
  "docs/linux-install/lessons-learned.md",
  "docs/linux-install/evidence/schema.md",
  "docs/linux-install/release-delivery-record.md",
];

const requiredIndexLinks = [
  "install-playbook.md",
  "one-command-bootstrap-plan.md",
  "fresh-host-proof-procedure.md",
  "install-contract.md",
  "validation-matrix.md",
  "goal-run-contract.md",
  "provider-login-policy.md",
  "troubleshooting.md",
  "lessons-learned.md",
  "evidence/schema.md",
  "release-delivery-record.md",
  "global-tool-manifest.json",
  "../workflows/product-requirements-boundary.md#linux-install-mvp",
];

const forbiddenTrackedPrefixes = ["docs/linux-install/planning/"];

const allowedPlanningReferences = new Set([
  "scripts/check-clean-install-boundary.mjs",
  "scripts/check-linux-install-lane.mjs",
  "tests/clean-install-boundary.test.mjs",
]);

const stalePatterns = [
  {
    path: "docs/linux-install/install-playbook.md",
    pattern: "pnpm run linux:bootstrap -- --verify-only",
  },
  {
    path: "docs/linux-install/one-command-bootstrap-plan.md",
    pattern: "pnpm run linux:bootstrap -- --plan",
  },
  {
    path: "docs/linux-install/one-command-bootstrap-plan.md",
    pattern: "pnpm run linux:bootstrap -- --verify-only",
  },
  {
    path: "docs/linux-install/validation-matrix.md",
    pattern: "pnpm run linux:bootstrap -- --plan",
  },
  {
    path: "docs/linux-install/validation-matrix.md",
    pattern: "pnpm run linux:bootstrap -- --verify-only",
  },
  {
    path: "docs/linux-install/one-command-bootstrap-plan.md",
    pattern: "pnpm.cmd",
  },
];

const forbiddenLinuxLessonsPatterns = ["PowerShell", "Windows-to-Linux", "pnpm.cmd"];
const forbiddenLinuxInstallPersonalPatterns = ["Bob", "bob_"];

const failures = [];

function read(path) {
  return readFileSync(path, "utf8");
}

function requireFile(path) {
  try {
    const stats = statSync(path);
    if (!stats.isFile()) {
      failures.push(`${path} is not a file.`);
    }
  } catch {
    failures.push(`${path} is missing.`);
  }
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function trackedPaths() {
  let output = Buffer.alloc(0);
  try {
    output = execFileSync("git", ["ls-files", "-z"], { encoding: "buffer" });
  } catch (error) {
    output = Buffer.isBuffer(error.stdout) ? error.stdout : Buffer.alloc(0);
    if (output.length === 0) {
      throw error;
    }
  }
  return output.toString("utf8").split("\0").filter(Boolean);
}

for (const path of requiredFiles) {
  requireFile(path);
}

for (const path of trackedPaths()) {
  for (const prefix of forbiddenTrackedPrefixes) {
    if (path.startsWith(prefix)) {
      failures.push(`${path} is a local Linux install planning artifact and must not be tracked.`);
    }
  }
  if ((path.endsWith(".md") || path.endsWith(".mjs")) && !allowedPlanningReferences.has(path)) {
    try {
      if (read(path).includes("docs/linux-install/planning")) {
        failures.push(`${path} must not reference local Linux install planning artifacts.`);
      }
    } catch {
      failures.push(`${path} is listed by git but could not be read.`);
    }
  }
}

try {
  const packageJson = JSON.parse(read("package.json"));
  if (packageJson.scripts?.["check:linux-install-lane"] !== "node ./scripts/check-linux-install-lane.mjs") {
    failures.push("package.json must define check:linux-install-lane as node ./scripts/check-linux-install-lane.mjs");
  }
  for (const scriptName of ["check:static", "check"]) {
    if (!packageJson.scripts?.[scriptName]?.includes("pnpm run check:linux-install-lane")) {
      failures.push(`package.json ${scriptName} must include pnpm run check:linux-install-lane`);
    }
  }
} catch {
  failures.push("package.json is missing or invalid.");
}

try {
  const index = read("docs/linux-install/index.md");
  if (!/^Status: delivered$/m.test(index)) {
    failures.push("docs/linux-install/index.md must mark the Linux install lane delivered.");
  }
  if (!index.includes("Generic Install Path")) {
    failures.push("docs/linux-install/index.md must keep the generic install entry point.");
  }
  if (!index.includes("v1 Boundary")) {
    failures.push("docs/linux-install/index.md must keep the v1 support boundary.");
  }
  if (/planning\//.test(index)) {
    failures.push("docs/linux-install/index.md must not publish local planning artifacts.");
  }
  for (const link of requiredIndexLinks) {
    if (!index.includes(link)) {
      failures.push(`docs/linux-install/index.md must reference ${link}.`);
    }
  }
} catch {
  failures.push("docs/linux-install/index.md is missing.");
}

try {
  const productBoundary = read("docs/workflows/product-requirements-boundary.md");
  for (const expected of [
    "## Linux Install MVP",
    "Status: delivered lane",
    "completed through PR #144",
    "source PRD metadata remains draft",
    "retrospective draft synthesis",
    "FR39",
  ]) {
    if (!productBoundary.includes(expected)) {
      failures.push(`product requirements boundary must preserve Linux Install MVP evidence: ${expected}`);
    }
  }
  if (/retrospective completed/.test(productBoundary)) {
    failures.push("product requirements boundary must not claim the interactive Linux retrospective is complete.");
  }
} catch {
  failures.push("docs/workflows/product-requirements-boundary.md is missing.");
}

try {
  const deliveryRecord = read("docs/linux-install/release-delivery-record.md");
  for (const expected of [
    "https://github.com/slawdawg/Kendall-vnxt/pull/144",
    "68b34bacdf082ffdf7f6629267c189533a9ec6cb",
    "bf55bc216c4618b246042178cc3a95904a99bfcd",
    "GitHub Actions check `check` passed",
    "empty `reviewThreads.nodes`",
    "remote PR branch",
    "Published bootstrap URL reachability evidence",
    "Fresh Ubuntu first-install and same-host rerun validation transcript",
    "docs/linux-install.zip",
    "merged release proof was newer and complete",
  ]) {
    if (!deliveryRecord.includes(expected)) {
      failures.push(`docs/linux-install/release-delivery-record.md must preserve PR #144 evidence: ${expected}`);
    }
  }
} catch {
  failures.push("docs/linux-install/release-delivery-record.md is missing.");
}

try {
  const installContract = read("docs/linux-install/install-contract.md");
  for (const expected of [
    "Ubuntu 26.04",
    "Existing non-root Linux user",
  ]) {
    if (!installContract.includes(expected)) {
      failures.push(`docs/linux-install/install-contract.md must preserve supported-install boundary: ${expected}`);
    }
  }
  const normalizedInstallContract = normalizeWhitespace(installContract);
  const unsupportedInstallBoundary =
    "No SSH-driven install, remote operator install, staged script workflow, manual fallback install, or Windows-to-Linux orchestration is supported.";
  if (!normalizedInstallContract.includes(unsupportedInstallBoundary)) {
    failures.push(`docs/linux-install/install-contract.md must preserve supported-install boundary: ${unsupportedInstallBoundary}`);
  }
} catch {
  failures.push("docs/linux-install/install-contract.md is missing.");
}

for (const { path, pattern } of stalePatterns) {
  try {
    if (read(path).includes(pattern)) {
      failures.push(`${path} contains stale command form: ${pattern}`);
    }
  } catch {
    failures.push(`${path} is missing.`);
  }
}

try {
  const lessons = read("docs/linux-install/lessons-learned.md");
  for (const pattern of forbiddenLinuxLessonsPatterns) {
    if (lessons.includes(pattern)) {
      failures.push(`docs/linux-install/lessons-learned.md must not include unsupported operator-host detail: ${pattern}`);
    }
  }
} catch {
  failures.push("docs/linux-install/lessons-learned.md is missing.");
}

for (const path of trackedPaths()) {
  if (!path.startsWith("docs/linux-install/") || !(path.endsWith(".md") || path.endsWith(".json"))) {
    continue;
  }
  try {
    const text = read(path);
    for (const pattern of forbiddenLinuxInstallPersonalPatterns) {
      if (text.includes(pattern)) {
        failures.push(`${path} must not include Bob-specific install-lane content: ${pattern}`);
      }
    }
  } catch {
    failures.push(`${path} is listed by git but could not be read.`);
  }
}

if (failures.length > 0) {
  console.error("Linux install lane checks failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("OK: Linux install release boundary checks passed.");
