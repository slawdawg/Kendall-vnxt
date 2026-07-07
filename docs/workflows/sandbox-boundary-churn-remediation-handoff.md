# Sandbox Boundary Churn Remediation Handoff

Date: 2026-07-06
Status: ready for implementation planning
Related workflow: `docs/workflows/tool-churn-rca.md`

## Purpose

Use this handoff to start a future session that fixes the sandbox-boundary churn
seen while dogfooding the manager control plane. The goal is not to weaken
sandbox safety. The goal is to make known sandbox boundaries explicit,
detectable, and low-friction so the manager and Codex sessions stop repeatedly
trying commands that can only fail in the managed sandbox.

## Start Prompt

```text
Use docs/workflows/sandbox-boundary-churn-remediation-handoff.md as the source
artifact. Implement the next safe slice to reduce Kendall_Nxt sandbox-boundary
tool churn without weakening authority gates. Follow docs/workflows/tool-churn-rca.md,
preserve exact-command outside-sandbox reruns for known read-only boundaries,
add focused tests, and stop before any new authority expansion.
```

## Churn Observed In This Run

### Manager Preflight EPERM

- Command: `node ./scripts/manager-preflight.mjs --summary-json`
- Sandbox result: blocked by EPERM-style boundaries while probing Git, tmux,
  and assignment inventory.
- Outside-sandbox exact rerun: succeeded and produced usable manager readiness
  evidence.
- Classification: `sandbox`
- Desired behavior: detect this as a known read-only boundary and emit a compact
  approval packet instead of letting the manager treat it like a novel failure.

### Manager Cycle Packet EPERM

- Command: `node ./scripts/manager-cycle-packet.mjs --summary-json`
- Sandbox result: blocked by the same family of EPERM boundaries.
- Outside-sandbox exact rerun: succeeded and showed canonical assignment
  inventory, safe backlog state, workers, cleanup gates, and no self-repair
  churn.
- Classification: `sandbox`
- Desired behavior: same boundary classification and exact-rerun guidance as
  preflight.

### Manager Run Loop Preflight Stop

- Command: `node ./scripts/manager-run-loop.mjs --summary-json --once`
- Sandbox result: embedded preflight hit the same sandbox boundary before useful
  manager work could start.
- Outside-sandbox exact rerun: stopped safely at preflight with backlog and
  cleanup blockers; no worker launch or mutation.
- Classification: `sandbox`
- Desired behavior: manager run loop should surface "known sandbox preflight
  boundary" as a stop reason, not as a self-repair target.

### Stale Owner Inspection EPERM

- Command: `node ./scripts/manager-stale-owner-inspection.mjs --summary-json`
- Sandbox result: blocked by assignment-report sandbox EPERM boundary.
- Outside-sandbox exact rerun: succeeded and classified stale records as cleanup
  candidates.
- Classification: `sandbox`
- Desired behavior: stale-owner inspection should advertise that local workspace
  metadata inspection may require outside-sandbox read approval.

### Cleanup Plan Sandbox Drift

- Command: `node ./scripts/manager-cleanup-plan.mjs --summary-json`
- Sandbox result: returned a conflicting zero-target cleanup summary.
- Outside-sandbox exact rerun: found the expected stale cleanup candidates.
- Classification: `sandbox` plus `stale-state visibility`
- Desired behavior: cleanup-plan should fail closed or mark evidence
  `sandbox_incomplete` when required local workspace state cannot be inspected,
  instead of returning a misleading empty result.

### Workspace Test Harness JSON Boundary

- Command: `node ./scripts/test-codex-workspace.mjs`
- Sandbox result: first child-process JSON parse failed with
  `SyntaxError: Unexpected end of JSON input`.
- Outside-sandbox exact rerun: full harness passed.
- Classification: `sandbox`
- Desired behavior: test harness should detect empty child stdout for commands
  expected to emit JSON and report a named sandbox/process boundary with command
  metadata, stderr, and next action.

## Root Cause Hypothesis

Several manager and workspace checks need local process or state visibility that
the managed sandbox cannot reliably provide. The failures are not product
failures, and repeated retries inside the sandbox waste time. The current
scripts sometimes report ambiguous or misleading states because they do not all
share one boundary classifier.

## Stop Lines

- Do not retry the same manager read-only command in the sandbox after the same
  EPERM or incomplete-child-output signature appears.
