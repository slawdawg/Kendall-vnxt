# Linux Install MVP Lane Status

Date: 2026-06-18
Status: recovered combined lane

## Current Scope

The Linux Install MVP lane combines:

- tracked PRD and decision log,
- tracked architecture input,
- tracked epics and stories,
- Linux install docs and validation matrix updates,
- local verify-only evidence,
- durable autonomous goal prompt.

Ignored `_bmad-output/planning-artifacts/` files are provenance only. The
tracked files under `docs/` are the source of truth.

## Current Step

Implementation readiness has completed for the recovered combined lane.
Sprint planning has generated local BMAD sprint status. Stories 1.1 through
5.6 have been created. Published-source reachability, fresh Ubuntu
first-install, and same-host rerun validation evidence have been captured.
`docs/linux-install.zip` has been refreshed after release evidence was recorded.
Epics 2, 3, 4, and 5 are fully implemented and ready for review. Story 5.6
completed local verification and pre-PR review. The next workflow step is final
verification, review refresh if needed, and PR delivery.

## Completed Recovery

- Recovered Linux bootstrap command syntax docs update.
- Recovered local verify-only evidence.
- Promoted BMAD PRD, decision log, architecture input, and epics/stories into
  tracked docs.
- Added navigation from `docs/prds/index.md` and `docs/linux-install/index.md`.
- Added this lane status file and `next-goal-prompt.md`.
- Added tracked implementation-readiness report:
  `docs/linux-install/planning/implementation-readiness-report-2026-06-18.md`.
- Generated local BMAD sprint status at
  `_bmad-output/implementation-artifacts/sprint-status.yaml` with 5 epics, 29
  stories, and 5 retrospectives. This file is ignored local workflow state, not
  the tracked lane source of truth.
- Created Story 1.1 at
  `docs/linux-install/planning/stories/1-1-declare-certified-ubuntu-target-and-single-install-method.md`
  and BMAD local state at
  `_bmad-output/implementation-artifacts/1-1-declare-certified-ubuntu-target-and-single-install-method.md`.
- Implemented Story 1.1 by correcting active Linux docs command syntax and
  extending the lane drift check for those docs.
- Generated BMAD code-review prompt files for Story 1.1 because formal
  subagent review tooling is unavailable in this environment. In-session review
  found no additional actionable Story 1.1 defects.
- Created and implemented Story 1.2 at
  `docs/linux-install/planning/stories/1-2-enforce-local-identity-and-platform-preflight-gates.md`
  by expanding direct local identity gate tests for unsafe host states and
  recovery guidance.
- Created and implemented Story 1.3 at
  `docs/linux-install/planning/stories/1-3-provide-non-mutating-plan-and-verify-modes.md`
  by strengthening controller tests for plan and verify-only non-mutation
  behavior.
- Created and implemented Story 1.4 at
  `docs/linux-install/planning/stories/1-4-reject-unsupported-remote-and-apply-arguments.md`
  by adding entrypoint-level unsupported argument rejection coverage.
- Created and implemented Story 1.5 at
  `docs/linux-install/planning/stories/1-5-enforce-shell-bootstrap-as-the-only-mutating-install-path.md`
  by adding explicit single-mutating-install-boundary checks to the Linux
  install contract checker.
- Created and implemented Story 2.1 at
  `docs/linux-install/planning/stories/2-1-install-or-verify-approved-base-toolchain.md`
  by hardening approved toolchain recovery guidance and adding focused
  bootstrap-script tests.
- Created and implemented Story 2.2 at
  `docs/linux-install/planning/stories/2-2-record-existing-versus-changed-tool-state.md`
  by threading structured tool-change rows from the mutating bootstrap into
  final install evidence.
- Created and implemented Story 2.3 at
  `docs/linux-install/planning/stories/2-3-clone-or-validate-kendall-nxt-repo-state.md`
  by hardening existing checkout validation and clone failure recovery.
- Created and implemented Story 2.4 at
  `docs/linux-install/planning/stories/2-4-block-cleanly-when-private-repo-access-is-missing.md`
  by strengthening auth-boundary regression coverage for missing private repo
  access.
- Created and implemented Story 2.5 at
  `docs/linux-install/planning/stories/2-5-run-project-setup-and-final-verify-from-validated-checkout.md`
  by making final validation failure handling explicit after validated checkout
  setup.
- Created and implemented Story 2.6 at
  `docs/linux-install/planning/stories/2-6-prove-safe-rerun-behavior-across-install-states.md`
  by tightening safe-rerun coverage and unsupported existing-path recovery
  guidance.
- Created and implemented Story 3.1 at
  `docs/linux-install/planning/stories/3-1-write-schema-compliant-success-failure-and-blocked-evidence.md`
  by adding blocked summary count validation and emission for install outcome
  evidence.
- Created and implemented Story 3.2 at
  `docs/linux-install/planning/stories/3-2-emit-pre-repo-blocked-evidence-safely.md`
  by adding runtime blocked stdout evidence validation and making shell helpers
  source-safe for tests.
- Created and implemented Story 3.3 at
  `docs/linux-install/planning/stories/3-3-enforce-evidence-redaction-and-required-fields.md`
  by adding retained-text secret/auth artifact scanning to evidence validation.
- Created and implemented Story 3.4 at
  `docs/linux-install/planning/stories/3-4-protect-evidence-paths-from-unsafe-writes.md`
  by adding validator runtime tests for outside and path-traversal evidence
  paths.
- Created and implemented Story 3.5 at
  `docs/linux-install/planning/stories/3-5-deny-automated-auth-and-secret-handling.md`
  by strengthening auth-boundary source scans for GitHub auth and private-key
  handling commands.
