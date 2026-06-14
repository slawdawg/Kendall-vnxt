# High-Risk Authority Lane Parallelization

Date: 2026-06-14
Project: Kendall_Nxt
Scope: Moderate workflow reorganization
Status: Approved direction, coordination artifact

## 1. Issue Summary

Bob wants the remaining high-risk authority work to move faster without losing the progressive-approval model that keeps real execution bounded.

The triggering concern is that a single long-running lane could tie up the session while other safe preparation work is available. The correction is to split the remaining high-risk work into isolated Codex worktrees by authority decision lane, then allow prep work to proceed independently while keeping real mutating or external execution serialized behind exact approval.

Evidence:

- `docs/stories/index.md` lists remaining blocked authority families and current non-executing authority packets.
- `docs/goals/gated-authority-backlog-completion-audit-2026-06-14.md` records that safe preparation exists, but real execution remains blocked until exact target-specific approval.
- The repo-owned workspace script has created separate active worktrees for coordination, local Ollama execution, premium execution, subscription-agent process launch, real CLI worker launch, and cleanup automation.
- Adaptive scoring remains a tracked high-risk authority lane, but it has no active worktree in this split because the current prep bundle is limited to the six lane PRs listed below.

## 2. Impact Analysis

### Epic Impact

Completed epics remain closed within their approved scope. This change does not reopen Epics 7 through 19.

The change affects how successor authority work is organized:

- Coordination work happens in a dedicated coordination branch.
- Each high-risk lane gets its own branch and worktree.
- Lane prep can run in parallel when it is non-executing.
- Real execution stays one-at-a-time and approval-bound.

### Story Impact

No completed story status changes.

Future story work should be created or resumed inside the matching lane worktree:

- Local Ollama/provider execution readiness.
- Adaptive scoring readiness.
- Premium provider execution readiness.
- Subscription-agent process launch readiness.
- Real CLI worker launch readiness.
- Cleanup automation readiness.

If a lane needs a new story, create it in that lane worktree and keep its acceptance criteria scoped to that lane's authority family.

### Artifact Conflicts

The main risk is fragmented authority state. Six active worktrees can drift if there is no shared map.

This coordination artifact is the shared map. It defines ownership, stop lines, and merge order so each lane can progress without silently changing another lane's assumptions.

### Technical Impact

This proposal introduces no runtime authority:

- No provider calls.
- No paid calls.
- No subscription-agent process launch.
- No Codex or Claude worker launch.
- No source mutation by autonomous workers.
- No issue sync.
- No PR delivery operation.
- No cleanup deletion, branch deletion, remote ref deletion, or worktree removal.
- No failed-check bypass.

## 3. Recommended Approach

Recommended path: Direct Adjustment with parallel lane worktrees.

Use this session as the coordination/control room. Work individual lanes in their own worktrees. Start background checks or servers only when they are non-executing and safe. Do not treat the existence of a lane worktree as approval to execute the high-risk action.

Current lane map:

| Lane | Branch | Worktree | Parallel prep allowed | Real execution status |
| --- | --- | --- | --- | --- |
| Coordination | `codex/authority-lane-coordination` | `C:\Users\slaw_dawg\.codex-workspaces\slawdawg-kendall-vnxt\worktrees\20260614-coordinate-high-risk-authority-lane-readiness` | Yes | Not an execution lane |
| Local Ollama/provider execution | `codex/local-ollama-provider-execution-lane` | `C:\Users\slaw_dawg\.codex-workspaces\slawdawg-kendall-vnxt\worktrees\20260614-prepare-local-ollama-provider-execution-authorit` | Yes, no-call readiness only | Blocked pending exact provider-call approval |
| Adaptive scoring | Not started in this split | Not started in this split | Yes, no-apply/no-compute readiness only after a lane is created | Blocked pending exact adaptive-score compute/apply approval |
| Premium provider execution | `codex/premium-provider-execution-lane` | `C:\Users\slaw_dawg\.codex-workspaces\slawdawg-kendall-vnxt\worktrees\20260614-prepare-premium-provider-execution-authority-lan` | Yes, no-cost readiness only | Blocked pending exact paid-call approval |
| Subscription-agent process launch | `codex/subscription-agent-process-launch-lane` | `C:\Users\slaw_dawg\.codex-workspaces\slawdawg-kendall-vnxt\worktrees\20260614-prepare-subscription-agent-process-launch-author` | Yes, no-launch readiness only | Blocked pending exact process-launch approval |
| Real CLI worker launch | `codex/real-cli-worker-launch-lane` | `C:\Users\slaw_dawg\.codex-workspaces\slawdawg-kendall-vnxt\worktrees\20260614-prepare-real-cli-worker-launch-authority-lane` | Yes, no-launch readiness only | Blocked pending exact worker-launch approval |
| Cleanup automation | `codex/cleanup-automation-authority-lane` | `C:\Users\slaw_dawg\.codex-workspaces\slawdawg-kendall-vnxt\worktrees\20260614-prepare-cleanup-automation-authority-lane` | Yes, dry-run/planning only | Blocked pending exact deletion/removal approval |

## 4. Detailed Change Proposals

### Coordination Branch

Use `codex/authority-lane-coordination` for:

- Lane status summaries.
- Shared stop lines.
- Merge-order notes.
- Evidence index links.
- Cross-lane conflicts or dependency decisions.

Do not use the coordination branch for lane-specific implementation unless the change truly applies to all lanes.

### Lane Branches

Each lane branch may prepare:

- Current-state evidence refresh.
- Dry-run or no-op checks.
- Approval packet refinements.
- Verification checklists.
- Rollback or recovery notes.
- Dashboard/report updates that display readiness without executing.

Each lane branch must stop before:

- External provider call.
- Adaptive-score compute or apply operation.
- Paid provider call.
- Process launch.
- Worker launch.
- GitHub remote mutation.
- Source mutation by worker.
- Cleanup deletion or branch/ref removal.
- Credential/session inheritance beyond the documented allowlist.

### Merge Order

Default merge order:

1. Coordination branch lands first if it only records lane organization.
2. Lane branches land as independent readiness PRs.
3. Execution PRs or execution evidence branches are created only after Bob accepts an exact approval packet for that lane.

If two lane branches touch the same index or shared docs, rebase the later lane on the merged earlier lane and preserve both evidence trails.

## 5. Implementation Handoff

Scope classification: Moderate.

Handoff:

- Developer: maintain this coordination artifact and work lanes from the matching worktree.
- Bob: approve exact real execution only when a lane packet names authority family, operation, target, scope, allowed commands, evidence, rollback, stop lines, and expiry.
- Developer: keep real execution serialized unless Bob explicitly approves a specific parallel execution plan.

Success criteria:

- All high-risk lanes have isolated worktrees and branches.
- Safe prep can proceed without blocking on another lane.
- No lane performs real high-risk execution from generic continuation language.
- The coordination branch remains the source of truth for lane status and conflicts.

## 6. Checklist Summary

- [x] Trigger identified: Bob wants lane work to proceed without waiting on one long-running task.
- [x] Existing authority packets identified as the source evidence for lane boundaries.
- [x] Worktree split created through the repo-owned workspace script.
- [x] Coordination branch designated as the shared map.
- [x] Lane branches designated for local Ollama, premium provider, subscription-agent launch, real CLI worker launch, and cleanup automation.
- [x] Adaptive scoring retained as a high-risk lane with no active worktree in this split.
- [x] Parallel safe-prep boundary defined.
- [x] Real execution stop lines preserved.
- [x] Merge-order guidance defined.
- [x] No runtime authority granted by this proposal.
