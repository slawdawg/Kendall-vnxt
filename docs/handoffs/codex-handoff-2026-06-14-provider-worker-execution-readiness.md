# Codex Handoff: Provider and Worker Execution Readiness

Date: 2026-06-14
Repo: Kendall_Nxt / Kendall-vnxt
Status: merged baseline, ready for next execution-readiness story

## Current Baseline

`main` was clean and fast-forwarded after the high-risk authority lane run.

Merged PRs:

- PR #117: coordination lane map for high-risk authority work.
- PR #118: local Ollama/provider execution approval packet drift checks.
- PR #119: premium execution approval packet drift checks.
- PR #121: subscription-agent process launch approval packet drift checks.
- PR #122: real CLI worker launch approval packet drift checks.
- PR #124: cleanup automation approval packet drift checks.

The merge sequence required conflict resolution in `package.json` for PRs #121, #122, and #124 because each lane added verification scripts. The final merged `check` chain preserves all lane checks.

## What Was Gained

The repo now has durable guardrails for these authority families:

- Local provider execution.
- Premium provider execution.
- Subscription-agent process launch.
- Real CLI worker launch.
- Cleanup automation.
- Cross-lane coordination.

These are not runtime enablements. They are approval packets and drift checks that prevent required fields, stop lines, rollback rules, expiry/review points, retained-evidence policy, and disabled-by-default expectations from silently drifting.

## Important Distinction

The merged work does not approve or perform:

- Provider/model calls.
- Paid provider calls.
- Subscription-agent process launch.
- Real Codex or Claude CLI worker launch.
- Worker source mutation.
- Cleanup deletion, worktree removal, branch deletion, remote ref deletion, or retained evidence deletion.
- Failed-check bypass.

Generic continuation language still does not approve execution authority.

## Current Gated Cleanup

The repo-owned cleanup dry-run was run after the six PRs merged:

```text
node ./scripts/codex-workspace.mjs cleanup-merged
```

The dry-run correctly identified the six merged lane worktrees for cleanup:

- `20260614-coordinate-high-risk-authority-lane-readiness`
- `20260614-prepare-local-ollama-provider-execution-authorit`
- `20260614-prepare-premium-provider-execution-authority-lan`
- `20260614-prepare-subscription-agent-process-launch-author`
- `20260614-prepare-real-cli-worker-launch-authority-lane`
- `20260614-prepare-cleanup-automation-authority-lane`

It would remove those local worktree directories and local branches if run with:

```text
node ./scripts/codex-workspace.mjs cleanup-merged --apply
```

Do not apply cleanup without Bob explicitly approving that local deletion/removal action.

## Recommended Next Work

Start actual runtime enablement with the local Ollama provider lane first.

Reason:

- It is the lowest-risk runtime step.
- It already has the clearest prior boundary.
- Story 4.4 previously approved only the VM-to-host Ollama endpoint/model boundary:
  - VM: `192.168.1.118`
  - endpoint: `http://192.168.1.128:11434/v1/chat/completions`
  - model: `qwen3:14b`
  - connect timeout: 2 seconds
  - total timeout: 120 seconds
  - retention: metadata-only
  - rollback: disable local-provider or Ollama-specific gates

Recommended sequence:

1. Optionally clean the merged lane worktrees with exact approval.
2. Create a new story for one bounded local Ollama provider execution path.
3. Implement the runtime path behind existing disabled-by-default gates.
4. Require an exact approval instance before any real provider call.
5. Capture metadata-only execution evidence.
6. Run focused provider checks, then full verification if shared runtime code changes.

After local Ollama, proceed in this order:

1. Subscription-agent supervised process launch.
2. Real CLI worker launch.
3. Cleanup automation.
4. Premium provider execution.
5. Adaptive scoring as its own separate lane, because it remains tracked but did not get an active worktree in the six-lane split.

## Key Files To Read On Resume

Read these first:

```text
docs/handoffs/current.md
docs/goals/high-risk-authority-lane-parallelization-2026-06-14.md
docs/goals/local-provider-execution-approval-packet-2026-06-13.md
docs/goals/subscription-agent-process-launch-approval-packet-2026-06-13.md
docs/goals/real-cli-worker-launch-approval-packet-2026-06-14.md
docs/goals/cleanup-automation-approval-packet-2026-06-14.md
docs/goals/premium-execution-approval-packet-2026-06-13.md
docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md
docs/stories/index.md
```

Useful checks:

```text
pnpm.cmd run check:provider-fixtures
pnpm.cmd run check:process-lifecycle
pnpm.cmd run check:worker-launch
pnpm.cmd run check:cleanup-automation
pnpm.cmd run check:premium-execution
pnpm.cmd run check
```

## Resume Prompt

Use this prompt after reboot:

```text
Read docs/handoffs/current.md and docs/handoffs/codex-handoff-2026-06-14-provider-worker-execution-readiness.md. Resume from the merged provider/worker execution-readiness baseline. Start by confirming clean repo status, then recommend whether to apply merged-worktree cleanup or create the local Ollama runtime execution story.
```

