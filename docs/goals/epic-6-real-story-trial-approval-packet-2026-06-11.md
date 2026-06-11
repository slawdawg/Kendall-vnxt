# Epic 6 Real Story Trial Approval Packet

Date: 2026-06-11
Status: initial doc/evidence trial completed; broader MVP proof still incomplete

## Purpose

Define the next approval gate for the Epic 6 MVP proof run without granting authority by implication.

Epic 6 MVP still requires one real BMAD story to move through Dev Console evidence from Candidate Work to done state with approved bounded execution, verification, delivery, cleanup, and retained evidence.

Story 3.61 has now completed an initial doc/evidence-only proof lane through bounded Codex implementation, local verification, PR delivery, CI success, merge, and cleanup. That is useful initial evidence, but it does not prove the full Dev Console Candidate Work to done-state lifecycle and does not activate broader autonomy.

## Current Evidence

- Story 6.27 delivered the read-only MVP proof trial packet in PR #90.
- `GET /supervisor/epic-6-mvp-proof-trial-report` is available on the Controls page.
- `pnpm.cmd run check` passed on `main` after PR #90 with preflight, all drift checks, dashboard build, and 143 supervisor tests.
- Focused Controls e2e passed with the existing Playwright cache:
  `$env:PLAYWRIGHT_BROWSERS_PATH='C:\Users\slaw_dawg\Kendall_Nxt\.data\ms-playwright'; pnpm.cmd run test:e2e:dashboard:controls`
- PR #91 delivered Story 3.61 proof-trial evidence after bounded Codex implementation and local `pnpm.cmd run check`.
- PR #91 CI `check` passed, PR #91 was merged after explicit approval, and its branch/worktree cleanup was performed after explicit approval.
- PR #92 refreshed post-trial progress and authority docs after CI success, approved merge, and approved branch cleanup.
- PR #96 is an open draft doc/evidence PR for Story 3.66 proof-selection evidence: `https://github.com/slawdawg/Kendall-vnxt/pull/96`.
- PR #96 head `b8cabebbfbc1847c847576cbd6b7bf922c1343bc` has CI `check` success, clean merge state, and no source/runtime code changes.

## Selected Story

Completed initial doc/evidence trial story: `docs/stories/3-61-maintenance-action-evidence-links.md`.

Selected successor full-lifecycle MVP proof story: `docs/stories/3-66-epic-6-mvp-proof-done-evidence.md`.

Selection requirements:

- The story must already be represented as a local BMAD/story markdown artifact.
- The implementation scope must be narrow enough for one bounded Codex worker launch.
- The story must have an explicit expected outcome, allowed paths, blocked paths, verification command, rollback plan, and done-evidence requirement before launch.
- The story must not require provider/model expansion, raw prompt/completion retention, remote mutation, destructive cleanup, or autonomous follow-on actions as part of the initial implementation step.

## Proposed Bounded Codex Approval

Approval phrase:

```text
Approve one Epic 6 MVP proof trial for docs/stories/3-66-epic-6-mvp-proof-done-evidence.md: create/use one isolated local Codex worktree from main, launch one bounded Codex implementation for that selected story only, limit changes to the approved proof scope, run pnpm.cmd run check for verification, and do not launch Claude, push, open/update a PR, merge, delete branches/worktrees, sync issues, or perform cleanup without separate approval.
```

This approval would allow only:

- one selected story,
- one isolated local worktree,
- one bounded Codex implementation launch,
- local verification with `pnpm.cmd run check`,
- local Dev Console/runtime evidence updates required to show the attempted implementation state.

This approval would not allow:

- Claude launch,
- provider/model expansion,
- GitHub push, PR creation/update, CI waiting, review resolution, or merge,
- local or remote branch/worktree deletion,
- issue/story sync,
- automatic cleanup,
- trusted autonomy.

## Evidence To Retain

- selected story path and approved scope,
- worktree path and branch,
- Codex launch command shape or supervisor action metadata,
- pre-launch Git status,
- implementation diffstat,
- verification output,
- Dev Console Candidate Work, Active Work, routing preview, attempt, and done/evidence state,
- rollback and cleanup plan,
- explicit next approval request for delivery or cleanup.

## Stop Conditions

- selected story is ambiguous or not present as a local story artifact,
- implementation scope expands beyond the approved story,
- Codex command shape differs from the approved launch,
- verification fails or becomes flaky,
- implementation needs Claude, GitHub delivery, cleanup, provider expansion, or remote issue/story sync before the local proof evidence is retained,
- worktree or repo state is dirty in a way not created by the approved trial.

## Next Separate Gates

After any local implementation and verification evidence exists, these remain separate:

- Claude review approval, if adversarial review is justified.
- GitHub push/PR/check approval for the exact branch and target PR.
- Merge approval after CI/review evidence is visible.
- Cleanup approval for exact local and remote targets after merge evidence is retained.

## Current PR #96 Merge Gate

PR #96 is still a documentation/evidence-only proof-selection PR. It does not perform bounded Codex implementation or complete the Epic 6 MVP proof by itself.

Merge approval phrase:

```text
Approve merge of PR #96 only: merge https://github.com/slawdawg/Kendall-vnxt/pull/96 from codex/epic-6-proof-selection-evidence into main after confirming the latest head is b8cabebbfbc1847c847576cbd6b7bf922c1343bc, CI check is green, merge state is clean, and no source/runtime code is included. Do not perform local cleanup, remote branch deletion, issue/story sync, Claude launch, provider expansion, or bounded Codex implementation under this approval.
```

This approval would allow only:

- merge PR #96 into `main`,
- retain PR URL, head SHA, CI status, and merge commit evidence,
- refresh local `main` after merge if needed for verification.

This approval would not allow:

- local branch/worktree cleanup,
- remote branch deletion,
- issue/story sync,
- bounded Codex implementation,
- Claude review,
- provider/model expansion,
- failed-check bypass.

PR #96 cleanup approval phrase, to use only after merge evidence exists:

```text
Approve cleanup for merged PR #96 only: after retaining PR URL, merge commit, green CI evidence, and current git status, delete local branch codex/epic-6-proof-selection-evidence and remote branch origin/codex/epic-6-proof-selection-evidence if GitHub reports the PR merged. Do not delete unrelated branches, worktrees, artifacts, issue links, or evidence.
```
