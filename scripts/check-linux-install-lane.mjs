#!/usr/bin/env node

import { readFileSync, statSync } from "node:fs";

const requiredFiles = [
  "docs/prds/linux-install-mvp.md",
  "docs/prds/linux-install-mvp-decision-log.md",
  "docs/linux-install/planning/linux-install-architecture-input.md",
  "docs/linux-install/planning/linux-install-epics-and-stories.md",
  "docs/linux-install/planning/lane-status.md",
  "docs/linux-install/planning/next-goal-prompt.md",
  "docs/linux-install/planning/implementation-readiness-report-2026-06-18.md",
  "docs/linux-install/planning/stories/1-1-declare-certified-ubuntu-target-and-single-install-method.md",
  "docs/linux-install/planning/stories/1-2-enforce-local-identity-and-platform-preflight-gates.md",
  "docs/linux-install/planning/stories/1-3-provide-non-mutating-plan-and-verify-modes.md",
  "docs/linux-install/planning/stories/1-4-reject-unsupported-remote-and-apply-arguments.md",
  "docs/linux-install/planning/stories/1-5-enforce-shell-bootstrap-as-the-only-mutating-install-path.md",
  "docs/linux-install/planning/stories/2-1-install-or-verify-approved-base-toolchain.md",
  "docs/linux-install/planning/stories/2-2-record-existing-versus-changed-tool-state.md",
  "docs/linux-install/planning/stories/2-3-clone-or-validate-kendall-nxt-repo-state.md",
  "docs/linux-install/planning/stories/2-4-block-cleanly-when-private-repo-access-is-missing.md",
  "docs/linux-install/planning/stories/2-5-run-project-setup-and-final-verify-from-validated-checkout.md",
  "docs/linux-install/planning/stories/2-6-prove-safe-rerun-behavior-across-install-states.md",
  "docs/linux-install/planning/stories/3-1-write-schema-compliant-success-failure-and-blocked-evidence.md",
  "docs/linux-install/planning/stories/3-2-emit-pre-repo-blocked-evidence-safely.md",
  "docs/linux-install/planning/stories/3-3-enforce-evidence-redaction-and-required-fields.md",
  "docs/linux-install/planning/stories/3-4-protect-evidence-paths-from-unsafe-writes.md",
  "docs/linux-install/planning/stories/3-5-deny-automated-auth-and-secret-handling.md",
  "docs/linux-install/planning/stories/3-6-keep-troubleshooting-and-lessons-learned-current.md",
  "docs/linux-install/planning/stories/4-1-map-stories-to-release-gates-before-execution.md",
  "docs/linux-install/planning/stories/4-2-define-durable-goal-run-task-state-and-command-contracts.md",
  "docs/linux-install/planning/stories/4-3-enforce-bounded-authority-ledger-decisions.md",
  "docs/linux-install/planning/stories/4-4-record-blocker-packets-for-gated-operations.md",
  "docs/linux-install/planning/stories/4-5-apply-safe-continuation-after-blockers.md",
  "docs/linux-install/planning/stories/4-6-generate-completion-reports-from-evidence.md",
  "docs/linux-install/planning/stories/5-1-separate-supported-install-docs-from-historical-notes.md",
  "docs/linux-install/planning/stories/5-2-prove-published-bootstrap-source-reachability.md",
  "docs/linux-install/planning/stories/5-3-capture-fresh-ubuntu-first-install-evidence.md",
  "docs/linux-install/planning/stories/5-4-capture-idempotent-rerun-evidence.md",
  "docs/linux-install/planning/stories/5-5-refresh-release-docs-and-linux-install-package.md",
  "docs/linux-install/planning/stories/5-6-run-final-verification-and-code-review-before-delivery.md",
  "docs/linux-install/planning/reviews/pre-pr-code-review-2026-06-18.md",
  "docs/linux-install/planning/reviews/pr-144-delivery-record.md",
  "docs/linux-install/planning/reviews/linux-install-mvp-retrospective-2026-06-18.md",
  "docs/linux-install/evidence/local-verify-only-20260618T181400Z.json",
];