- Do not change test scope to hide a sandbox boundary.
- Do not treat known sandbox boundaries as manager self-repair work.
- Do not apply cleanup, takeover, worker launch, branch deletion, GitHub
  mutation, provider calls, or credential access as part of this remediation.
- Do not broaden standing authority. The durable fix should improve detection,
  evidence, and routing only.

## Proposed Fix Slices

### Slice 1: Shared Sandbox Boundary Classifier

Smallest useful outcome:
- Add a shared Node helper that classifies known sandbox boundary signatures
  from child-process results.

Candidate signatures:
- `spawnSync EPERM`
- `EACCES` or `EPERM` from Git, tmux, workspace metadata, or child process
  probes.
- empty stdout when a child command is required to emit JSON and exits or is
  interrupted before parseable output.
- read-only filesystem errors for `.git/worktrees`, `$HOME/.cache/uv`, managed
  worktree pnpm temp files, or local Codex workspace state.

Expected output contract:
- `boundary: true`
- `class: sandbox`
- `signature`
- `command`
- `safe_rerun: exact_command_outside_sandbox_when_read_only`
- `mutation: none`
- `next_action`

Verification:
- Unit tests for each signature.
- Existing workspace tests still pass.

### Slice 2: Manager Scripts Emit Boundary Packets

Smallest useful outcome:
- Update manager preflight, cycle packet, run loop, stale-owner inspection, and
  cleanup plan to use the shared classifier.
- When evidence is incomplete because of sandbox boundaries, return a named
  boundary packet instead of empty or misleading operational state.

Acceptance checks:
- `manager-cleanup-plan` must not report zero stale targets solely because the
  sandbox hid local workspace state.
- `manager-run-loop --once` must stop at `known_sandbox_boundary` and recommend
  exact outside-sandbox rerun, not self-repair.
- Summary JSON remains bounded and metadata-only.

Verification:
- Focused fixture tests for manager scripts.
- Existing manager/workspace harnesses pass outside sandbox when sandbox blocks.

### Slice 3: Workspace Test Harness JSON Guard

Smallest useful outcome:
- Harden `scripts/test-codex-workspace.mjs` helper parsing so empty stdout from
  a child JSON command fails with an explicit boundary-style diagnostic.

Acceptance checks:
- The harness reports the command, expected JSON, stdout length, stderr excerpt,
  exit code, and next action.
- The harness does not silently pass or skip tests.

Verification:
- Add a fixture child command that emits empty stdout where JSON is expected.
- Full workspace harness passes outside sandbox.

### Slice 4: Preflight Boundary Registry In AGENTS.md

Smallest useful outcome:
- Add a concise table or bullet list to `AGENTS.md` naming the Kendall_Nxt
  commands that are known to cross sandbox boundaries and their exact stop line.

Candidate entries:
- `node ./scripts/manager-preflight.mjs --summary-json`
- `node ./scripts/manager-cycle-packet.mjs --summary-json`
- `node ./scripts/manager-run-loop.mjs --summary-json --once`
- `node ./scripts/manager-stale-owner-inspection.mjs --summary-json`
- `node ./scripts/manager-cleanup-plan.mjs --summary-json`
- `node ./scripts/test-codex-workspace.mjs`

Verification:
- Review only; no behavior change unless paired with slices 1-3.

### Slice 5: Optional Manager UX Copy

Smallest useful outcome:
- Improve operator-facing wording so the manager says "known sandbox boundary"
  and "exact outside-sandbox read-only rerun needed" instead of generic failure
  text.

Acceptance checks:
- No visible suggestion to self-repair manager code for these boundaries.
- No automatic escalation or mutation.

## Recommended Implementation Order

1. Slice 1: shared classifier and tests.
2. Slice 3: workspace test harness JSON guard.
3. Slice 2: manager scripts use the classifier.
4. Slice 4: AGENTS.md registry.
5. Slice 5: wording polish only after behavior is stable.

## Evidence To Preserve

For every implementation slice, preserve:
- command run
- sandbox result
- outside-sandbox exact rerun result when applicable
- classification
- mutation scope
- verification command
- residual risk

Do not retain raw provider payloads, secrets, credentials, tmux scrollback, or
large copied source output.

## Done Criteria

- Known read-only sandbox boundaries are detected by name.
- Manager scripts stop recommending self-repair for those boundaries.
- Cleanup plans do not return misleading empty state when sandbox visibility is
  incomplete.
- Test harness failures for empty child JSON output are actionable.
- The next session can run one documented command path and know whether it is a
  product failure, sandbox boundary, or approval-gated outside-sandbox rerun.
