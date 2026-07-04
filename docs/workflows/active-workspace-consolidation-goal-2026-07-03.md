# Active Workspace Consolidation Goal

Date: 2026-07-03
Status: active cleanup/consolidation goal prompt

## Purpose

Use this artifact when Kendall needs to finish cleaning up the remaining active
managed workspaces after the July 2 PRD completion work.

This is not a new PRD execution goal. It is a consolidation and cleanup goal:
preserve valuable behavior from stale worktrees, bring that behavior into the
current source-owned checkout or explicitly retire it, verify the result, and
close the old managed workspaces.

This artifact supersedes
`docs/workflows/latest-prd-autonomous-bmad-loop-goal.md` for active workspace
cleanup. The July 2 PRD artifact remains a completed PRD execution record, not
the operating goal for this cleanup.

## Manager Invocation

Use this exact prompt when starting or resuming the manager:

```text
Use docs/workflows/active-workspace-consolidation-goal-2026-07-03.md as the active goal. Run the required preflight, update _bmad-output/active-workspace-consolidation-progress-2026-07-03.md, then consolidate the remaining active workspaces by group. Do not create new worktrees unless the no-orphan rule is satisfied. Continue until all active stale workspaces are closed or explicitly retained with evidence.
```

## Source Artifacts

Source-of-truth cleanup artifacts:

- `_bmad-output/active-workspace-cleanup-status-2026-07-03.md`
- `_bmad-output/active-workspace-development-decisions-2026-07-03.md`
- `_bmad-output/active-workspace-fold-forward-comparison-2026-07-03.json`
- `_bmad-output/active-worktree-preservation-2026-07-03/`

Live progress ledger:

- `_bmad-output/active-workspace-consolidation-progress-2026-07-03.md`

Do not rely on chat memory. After context reset, resume from the live progress
ledger plus the required preflight.

## Required Preflight

Run before assigning workers or editing source:

```bash
node ./scripts/codex-workspace.mjs list --active --summary-json
git branch --list 'codex/*'
git ls-remote --heads origin
git status -sb
```

Compare the active workspace list and local `codex/*` branches to this
artifact. If current state differs, update the cleanup status or goal artifact
before continuing. Do not start from stale workspace inventory.

At this artifact update, the active managed workspaces are:

1. `20260701-1-1-authoritative-workpacket-lifecycle`
2. `20260701-1-2-approved-source-intake`
3. `20260701-1-3-authoritative-planning-source-guardrails`
4. `20260701-2-1-shape-packets-into-executable-workitems`
5. `20260701-2-4-explain-dispatch-hold-and-backpressure-decisions`
6. `20260702-4-3-review-routing-and-human-attention-policy`
7. `20260702-4-4-promote-and-deliver-readiness`
8. `20260702-6-1-learn-follow-up-creation`
9. `20260702-6-2-operator-owned-rework-exit`

The manager/control-plane prototype and consolidation lanes were already
archived and closed. Do not recreate or re-dispatch them.

## Objective

Bring forward valuable behavior from the remaining active worktrees into the
current consolidation checkout, or explicitly reject the behavior with evidence.
Then verify retained behavior, close each old managed workspace, and remove its
local `codex/*` branch when safe.

End state:

- zero active stale workspaces, or
- only explicitly retained workspaces with a documented owner, reason, and next
  action.

## Work Groups

Consolidate by coherent source ownership, not by stale worktree age.

1. Source lifecycle:
   `20260701-1-1-authoritative-workpacket-lifecycle`,
   `20260701-1-2-approved-source-intake`,
   `20260701-1-3-authoritative-planning-source-guardrails`
2. Route, shape, and dispatch:
   `20260701-2-1-shape-packets-into-executable-workitems`,
   `20260701-2-4-explain-dispatch-hold-and-backpressure-decisions`
3. Review, promote, learn, and rework:
   `20260702-4-3-review-routing-and-human-attention-policy`,
   `20260702-4-4-promote-and-deliver-readiness`,
   `20260702-6-1-learn-follow-up-creation`,
   `20260702-6-2-operator-owned-rework-exit`

Recommended first pass: source lifecycle. Those worktrees define foundational
WorkPacket/source state and are likely to reduce ambiguity for later groups.

