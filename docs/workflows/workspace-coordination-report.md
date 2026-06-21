# Workspace Coordination Report

Date: 2026-06-14
Status: active guidance

## Purpose

Give Codex sessions a small, repeatable way to coordinate active managed
worktrees without mixing branches, overwriting another lane, or silently
deleting local work. Use this report shape when several feature, refactor,
review, or authority lanes are active at once.

## When To Use

Use this workflow before starting or resuming work when:

- More than one managed Codex workspace is active.
- A PR is waiting at a merge gate.
- A worktree is clean but has local commits not yet merged.
- A session needs to choose the next safe PR-sized slice.
- Cleanup is requested, but local branches or unmerged commits may still exist.

## First Reads

Start with these small sources:

```text
AGENTS.md#codex-workspace-protocol
docs/ai-context/index.md
node ./scripts/codex-workspace.mjs list
git status --short --branch
```

Expand only when a lane's purpose or safety boundary is unclear.

## Report Packet

```text
Workspace Coordination Report
- Current checkout:
- Root status:
- Active managed worktrees:
- PRs waiting at merge gate:
- Clean active lanes:
- Dirty active lanes:
- Local-only commits:
- Closed but retained lanes:
- Cleanup candidates:
- Blocked approval packets:
- Next safe slice:
- Stop lines:
```

## Classification Rules

- `clean active lane`: no uncommitted files, still useful or awaiting PR work.
- `dirty active lane`: uncommitted files exist; do not start overlapping work.
- `merge-gated lane`: PR is open, CI is green, conversations are resolved, but
  explicit merge approval is missing.
- `local-only commit`: branch is ahead of its upstream or base and must be
  preserved until pushed, merged, or explicitly discarded.
- `cleanup candidate`: PR is merged, worktree is clean, and cleanup dry-run
  names only the expected worktree and local branch.
- `policy-approved low-risk delivery`: the active goal explicitly names merge
  and cleanup, the PR belongs to the current lane, the exact reviewed head SHA
  is still current, the PR targets the expected base branch, the PR is not a
  draft, the PR is mergeable, required and reported checks for that head SHA are
  passing, review threads are resolved, local verification passed, and the diff
  avoids high-blast-radius surfaces such as secrets, credentials, provider
  calls, deploy/release automation, migrations, destructive cleanup, broad
  policy expansion, or evidence-retention changes. If GitHub reports no checks
  for the head SHA, record that absence as evidence and treat it as low risk
  only when repository rules do not require status checks and local verification
  covers the changed surface.

## Merge Risk Controls

GitHub branch protection and rulesets can lower merge risk by requiring pull
request reviews, status checks, conversation resolution, signed commits, linear
history, merge queue, or successful deployments before changes land on a
protected branch. A PR that does not meet the repository's visible merge
requirements remains merge-gated.

Proof for low-risk delivery must come from current GitHub PR metadata, review
threads, review requests, status/check results for the exact head SHA, local
verification output, and the reviewed changed-file list. If any evidence source
is unavailable or ambiguous, the PR is not low risk.

Use these controls to reduce a higher-risk candidate before classifying it as
low risk:

- Split broad changes into smaller PRs.
- Keep the PR as draft until review evidence is complete.
- Require or preserve status checks, reviewer approval, and conversation
  resolution when available.
- Merge only the exact reviewed head SHA; do not bypass branch protection.
- Prefer auto-merge or merge queue when repository rules require them.
- Add feature flags, staged rollout, or manual validation for behavior changes.
- Record a revert path before merge.
- Rerun verification after base updates or material review changes.

## Stop Lines

Do not perform these actions from a generic continuation:

- Merge a PR.
- Delete a worktree.
- Delete a local or remote branch.
- Discard local commits.
- Rewrite a shared branch.
- Resolve a review thread that has not been addressed.
- Start work in a lane whose scope overlaps an active dirty lane.

Generic continuation is not standing approval. Use a narrow approval packet for
merge, cleanup, branch deletion, or discarding local commits unless the active
goal explicitly grants the named GitHub delivery operation and the action meets
the policy-approved low-risk delivery checklist above. If any checklist item is
missing, ambiguous, stale, failing, or high risk, stop for explicit operator
approval.

## Next Safe Slice Rules

Prefer a new managed worktree when continuing development:

```text
node ./scripts/codex-workspace.mjs start "<task description>"
```

Choose slices that avoid files touched by:

- Open PRs waiting at a merge gate.
- Dirty active lanes.
- Authority lanes owned by other sessions.
- Runtime/provider/dashboard work unless the current session owns that lane.

## Non-Goals

This workflow does not merge PRs, clean worktrees, delete branches, discard
commits, launch workers, call providers, spend money, access credentials, or
approve execution authority.