const requiredLinks = [
  {
    path: "docs/prds/index.md",
    text: "linux-install-mvp.md",
  },
  {
    path: "docs/prds/index.md",
    text: "linux-install-mvp-decision-log.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/linux-install-architecture-input.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/linux-install-epics-and-stories.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/lane-status.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/next-goal-prompt.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/implementation-readiness-report-2026-06-18.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/1-1-declare-certified-ubuntu-target-and-single-install-method.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/1-2-enforce-local-identity-and-platform-preflight-gates.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/1-3-provide-non-mutating-plan-and-verify-modes.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/1-4-reject-unsupported-remote-and-apply-arguments.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/1-5-enforce-shell-bootstrap-as-the-only-mutating-install-path.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/2-1-install-or-verify-approved-base-toolchain.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/2-2-record-existing-versus-changed-tool-state.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/2-3-clone-or-validate-kendall-nxt-repo-state.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/2-4-block-cleanly-when-private-repo-access-is-missing.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/2-5-run-project-setup-and-final-verify-from-validated-checkout.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/2-6-prove-safe-rerun-behavior-across-install-states.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/3-1-write-schema-compliant-success-failure-and-blocked-evidence.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/3-2-emit-pre-repo-blocked-evidence-safely.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/3-3-enforce-evidence-redaction-and-required-fields.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/3-4-protect-evidence-paths-from-unsafe-writes.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/3-5-deny-automated-auth-and-secret-handling.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/3-6-keep-troubleshooting-and-lessons-learned-current.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/4-1-map-stories-to-release-gates-before-execution.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/4-2-define-durable-goal-run-task-state-and-command-contracts.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/4-3-enforce-bounded-authority-ledger-decisions.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/4-4-record-blocker-packets-for-gated-operations.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/4-5-apply-safe-continuation-after-blockers.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/4-6-generate-completion-reports-from-evidence.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/5-1-separate-supported-install-docs-from-historical-notes.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/5-2-prove-published-bootstrap-source-reachability.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/5-3-capture-fresh-ubuntu-first-install-evidence.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/5-4-capture-idempotent-rerun-evidence.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/5-5-refresh-release-docs-and-linux-install-package.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/stories/5-6-run-final-verification-and-code-review-before-delivery.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/reviews/pre-pr-code-review-2026-06-18.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/reviews/pr-144-delivery-record.md",
  },
  {
    path: "docs/linux-install/index.md",
    text: "planning/reviews/linux-install-mvp-retrospective-2026-06-18.md",
  },
];

const stalePatterns = [
  {
    path: "docs/linux-install/planning/linux-install-architecture-input.md",
    pattern: "pnpm run linux:bootstrap -- --plan",
  },
  {
    path: "docs/linux-install/planning/linux-install-architecture-input.md",
    pattern: "pnpm run linux:bootstrap -- --verify-only",
  },
  {
    path: "docs/linux-install/planning/linux-install-epics-and-stories.md",
    pattern: "pnpm run linux:bootstrap -- --plan",
  },
  {
    path: "docs/linux-install/planning/linux-install-epics-and-stories.md",
    pattern: "pnpm run linux:bootstrap -- --verify-only",
  },
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
];

const failures = [];
const existingFiles = new Set();

function read(path) {
  return readFileSync(path, "utf8");
}

function firstStatus(text) {
  return text.match(/^Status: ([^\n]+)$/m)?.[1] ?? "";
}

for (const path of requiredFiles) {
  try {
    const stats = statSync(path);
    if (!stats.isFile()) {
      failures.push(`${path} is not a file.`);
    } else {
      existingFiles.add(path);
    }
  } catch {
    failures.push(`${path} is missing.`);
  }
}