## Execution Model

Use up to 6 Codex workers only when work is genuinely parallel and file
ownership does not overlap. Default to 2-3 workers. Do not run all remaining
worktrees in parallel.

Workers should not blindly keep developing inside old worktrees. For each
assigned worktree, first produce a bounded patch review:

- changed files
- behavior added
- tests added
- whether the current checkout already has equivalent or better behavior
- recommendation: port, supersede, replace, or retain

The integrator ports selected behavior into the current consolidation checkout
or one dedicated consolidation branch. Prefer current codebase patterns over
copying stale code verbatim.

## Shared-File Rule

Exactly one integrator owns edits to shared files during a consolidation pass.
If two lanes touch the same shared file, serialize edits for that file.

Shared files include:

- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `packages/contracts/src/api.ts`
- `packages/contracts/src/work-packet.ts`
- `packages/contracts/src/workflow.ts`
- `packages/workflow-core/src/state-machine.ts`
- `packages/workflow-core/src/work-packet-stage-map.ts`
- `services/supervisor/tests/integration/test_routing_preview.py`
- `services/supervisor/tests/integration/test_work_packets.py`

## Evidence Template

Use this template for every active workspace:

```text
Workspace:
Decision: port | supersede | reject | retain
Files reviewed:
Behavior retained:
Behavior rejected or superseded:
Tests run:
Verification result:
Closure evidence:
Remaining risk or follow-up:
```

## Close Loop

A worktree is not done until all of these are true:

- its value is ported, replaced, or explicitly rejected with evidence
- focused verification has passed or residual risk is documented
- cleanup and decision artifacts are updated
- the managed workspace manifest is closed through
  `scripts/codex-workspace.mjs` or the approved cleanup helper
- the local `codex/*` branch and managed worktree are removed when safe

Supersession is valid. If current code already solves a worktree's behavior
better, close the stale worktree with exact evidence instead of porting stale
code.

## No-Orphan Rule

The manager may not create a new managed workspace unless it records:

- which old workspace it replaces,
- which file ownership conflict requires isolation, or
- why current-checkout consolidation is insufficient.

A new workspace created under this goal must have:

- a parent cleanup workspace id
- an owner
- a close condition
- a stop line preventing it from becoming another stale handoff-only lane

## Git, GitHub, Branch, And Worktree Management

Use `scripts/codex-workspace.mjs` as the managed workspace authority.

Rules:

- Do not manually remove managed worktrees or branches unless the managed
  cleanup path is unavailable and explicit evidence says manual cleanup is
  safe.
- Do not delete a local `codex/*` branch until its workspace is closed or exact
  supersession evidence exists.
- Do not delete remote branches unless they are merged PR branches or exact
  archived/superseded branches with no open PR.
- Prefer delivery by consolidation group, not one PR per stale worktree.
- Before PR creation or update, run focused tests, inspect `git diff --stat`,
  and update the progress/evidence ledger.
- Before merge, prove exact head SHA, expected base branch, non-draft state,
  green required/reported checks, no unresolved review threads, and no
  high-risk files without explicit approval.
- After merge, use managed cleanup for branch/worktree cleanup and delete
  remote branches only when exact-head cleanup is safe.
- If the current checkout is dirty, stage only intended files. Do not use
  `--stage-all` unless the full diff has been audited for the current delivery
  group.
- If branch cleanup is ambiguous, preserve the branch and record the reason.

## Delivery Strategy

Deliver by coherent consolidation group:

1. Source lifecycle
2. Route, shape, and dispatch
3. Review, promote, learn, and rework

A group can become a PR only after it is coherent, verified, reviewed, and every
old worktree in that group has an evidence decision. If a group is too large or
risky, split by source ownership and file ownership.

Delivery may be explicitly deferred, but the reason, current branch,
verification state, and next delivery action must be recorded in the live
progress ledger.

Do not open 9 PRs.

## BMAD Usage

Use BMAD where it adds quality:

- Use `$bmad-correct-course` if consolidation changes intended product
  behavior, acceptance criteria, authority model, or PRD/story direction.
- Use `$bmad-code-review` for implemented source changes before delivery.
- Use `$bmad-retrospective` after a major consolidation group closes if lessons
  should be preserved.

