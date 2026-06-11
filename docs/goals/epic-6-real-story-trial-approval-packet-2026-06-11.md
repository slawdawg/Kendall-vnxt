# Epic 6 Real Story Trial Approval Packet

Date: 2026-06-11
Status: pending Bob story selection and explicit approval

## Purpose

Define the next approval gate for the Epic 6 MVP proof run without granting authority by implication.

Epic 6 MVP still requires one real BMAD story to move through Dev Console evidence from Candidate Work to done state with approved bounded execution, verification, delivery, cleanup, and retained evidence.

## Current Evidence

- Story 6.27 delivered the read-only MVP proof trial packet in PR #90.
- `GET /supervisor/epic-6-mvp-proof-trial-report` is available on the Controls page.
- `pnpm.cmd run check` passed on `main` after PR #90 with preflight, all drift checks, dashboard build, and 143 supervisor tests.
- Focused Controls e2e passed with the existing Playwright cache:
  `$env:PLAYWRIGHT_BROWSERS_PATH='C:\Users\slaw_dawg\Kendall_Nxt\.data\ms-playwright'; pnpm.cmd run test:e2e:dashboard:controls`

## Selected Story

No story is selected yet.

Selection requirements:

- The story must already be represented as a local BMAD/story markdown artifact.
- The implementation scope must be narrow enough for one bounded Codex worker launch.
- The story must have an explicit expected outcome, allowed paths, blocked paths, verification command, rollback plan, and done-evidence requirement before launch.
- The story must not require provider/model expansion, raw prompt/completion retention, remote mutation, destructive cleanup, or autonomous follow-on actions as part of the initial implementation step.

## Proposed Bounded Codex Approval

Approval phrase:

```text
Approve one Epic 6 MVP proof trial for docs/stories/<story-id>.md: create/use one isolated local Codex worktree from main, launch one bounded Codex implementation for that selected story only, limit changes to the approved story scope, run pnpm.cmd run check for verification, and do not launch Claude, push, open/update a PR, merge, delete branches/worktrees, sync issues, or perform cleanup without separate approval.
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

After the local implementation and verification evidence exists, these remain separate:

- Claude review approval, if adversarial review is justified.
- GitHub push/PR/check approval for the exact branch and target PR.
- Merge approval after CI/review evidence is visible.
- Cleanup approval for exact local and remote targets after merge evidence is retained.
