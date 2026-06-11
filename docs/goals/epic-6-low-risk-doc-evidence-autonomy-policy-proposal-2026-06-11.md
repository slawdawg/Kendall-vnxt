# Epic 6 Low-Risk Doc/Evidence Autonomy Policy Proposal

Date: 2026-06-11
Status: proposal only; not active policy

## Purpose

Reduce approval overhead for repeatable low-risk documentation and evidence updates while keeping high-blast-radius operations gated.

This proposal is based on the successful Epic 6 proof sequence through PR #91 and PR #92:

- bounded Codex implementation in an isolated worktree,
- local verification with `pnpm.cmd run check`,
- GitHub PR delivery,
- CI success,
- merge after explicit approval,
- cleanup after explicit approval.

## Proposed Autonomy Class

Policy id: `epic-6-low-risk-doc-evidence-pr-v1`

Eligible work:

- documentation-only changes under `docs/`,
- story evidence updates under `docs/stories/`,
- goal/progress/authority packet updates under `docs/goals/` and `docs/architecture/`,
- report shortcut or drift-check documentation alignment only when required by the selected doc/evidence story,
- no runtime behavior changes.

Required evidence before Codex may act without per-step approval:

- target story, goal, or doc path is explicit in the user request or current approved goal state,
- expected change is doc/evidence-only,
- allowed paths are within `docs/` unless a drift-check documentation alignment file is explicitly required,
- `git status --short --branch` is clean before starting,
- an isolated Codex worktree or dedicated branch is used,
- no secrets, credentials, raw prompts, provider payloads, or private session artifacts are read or retained.

## Allowed Without Per-Step Approval

For work matching this policy class, Codex may:

- create or use one isolated local worktree or dedicated branch from `main`,
- implement bounded documentation/evidence changes,
- run focused documentation/drift checks,
- run `pnpm.cmd run check`,
- stage and commit the bounded changes,
- push the branch,
- open one PR to `main`,
- run read-only PR and CI status checks,
- prepare merge and cleanup approval packets.

## Still Separately Gated

This policy does not allow:

- auto-merge,
- local or remote cleanup,
- branch or worktree deletion,
- issue/story sync,
- Claude launch,
- provider/model expansion,
- secrets or credential access,
- raw prompt/completion/provider-payload retention,
- source changes outside the eligible doc/evidence scope,
- destructive operations,
- autonomous retry loops after failed checks,
- bypassing failed checks.

## Stop Conditions

Codex must stop and ask for explicit approval if:

- the change requires source code, tests, scripts, dashboard behavior, supervisor behavior, provider calls, or workflow mutation outside doc/evidence alignment,
- `pnpm.cmd run check` fails,
- CI fails,
- merge state is dirty, blocked, behind, or conflicted,
- review comments request code changes,
- the branch contains unrelated diffs,
- the work would require cleanup, branch deletion, issue sync, Claude, provider expansion, or secrets access,
- the target doc/story is ambiguous.

## Promotion Criteria

This proposal should become active policy only after Bob explicitly approves it as policy.

Suggested activation approval phrase:

```text
Approve Epic 6 low-risk doc/evidence PR autonomy policy v1: for doc/evidence-only changes matching docs/goals/epic-6-low-risk-doc-evidence-autonomy-policy-proposal-2026-06-11.md, Codex may create an isolated branch or worktree from main, implement bounded documentation/evidence changes, run pnpm.cmd run check, commit, push, open one PR to main, and run read-only PR/CI checks without per-step approval. Auto-merge, cleanup, issue sync, Claude launch, provider expansion, secrets access, destructive operations, failed-check bypass, and unrelated source changes remain separately gated.
```

## Evidence To Retain Per Run

- target doc/story path,
- pre-run branch and clean status,
- worktree or branch name,
- diffstat,
- verification commands and results,
- PR URL,
- CI status,
- merge approval packet,
- cleanup approval packet.