Do not create new BMAD stories merely to keep workers busy.

## Authority

Standing authority under this goal:

- inspect active workspace manifests, patches, worktrees, and archive artifacts
- create or update local cleanup and consolidation evidence artifacts
- create or update
  `_bmad-output/active-workspace-consolidation-progress-2026-07-03.md`
- edit source code, tests, docs, and repo policy required to consolidate
  retained behavior
- run focused local verification commands
- close managed workspaces and delete local `codex/*` branches after the
  per-worktree close loop is satisfied
- use manager-owned workers for bounded patch review and implementation when
  file ownership is non-overlapping
- create a new managed workspace only when the no-orphan rule is satisfied and
  recorded

Stop for explicit approval before:

- deleting or modifying work outside managed workspace cleanup scope
- force-push or destructive history rewrite
- secret, credential, provider account, payment, or production deployment
  changes
- killing unknown or non-manager-owned processes
- taking over unresolved dirty work without evidence
- merging a PR that does not satisfy the repo low-risk delivery criteria
- creating a new managed workspace without satisfying the no-orphan rule

## Progress Ledger

Maintain
`_bmad-output/active-workspace-consolidation-progress-2026-07-03.md`
throughout the run. Update it after each real state change:

- preflight result
- current active workspace count
- current local `codex/*` branch count
- workspace decision
- behavior ported, superseded, rejected, or retained
- tests run and result
- workspace closed
- branch/worktree removed
- remaining work
- blocker needing operator action

Progress reports should describe actual terminal progress:

- worktrees closed
- behaviors ported
- tests passed
- branches removed
- PRs opened or merged
- blockers needing operator action

## Failure Recovery

- If a worker dies, preserve its latest ledger entry and continue with another
  worker when safe.
- If a merge conflict appears, pause parallel edits to that file and assign one
  integrator.
- If tests fail twice for the same reason, stop blind retries and write an RCA
  entry before continuing.
- If GitHub is unavailable, keep local branch/worktree state intact and record
  delivery as blocked.
- If cleanup partially succeeds, rerun the managed cleanup command instead of
  manually deleting leftovers.
- If active workspace list and progress ledger disagree, trust
  `node ./scripts/codex-workspace.mjs list --active --summary-json`, then
  reconcile the ledger.
- If current checkout changes unexpectedly, run `git status -sb` and
  `git diff --stat`, preserve user changes, and continue only after the changed
  scope is understood.

## Acceptance Gates

Each consolidation group must pass these gates before it is called done:

- Behavior gate: retained behavior is named in plain language.
- Source gate: exact old worktree patch/file refs were reviewed.
- Implementation gate: current checkout has the retained behavior or a
  documented replacement.
- Verification gate: focused tests/checks were run and recorded.
- Review gate: `$bmad-code-review` or equivalent code review completed for
  source changes.
- Cleanup gate: old workspaces in the group are closed or explicitly retained
  with evidence.
- Delivery gate: PR opened/merged or delivery explicitly deferred with reason.
- Operator-test gate: user-facing or operator-testable behavior is listed.

## Definition Of Done

- `node ./scripts/codex-workspace.mjs list --active --summary-json` reports
  zero active stale workspaces, or every remaining active workspace has an
  explicit retained reason, owner, and next action.
- `git branch --list 'codex/*'` has no stale local branches outside retained
  active workspaces.
- `git ls-remote --heads origin` shows only expected protected/persistent
  branches unless a current PR branch is intentionally open.
- Retained behavior from all active worktrees is ported, superseded, or
  explicitly rejected with evidence.
- Focused tests/checks for changed surfaces pass or residual risks are
  documented.
- Cleanup status and development decision artifacts are updated.
- Final report lists what came forward, what was retired, remaining risks, and
  what the operator can test.

## Do Not Do

- Do not use the completed July 2 PRD goal as the active goal for this cleanup.
- Do not create fresh story work just to keep workers busy.
- Do not treat "handoff ready" as completion.
- Do not keep old worktrees alive after their value is ported or rejected.
- Do not run all remaining worktrees in parallel through shared files.
- Do not create replacement worktrees without satisfying and recording the
  no-orphan rule.