- Created and implemented Story 3.6 at
  `docs/linux-install/planning/stories/3-6-keep-troubleshooting-and-lessons-learned-current.md`
  by updating troubleshooting and lessons learned for lane-discovered recovery
  paths.
- Created and implemented Story 4.1 at
  `docs/linux-install/planning/stories/4-1-map-stories-to-release-gates-before-execution.md`
  by adding release-gate traceability rows for Stories 1.1 through 3.6 and a
  lane drift guard for those mappings.
- Created and implemented Story 4.2 at
  `docs/linux-install/planning/stories/4-2-define-durable-goal-run-task-state-and-command-contracts.md`
  by expanding blocked-continuation task state and strengthening command
  contract validation.
- Created and implemented Story 4.3 at
  `docs/linux-install/planning/stories/4-3-enforce-bounded-authority-ledger-decisions.md`
  by requiring generic approval examples to be rejected and bounded authority
  entries to name non-empty command, target, evidence, recovery, approval, and
  stop-line fields.
- Created and implemented Story 4.4 at
  `docs/linux-install/planning/stories/4-4-record-blocker-packets-for-gated-operations.md`
  by adding explicit not-complete blocked task status to blocker packets and
  requiring it in contract validation.
- Created and implemented Story 4.5 at
  `docs/linux-install/planning/stories/4-5-apply-safe-continuation-after-blockers.md`
  by enforcing blocked-continuation results: independent docs drift work
  continues while dependent repo probing is dependency-blocked and not complete
  or skipped.
- Created and implemented Story 4.6 at
  `docs/linux-install/planning/stories/4-6-generate-completion-reports-from-evidence.md`
  by making missing-evidence completion fixtures require open release gate,
  open blocker, and terminal delivery authority checks before completion.
- Created and implemented Story 5.1 at
  `docs/linux-install/planning/stories/5-1-separate-supported-install-docs-from-historical-notes.md`
  by requiring the Linux install index to label historical and lab-instance
  entries as non-authoritative for the supported v1 install path.
- Created and implemented Story 5.2 at
  `docs/linux-install/planning/stories/5-2-prove-published-bootstrap-source-reachability.md`
  by guarding the published `main` bootstrap claim behind
  `pnpm run check:linux-bootstrap-url` and preserving the known 404 publication
  gap until real reachability evidence exists.
- Captured passing published bootstrap URL reachability evidence at
  `docs/linux-install/evidence/bootstrap-url-reachability-20260618T200827Z.json`.
- Recorded fresh-host blocker at
  `docs/linux-install/evidence/goal-runs/20260618T200827Z/blockers/fresh-host-required.json`
  because this host is not a fresh or reset install target.
- Created Story 5.3 at
  `docs/linux-install/planning/stories/5-3-capture-fresh-ubuntu-first-install-evidence.md`
  and marked it blocked on real host proof. Added a fixture and contract
  validation so local verify-only evidence cannot substitute for first-install
  release proof.
- Recorded fresh Ubuntu first-install validation evidence from host `ubuntutest`
  at `docs/linux-install/evidence/goal-runs/20260618T201830Z/fresh-install-and-rerun-validation-transcript.md`.
- Created Story 5.4 at
  `docs/linux-install/planning/stories/5-4-capture-idempotent-rerun-evidence.md`
  and marked it blocked on first-install proof. Added a fixture and contract
  validation so idempotency requires same-host rerun evidence after first
  install succeeds.
- Recorded same-host rerun validation evidence from host `ubuntutest` at
  `docs/linux-install/evidence/goal-runs/20260618T201830Z/fresh-install-and-rerun-validation-transcript.md`.
- Created Story 5.5 at
  `docs/linux-install/planning/stories/5-5-refresh-release-docs-and-linux-install-package.md`
  and marked it blocked on missing release evidence. Added a fixture and
  contract validation so `docs/linux-install.zip` is not refreshed as a
  substitute for published-source, first-install, rerun, docs, validation, or
  review evidence.
- Refreshed `docs/linux-install.zip` after published-source, first-install, and
  rerun validation evidence were recorded.
- Created and implemented Story 5.6 at
  `docs/linux-install/planning/stories/5-6-run-final-verification-and-code-review-before-delivery.md`
  by running final local verification, performing pre-PR code review, fixing the
  contract-checker robustness finding, and recording review evidence at
  `docs/linux-install/planning/reviews/pre-pr-code-review-2026-06-18.md`.

## Verification State

Latest focused checks:

- `git diff --check` passed.
- `node ./scripts/check-linux-install-contract.mjs` passed.
- `node ./scripts/check-doc-indexes.mjs` passed.
- `node ./scripts/check-linux-bootstrap.mjs` passed.
- `node ./scripts/check-linux-install-lane.mjs` passed.
- `node ./scripts/check-linux-bootstrap-evidence.mjs docs/linux-install/evidence/local-verify-only-20260618T181400Z.json` passed.

## Open Work

- Create the terminal PR for the completed Linux Install MVP lane.
- After PR CI completes, resolve and mark all actionable GitHub comments before
  merge is considered.

## Stop Lines

- No provider calls or paid usage.
- No account login, browser auth, token writes, private-key handling, or
  credential helper mutation.
- No Tailscale enrollment.
- No reboot, destructive cleanup, branch deletion, merge, or worktree cleanup
  without matching approval.
- No PR before workflow/readiness/implementation/review are complete unless the
  lane becomes too large or unsafe to review as one PR.

## Next Safe Command

```bash
node ./scripts/check-linux-install-lane.mjs
```