for (const { path, text } of requiredLinks) {
  try {
    if (!read(path).includes(text)) {
      failures.push(`${path} must reference ${text}.`);
    }
  } catch {
    failures.push(`${path} is missing.`);
  }
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

const laneStatusPath = "docs/linux-install/planning/lane-status.md";
const laneStatus = existingFiles.has(laneStatusPath) ? read(laneStatusPath) : "";
const laneDelivered = /^Status: delivered$/m.test(laneStatus);

if (existingFiles.has(laneStatusPath)) {
  for (const expected of [
    "Status: delivered",
    "PR #144 passed CI",
	    "no unresolved review",
	    "remote PR branch was deleted",
	    "pr-144-delivery-record.md",
	    "retrospective draft synthesis",
	  ]) {
	    if (!laneStatus.includes(expected)) {
	      failures.push(`Linux install lane status must record delivered closeout evidence: ${expected}`);
	    }
	  }
	  if (/Completed BMAD lane retrospective/.test(laneStatus)) {
	    failures.push("docs/linux-install/planning/lane-status.md must not claim the interactive BMAD retrospective is complete.");
	  }
	}

if (laneDelivered) {
  for (const storyPath of requiredFiles.filter((path) => path.startsWith("docs/linux-install/planning/stories/"))) {
    const story = read(storyPath);
    if (firstStatus(story) !== "done") {
      failures.push(`${storyPath} must be Status: done after lane delivery.`);
    }
  }
}

if (existingFiles.has("docs/linux-install/index.md")) {
  const index = read("docs/linux-install/index.md");
  if (!/^Status: delivered$/m.test(index)) {
    failures.push("docs/linux-install/index.md must mark the Linux install lane delivered.");
  }
  if (!index.includes("delivered through PR #144")) {
    failures.push("docs/linux-install/index.md must reference PR #144 delivery.");
  }
}

try {
  const prdIndex = read("docs/prds/index.md");
	  if (!prdIndex.includes("Delivered lane") || !prdIndex.includes("completed through PR #144")) {
	    failures.push("docs/prds/index.md must reflect Linux Install MVP PR #144 delivery.");
	  }
	  if (!prdIndex.includes("retrospective draft synthesis")) {
	    failures.push("docs/prds/index.md must describe the Linux retrospective as a draft synthesis.");
	  }
	  if (!prdIndex.includes("source PRD file intentionally retains draft metadata")) {
	    failures.push("docs/prds/index.md must clarify that Linux Install MVP PRD metadata remains draft.");
	  }
	  if (/retrospective completed/.test(prdIndex)) {
	    failures.push("docs/prds/index.md must not claim the interactive Linux retrospective is complete.");
	  }
} catch {
  failures.push("docs/prds/index.md is missing.");
}

if (existingFiles.has("docs/prds/linux-install-mvp.md")) {
  const prd = read("docs/prds/linux-install-mvp.md");
  if (!prd.includes("status: draft")) {
    failures.push("docs/prds/linux-install-mvp.md must retain explicit draft status until BMAD finalization.");
  }
  if (!prd.includes("FR39")) {
    failures.push("docs/prds/linux-install-mvp.md must include recovered FR coverage through FR39.");
  }
}

if (existingFiles.has("docs/linux-install/planning/linux-install-epics-and-stories.md")) {
  const epics = read("docs/linux-install/planning/linux-install-epics-and-stories.md");
  for (const step of [
    "step-01-validate-prerequisites",
    "step-02-design-epics",
    "step-03-create-stories",
    "step-04-final-validation",
  ]) {
    if (!epics.includes(step)) {
      failures.push(`docs/linux-install/planning/linux-install-epics-and-stories.md must include ${step}.`);
    }
  }
}

if (existingFiles.has("docs/linux-install/evidence/local-verify-only-20260618T181400Z.json")) {
  try {
    const evidence = JSON.parse(read("docs/linux-install/evidence/local-verify-only-20260618T181400Z.json"));
    if (evidence.result !== "pass") {
      failures.push("docs/linux-install/evidence/local-verify-only-20260618T181400Z.json must be passing evidence.");
    }
  } catch (error) {
    failures.push(`docs/linux-install/evidence/local-verify-only-20260618T181400Z.json is not valid JSON: ${error.message}`);
  }
}

if (existingFiles.has("docs/linux-install/planning/implementation-readiness-report-2026-06-18.md")) {
  const readiness = read("docs/linux-install/planning/implementation-readiness-report-2026-06-18.md");
  if (!readiness.includes("Overall Readiness Status")) {
    failures.push("docs/linux-install/planning/implementation-readiness-report-2026-06-18.md must include final readiness status.");
  }
  if (!readiness.includes("NEEDS WORK")) {
    failures.push("docs/linux-install/planning/implementation-readiness-report-2026-06-18.md must preserve the current readiness decision.");
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/1-1-declare-certified-ubuntu-target-and-single-install-method.md")) {
  const story = read("docs/linux-install/planning/stories/1-1-declare-certified-ubuntu-target-and-single-install-method.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done)/.test(story)) {
    failures.push("Story 1.1 must be marked ready-for-dev, review, or done.");
  }
  if (!story.includes("Ubuntu 26.04+")) {
    failures.push("Story 1.1 must preserve the certified Ubuntu target.");
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/1-2-enforce-local-identity-and-platform-preflight-gates.md")) {
  const story = read("docs/linux-install/planning/stories/1-2-enforce-local-identity-and-platform-preflight-gates.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done)/.test(story)) {
    failures.push("Story 1.2 must be marked ready-for-dev, review, or done.");
  }
  for (const expected of ["Root user fails", "Unsupported OS/version fails", "Missing sudo fails", "GitHub DNS failure fails"]) {
    if (!story.includes(expected)) {
      failures.push(`Story 1.2 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/1-3-provide-non-mutating-plan-and-verify-modes.md")) {
  const story = read("docs/linux-install/planning/stories/1-3-provide-non-mutating-plan-and-verify-modes.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done)/.test(story)) {
    failures.push("Story 1.3 must be marked ready-for-dev, review, or done.");
  }
  for (const expected of ["Plan mode records no mutations", "Verify-only records only evidence-file mutation"]) {
    if (!story.includes(expected)) {
      failures.push(`Story 1.3 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/1-4-reject-unsupported-remote-and-apply-arguments.md")) {
  const story = read("docs/linux-install/planning/stories/1-4-reject-unsupported-remote-and-apply-arguments.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done)/.test(story)) {
    failures.push("Story 1.4 must be marked ready-for-dev, review, or done.");
  }
  for (const expected of ["`--apply` rejected", "`--target` rejected", "`--user` rejected"]) {
    if (!story.includes(expected)) {
      failures.push(`Story 1.4 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/1-5-enforce-shell-bootstrap-as-the-only-mutating-install-path.md")) {
  const story = read("docs/linux-install/planning/stories/1-5-enforce-shell-bootstrap-as-the-only-mutating-install-path.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done)/.test(story)) {
    failures.push("Story 1.5 must be marked ready-for-dev, review, or done.");
  }
  for (const expected of [
    "Alternate Node/controller mutating install command is rejected",
    "Historical/lab note fencing is required",
    "validateSingleMutatingInstallBoundary",
  ]) {
    if (!story.includes(expected)) {
      failures.push(`Story 1.5 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/2-1-install-or-verify-approved-base-toolchain.md")) {
  const story = read("docs/linux-install/planning/stories/2-1-install-or-verify-approved-base-toolchain.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done)/.test(story)) {
    failures.push("Story 2.1 must be marked ready-for-dev, review, or done.");
  }
  for (const expected of [
    "Approved Ubuntu package set includes Node",
    "Toolchain failure guidance points back to the same single install command",
    "agent CLI install failure has recovery guidance",
  ]) {
    if (!story.includes(expected)) {
      failures.push(`Story 2.1 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/2-2-record-existing-versus-changed-tool-state.md")) {
  const story = read("docs/linux-install/planning/stories/2-2-record-existing-versus-changed-tool-state.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done)/.test(story)) {
    failures.push("Story 2.2 must be marked ready-for-dev, review, or done.");
  }
  for (const expected of [
    "Tool statuses distinguish `existing`, `installed`, `changed`, `skipped`, and `failed`",
    "`scripts/validate-linux-install.sh` accepts `--tool-changes-json`",
    "Existing verify-only evidence remains valid",
  ]) {
    if (!story.includes(expected)) {
      failures.push(`Story 2.2 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/2-3-clone-or-validate-kendall-nxt-repo-state.md")) {
  const story = read("docs/linux-install/planning/stories/2-3-clone-or-validate-kendall-nxt-repo-state.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done)/.test(story)) {
    failures.push("Story 2.3 must be marked ready-for-dev, review, or done.");
  }
  for (const expected of [
    "Clone path uses non-interactive `git ls-remote`",
    "Existing checkout `git status` failure exits with recovery guidance",
    "Direct git clone failure exits with recovery guidance",
  ]) {
    if (!story.includes(expected)) {
      failures.push(`Story 2.3 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/2-4-block-cleanly-when-private-repo-access-is-missing.md")) {
  const story = read("docs/linux-install/planning/stories/2-4-block-cleanly-when-private-repo-access-is-missing.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done)/.test(story)) {
    failures.push("Story 2.4 must be marked ready-for-dev, review, or done.");
  }
  for (const expected of [
    "Blocked evidence uses `repo-access`",
    "`gh auth login` is forbidden",
    "Token import and credential helper mutation are forbidden",
  ]) {
    if (!story.includes(expected)) {
      failures.push(`Story 2.4 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/2-5-run-project-setup-and-final-verify-from-validated-checkout.md")) {
  const story = read("docs/linux-install/planning/stories/2-5-run-project-setup-and-final-verify-from-validated-checkout.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done)/.test(story)) {
    failures.push("Story 2.5 must be marked ready-for-dev, review, or done.");
  }
  for (const expected of [
    "`ensure_repo` precedes repo evidence directory use and project setup",
    "Final validation failure has recovery guidance and evidence pointer",
    "Wrapped final validation in explicit failure handling",
  ]) {
    if (!story.includes(expected)) {
      failures.push(`Story 2.5 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/2-6-prove-safe-rerun-behavior-across-install-states.md")) {
  const story = read("docs/linux-install/planning/stories/2-6-prove-safe-rerun-behavior-across-install-states.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done)/.test(story)) {
    failures.push("Story 2.6 must be marked ready-for-dev, review, or done.");
  }
  for (const expected of [
    "Collision-safe evidence naming is asserted",
    "Non-git existing repo path failure gives exact recovery guidance",
    "Successful verify rerun guidance is asserted",
  ]) {
    if (!story.includes(expected)) {
      failures.push(`Story 2.6 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/3-1-write-schema-compliant-success-failure-and-blocked-evidence.md")) {
  const story = read("docs/linux-install/planning/stories/3-1-write-schema-compliant-success-failure-and-blocked-evidence.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done)/.test(story)) {
    failures.push("Story 3.1 must be marked ready-for-dev, review, or done.");
  }
  for (const expected of [
    "Blocked install evidence includes `checks_summary.blocked`",
    "Schema validation rejects mismatched blocked summary counts",
    "`write_install_outcome_evidence` emits blocked summary count",
  ]) {
    if (!story.includes(expected)) {
      failures.push(`Story 3.1 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/3-2-emit-pre-repo-blocked-evidence-safely.md")) {
  const story = read("docs/linux-install/planning/stories/3-2-emit-pre-repo-blocked-evidence-safely.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done)/.test(story)) {
    failures.push("Story 3.2 must be marked ready-for-dev, review, or done.");
  }
  for (const expected of [
    "Source shell helper and emit blocked repo-access evidence to stdout",
    "Assert stderr is empty for the helper path",
    "Add Bash source guard before invoking `main \"$@\"`",
  ]) {
    if (!story.includes(expected)) {
      failures.push(`Story 3.2 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/3-3-enforce-evidence-redaction-and-required-fields.md")) {
  const story = read("docs/linux-install/planning/stories/3-3-enforce-evidence-redaction-and-required-fields.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done)/.test(story)) {
    failures.push("Story 3.3 must be marked ready-for-dev, review, or done.");
  }
  for (const expected of [
    "Reject GitHub and provider token-like values",
    "Skip redaction labels during forbidden-text scanning",
    "Leaked token/auth URL/private-key text fails validation",
  ]) {
    if (!story.includes(expected)) {
      failures.push(`Story 3.3 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/3-4-protect-evidence-paths-from-unsafe-writes.md")) {
  const story = read("docs/linux-install/planning/stories/3-4-protect-evidence-paths-from-unsafe-writes.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done)/.test(story)) {
    failures.push("Story 3.4 must be marked ready-for-dev, review, or done.");
  }
  for (const expected of [
    "Absolute outside path is rejected",
    "Path traversal out of approved evidence directory is rejected",
    "Existing evidence file overwrite remains rejected",
  ]) {
    if (!story.includes(expected)) {
      failures.push(`Story 3.4 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/3-5-deny-automated-auth-and-secret-handling.md")) {
  const story = read("docs/linux-install/planning/stories/3-5-deny-automated-auth-and-secret-handling.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done)/.test(story)) {
    failures.push("Story 3.5 must be marked ready-for-dev, review, or done.");
  }
  for (const expected of [
    "GitHub auth login, token, refresh, and setup-git commands are forbidden",
    "`ssh-add` and private-key file handling commands are forbidden",
    "Auth-boundary booleans must remain false",
  ]) {
    if (!story.includes(expected)) {
      failures.push(`Story 3.5 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/3-6-keep-troubleshooting-and-lessons-learned-current.md")) {
  const story = read("docs/linux-install/planning/stories/3-6-keep-troubleshooting-and-lessons-learned-current.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done)/.test(story)) {
    failures.push("Story 3.6 must be marked ready-for-dev, review, or done.");
  }
  for (const expected of [
    "Evidence path rejection recovery",
    "Blocked repo access stdout parseability recovery",
    "Runtime tests are needed for shell evidence helpers",
  ]) {
    if (!story.includes(expected)) {
      failures.push(`Story 3.6 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/4-1-map-stories-to-release-gates-before-execution.md")) {
  const story = read("docs/linux-install/planning/stories/4-1-map-stories-to-release-gates-before-execution.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done)/.test(story)) {
    failures.push("Story 4.1 must be marked ready-for-dev, review, or done.");
  }
  for (const expected of [
    "Stories 1.1 through 3.6 are mapped",
    "Lane checker requires traceability rows for mapped stories",
    "authority class, command ids, expected evidence, and release gates",
  ]) {
    if (!story.includes(expected)) {
      failures.push(`Story 4.1 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/4-2-define-durable-goal-run-task-state-and-command-contracts.md")) {
  const story = read("docs/linux-install/planning/stories/4-2-define-durable-goal-run-task-state-and-command-contracts.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done)/.test(story)) {
    failures.push("Story 4.2 must be marked ready-for-dev, review, or done.");
  }
  for (const expected of [
    "Add authority class, allowed mode, last command, next command, evidence paths, completion condition, blocked condition, and resume command",
    "Blocked-continuation fixture tasks require full state fields",
    "Existing command-contract validation continues to enforce bounded commands",
  ]) {
    if (!story.includes(expected)) {
      failures.push(`Story 4.2 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/4-3-enforce-bounded-authority-ledger-decisions.md")) {
  const story = read("docs/linux-install/planning/stories/4-3-enforce-bounded-authority-ledger-decisions.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done)/.test(story)) {
    failures.push("Story 4.3 must be marked ready-for-dev, review, or done.");
  }
  for (const expected of [
    "Generic approval examples include continue, do whatever is needed, and finish it",
    "Valid preauthorization entries require non-empty bounded authority fields",
    "Valid preauthorization must authorize the matching command id",
  ]) {
    if (!story.includes(expected)) {
      failures.push(`Story 4.3 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/4-4-record-blocker-packets-for-gated-operations.md")) {
  const story = read("docs/linux-install/planning/stories/4-4-record-blocker-packets-for-gated-operations.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done)/.test(story)) {
    failures.push("Story 4.4 must be marked ready-for-dev, review, or done.");
  }
  for (const expected of [
    "Blocker fixtures require blocked_task_status authority-blocked-not-complete",
    "Manual Auth, paid provider, destructive cleanup, and Tailnet blocker fixtures are covered",
    "Goal-run contract blocker packet schema includes blocked_task_status",
  ]) {
    if (!story.includes(expected)) {
      failures.push(`Story 4.4 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/4-5-apply-safe-continuation-after-blockers.md")) {
  const story = read("docs/linux-install/planning/stories/4-5-apply-safe-continuation-after-blockers.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done)/.test(story)) {
    failures.push("Story 4.5 must be marked ready-for-dev, review, or done.");
  }
  for (const expected of [
    "Blocked-continuation fixture marks the private repo probe dependency_blocked",
    "Contract validation requires independent docs drift work to continue",
    "Contract validation rejects dependency-blocked work being treated as complete or skipped",
  ]) {
    if (!story.includes(expected)) {
      failures.push(`Story 4.5 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/4-6-generate-completion-reports-from-evidence.md")) {
  const story = read("docs/linux-install/planning/stories/4-6-generate-completion-reports-from-evidence.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done)/.test(story)) {
    failures.push("Story 4.6 must be marked ready-for-dev, review, or done.");
  }
  for (const expected of [
    "Missing-evidence fixture keeps release_gate_status open and expected completion not_complete",
    "Missing-evidence fixture lists open blockers",
    "Terminal delivery authority is required for pr-create, merge, and workspace-cleanup",
  ]) {
    if (!story.includes(expected)) {
      failures.push(`Story 4.6 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/5-1-separate-supported-install-docs-from-historical-notes.md")) {
  const story = read("docs/linux-install/planning/stories/5-1-separate-supported-install-docs-from-historical-notes.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done)/.test(story)) {
    failures.push("Story 5.1 must be marked ready-for-dev, review, or done.");
  }
  for (const expected of [
    "Contract validation requires historical and lab entries to be labeled non-authoritative",
    "Generic install path remains the single local bootstrap method",
    "Index separates supported install docs from historical notes",
  ]) {
    if (!story.includes(expected)) {
      failures.push(`Story 5.1 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/5-2-prove-published-bootstrap-source-reachability.md")) {
  const story = read("docs/linux-install/planning/stories/5-2-prove-published-bootstrap-source-reachability.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done)/.test(story)) {
    failures.push("Story 5.2 must be marked ready-for-dev, review, or done.");
  }
  for (const expected of [
    "Published main proof cannot be claimed until pnpm run check:linux-bootstrap-url passes",
    "Known raw GitHub main 404 gap remains documented",
    "Contract validation guards pre-merge proof from being represented as published main proof",
  ]) {
    if (!story.includes(expected)) {
      failures.push(`Story 5.2 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/5-3-capture-fresh-ubuntu-first-install-evidence.md")) {
  const story = read("docs/linux-install/planning/stories/5-3-capture-fresh-ubuntu-first-install-evidence.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done|Status: blocked)/.test(story)) {
    failures.push("Story 5.3 must be marked ready-for-dev, review, done, or blocked.");
  }
  for (const expected of [
    "Fresh first-install evidence fixture forbids local-verify-only as release proof",
    "Contract validation requires blocked_no_real_host_evidence until real first-install evidence exists",
    "Transcript-backed first-install evidence was captured from host `ubuntutest`",
    "Story delivered through PR #144",
  ]) {
    if (!story.includes(expected)) {
      failures.push(`Story 5.3 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/5-4-capture-idempotent-rerun-evidence.md")) {
  const story = read("docs/linux-install/planning/stories/5-4-capture-idempotent-rerun-evidence.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done|Status: blocked)/.test(story)) {
    failures.push("Story 5.4 must be marked ready-for-dev, review, done, or blocked.");
  }
  for (const expected of [
    "Idempotent rerun evidence fixture requires first-install evidence first",
    "Contract validation requires same-host, no-destructive-cleanup, and safe-rerun-guidance assertions",
    "Transcript-backed same-host rerun evidence was captured from host `ubuntutest`",
    "Story delivered through PR #144",
  ]) {
    if (!story.includes(expected)) {
      failures.push(`Story 5.4 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/5-5-refresh-release-docs-and-linux-install-package.md")) {
  const story = read("docs/linux-install/planning/stories/5-5-refresh-release-docs-and-linux-install-package.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done|Status: blocked)/.test(story)) {
    failures.push("Story 5.5 must be marked ready-for-dev, review, done, or blocked.");
  }
  for (const expected of [
    "Package refresh gate requires published bootstrap reachability, first-install evidence, and rerun evidence",
    "Contract validation requires package_refreshed after release evidence is available",
    "Package refresh was completed after published-source, first-install, rerun, and review evidence existed",
    "Story delivered through PR #144",
  ]) {
    if (!story.includes(expected)) {
      failures.push(`Story 5.5 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/stories/5-6-run-final-verification-and-code-review-before-delivery.md")) {
  const story = read("docs/linux-install/planning/stories/5-6-run-final-verification-and-code-review-before-delivery.md");
  if (!/(Status: ready-for-dev|Status: review|Status: done|Status: blocked)/.test(story)) {
    failures.push("Story 5.6 must be marked ready-for-dev, review, done, or blocked.");
  }
  for (const expected of [
    "Pre-PR code review artifact records the fixed contract-checker robustness finding",
    "Final local verification passes while release evidence blockers remain explicit",
    "No PR is created until blocked release evidence and review gates are resolved",
  ]) {
    if (!story.includes(expected)) {
      failures.push(`Story 5.6 must include task coverage for: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/reviews/pre-pr-code-review-2026-06-18.md")) {
  const review = read("docs/linux-install/planning/reviews/pre-pr-code-review-2026-06-18.md");
  for (const expected of [
    "Finding fixed",
    "contract checker could throw",
    "PR #144",
    "merged into `main`",
  ]) {
    if (!review.includes(expected)) {
      failures.push(`pre-pr code review must record: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/planning/reviews/pr-144-delivery-record.md")) {
  const delivery = read("docs/linux-install/planning/reviews/pr-144-delivery-record.md");
  for (const expected of [
    "PR #144 merged into `main`",
    "CI `check` passed",
    "no unresolved review threads",
    "remote branch `codex/continue-linux-install-work` was deleted",
    "Authority And Evidence",
    "Approval record: user message on 2026-06-18 approving terminal delivery",
    "approving primary-worktree",
    "Authority family: terminal delivery",
    "Authority family: primary-worktree maintenance",
    "Operations: PR merge and remote PR branch deletion",
    "Operations: discard one obsolete untracked local evidence packet",
    "Scope: PR #144 and branch `codex/continue-linux-install-work`",
    "Evidence required: GitHub PR state, CI state, review-thread state",
    "Command:",
    "Exit:",
    "Output excerpt:",
    "git status --short --untracked-files=all",
    "Discarded path:",
    "local-verify-only-20260618T161354Z.json",
    "git rev-parse HEAD",
    "git rev-parse origin/main",
    "reviewThreads.nodes",
  ]) {
    if (!delivery.includes(expected)) {
      failures.push(`PR 144 delivery record must include: ${expected}`);
    }
  }
  const shaPattern = /`[0-9a-f]{40}`/g;
  if ((delivery.match(shaPattern) ?? []).length < 2) {
    failures.push("PR 144 delivery record must include merge and delivery commit SHAs.");
  }
  if (!/PR: https:\/\/github\.com\/slawdawg\/Kendall-vnxt\/pull\/144/.test(delivery)) {
    failures.push("PR 144 delivery record must include the PR URL.");
  }
}

if (existingFiles.has("docs/linux-install/planning/reviews/linux-install-mvp-retrospective-2026-06-18.md")) {
  const retrospective = read("docs/linux-install/planning/reviews/linux-install-mvp-retrospective-2026-06-18.md");
  for (const expected of [
    "# Linux Install MVP Retrospective Draft Synthesis",
    "Scope: Epics 1-5, Stories 1.1-5.6",
    "Delivery PR: https://github.com/slawdawg/Kendall-vnxt/pull/144",
    "not completed interactive",
    "no user dialogue is fabricated",
    "Terminal delivery is its own implementation surface",
    "narrow closeout PR",
    "formal BMAD",
  ]) {
    if (!retrospective.includes(expected)) {
      failures.push(`Linux Install MVP retrospective must include: ${expected}`);
    }
  }
}

if (existingFiles.has("docs/linux-install/release-gate-traceability.md")) {
  const traceability = read("docs/linux-install/release-gate-traceability.md");
  for (const storyPath of [
    "1-1-declare-certified-ubuntu-target-and-single-install-method.md",
    "1-2-enforce-local-identity-and-platform-preflight-gates.md",
    "1-3-provide-non-mutating-plan-and-verify-modes.md",
    "1-4-reject-unsupported-remote-and-apply-arguments.md",
    "1-5-enforce-shell-bootstrap-as-the-only-mutating-install-path.md",
    "2-1-install-or-verify-approved-base-toolchain.md",
    "2-2-record-existing-versus-changed-tool-state.md",
    "2-3-clone-or-validate-kendall-nxt-repo-state.md",
    "2-4-block-cleanly-when-private-repo-access-is-missing.md",
    "2-5-run-project-setup-and-final-verify-from-validated-checkout.md",
    "2-6-prove-safe-rerun-behavior-across-install-states.md",
    "3-1-write-schema-compliant-success-failure-and-blocked-evidence.md",
    "3-2-emit-pre-repo-blocked-evidence-safely.md",
    "3-3-enforce-evidence-redaction-and-required-fields.md",
    "3-4-protect-evidence-paths-from-unsafe-writes.md",
    "3-5-deny-automated-auth-and-secret-handling.md",
    "3-6-keep-troubleshooting-and-lessons-learned-current.md",
  ]) {
    if (!traceability.includes(storyPath)) {
      failures.push(`docs/linux-install/release-gate-traceability.md must map ${storyPath}.`);
    }
  }
  for (const expected of ["Authority class", "Command ids", "Expected evidence", "Release gates"]) {
    if (!traceability.includes(expected)) {
      failures.push(`docs/linux-install/release-gate-traceability.md must include ${expected}.`);
    }
  }
}

if (failures.length > 0) {
  console.error(`Linux install lane checks failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("Linux install lane checks passed.");
