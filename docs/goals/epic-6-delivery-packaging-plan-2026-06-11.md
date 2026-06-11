# Epic 6 Delivery Packaging Plan

Date: 2026-06-11
Status: local delivery plan, no remote action taken

## Purpose

Define how the local Epic 6 branch stack should be packaged for review once Bob approves GitHub remote actions.

This plan is evidence only. It does not approve push, PR creation/update, PR closure, merge, branch deletion, cleanup, or GitHub issue/story sync.

## Current State

- Local stack branch: `codex/implement-story-6-23-trusted-autonomy-readiness`
- Pre-delivery audit commit before this plan was added: `85a0461`
- Verify the latest local head with `git rev-parse --short HEAD` immediately before any push.
- Base observed from the current stack: `a460271`
- Open GitHub PR observed by `gh pr list --state open --limit 20`: PR #85, `Implement Story 6.3 Candidate Work model API`
- PR #85 state at snapshot: branch `codex/implement-story-6-3-candidate-work-model-api`, merge state `CLEAN`, CI `check` success
- Verify the latest local diff from `a460271..HEAD` immediately before any push.

## Local Stack Contents

The current stack contains:

- Stories 6.3-6.11: Candidate Work, BMAD import, Proposed Work, priority/promotion, task packet preview, execution-attempt evidence, realtime Dev Console, synthetic and real BMAD proof.
- Stories 6.12-6.15: startup availability, safe local evidence checks, Git hygiene, and local worktree planning.
- Stories 6.16-6.24: Codex/Claude readiness and approval packets, GitHub delivery authority ladder, local cleanup readiness, remote cleanup/sync readiness, trusted autonomy readiness, and Epic 6 completion audit visibility.
- Progress and authority audit update: `docs/goals/epic-6-progress-and-kickoff-2026-06-10.md` and `docs/architecture/kendall-vnxt-epic-6-authority-ledger-2026-06-10.md`.
- Integrated PR body draft: `docs/goals/epic-6-integrated-pr-body-draft-2026-06-11.md`.

## Recommended Packaging

Recommended path: create one integrated Epic 6 milestone PR from `codex/implement-story-6-23-trusted-autonomy-readiness` to `main`, then close PR #85 as superseded after the integrated PR is open.

Why this is the recommended path:

- The work is one coherent delivery theme: Epic 6 pipeline, Dev Console, evidence reports, authority gates, and proof flow.
- Later stories depend on earlier contracts, tests, dashboard panels, and runtime evidence references.
- A single PR avoids reviewing a long chain of stacked PRs that each depend on unmerged prior branches.
- Bob has stated a preference for fewer, larger coherent PRs when related code, tests, docs, and architecture belong together.

Review risk:

- The PR is large. The reviewer should use the story sequence and report catalog to review by slice.
- The PR should not be merged until full CI is green and Bob has confirmed whether PR #85 should be closed or merged first.

## Alternative Packaging

Alternative path: split into three PRs after pushing stack branches.

1. Foundation PR: Stories 6.3-6.11.
2. Local/runtime readiness PR: Stories 6.12-6.15.
3. Authority/readiness PR: Stories 6.16-6.24 plus progress, ledger audit, delivery plan, and completion audit visibility.

Tradeoff:

- Smaller reviews, but more branch/PR coordination and more chances for stacked-branch drift.
- The current local work already forms one linear stack, so splitting requires more remote choreography.

## Approval Request: Integrated PR

Exact approval text Bob can use:

```text
Approve GitHub remote delivery for one integrated Epic 6 milestone PR only.
Allowed operations:
- push local branch codex/implement-story-6-23-trusted-autonomy-readiness to origin,
- create or update one PR from that branch to main,
- include a PR body summarizing Stories 6.3-6.24, verification, authority boundaries, and remaining blocked operations.
Do not merge.
Do not close PR #85 unless I explicitly approve closing it after the new PR exists.
Do not delete local or remote branches.
Do not run Codex or Claude.
Do not perform GitHub issue/story sync.
Retain evidence: branch name, PR URL, pushed commit, CI state if checked, and this packaging plan.
Stop if push is rejected, the remote target is ambiguous, auth changes are requested, or CI fails.
```

## Approval Request: Stacked PR Split

Exact approval text Bob can use:

```text
Approve GitHub remote delivery planning for stacked Epic 6 PRs only.
Allowed operations:
- push the named local Epic 6 stack branches needed for Stories 6.3-6.24,
- create PRs in a chain or against main as appropriate after inspecting branch ancestry,
- record PR URLs and dependencies.
Do not merge.
Do not close PR #85 unless I explicitly approve closing it after replacements exist.
Do not delete local or remote branches.
Do not run Codex or Claude.
Do not perform GitHub issue/story sync.
Stop if branch ancestry is ambiguous, push is rejected, auth changes are requested, or CI fails.
```

## Verification Before Push

Already passed on the latest local stack head:

- focused supervisor tests for Story 6.24 completion audit
- dashboard build
- focused Controls Playwright test
- `pnpm.cmd run check:reports`
- `pnpm.cmd run check:runtime-export`
- `pnpm.cmd run check`
- `pnpm.cmd run check:docs`

Recommended just before remote delivery:

- `git status --short --branch`
- `git log --oneline a460271..HEAD`
- `pnpm.cmd run check`
- Review `docs/goals/epic-6-integrated-pr-body-draft-2026-06-11.md` against the current head before using it.
- optional `gh pr list --state open --limit 20 --json number,title,headRefName,mergeStateStatus,statusCheckRollup,url`

## Non-Approvals

This plan does not approve:

- merge,
- push outside the named branch,
- PR closure,
- remote branch deletion,
- local worktree cleanup,
- GitHub issue/story sync,
- Codex or Claude process launch,
- provider/model expansion,
- credential/session access,
- plaintext token storage,
- source mutation beyond the already committed local stack.
