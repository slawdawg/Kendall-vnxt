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
node ./scripts/codex-workspace.mjs list --active --json
node ./scripts/codex-workspace.mjs coordination-report
git status --short --branch
```

Expand only when a lane's purpose or safety boundary is unclear.

`node ./scripts/codex-workspace.mjs coordination-report --json` is the
read-only automation form of the packet below. It may read workspace manifests,
assignment metadata, local git status, and source-owned safe backlog evidence.
It must not create branches, worktrees, commits, PRs, merges, cleanup actions,
remote mutations, or manifest writes.

`node ./scripts/codex-workspace.mjs coordination-report --summary-json` is the
bounded automation form for quick runner scans. It preserves counts for retained
closed lanes and backlog classifications without dumping the full retained lane payload,
groups blocked packet and backlog statuses by count, and it follows the same
read-only boundary as `--json`.

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
- `no-source refresh lane`: branch has been refreshed to the current base, the
  worktree is clean, scoped verification passed, and there is no source diff to
  commit. Preserve the evidence packet and do not create an empty PR.
- `cleanup candidate`: PR is merged, worktree is clean, and cleanup dry-run
  names only the expected worktree and local branch.
- `manifest repair candidate`: a closed retained manifest fails validation only
  because inert lifecycle fields are missing, and
  `node ./scripts/codex-workspace.mjs repair-manifests --dry-run` names that
  manifest as repairable.
- `remote branch cleanup candidate`: the remote branch is not owned by an
  active workspace, no open or closed-unmerged PR uses the branch head, and the
  current remote SHA exactly matches a merged PR `headRefOid`.
- `superseded PR`: a PR whose intended change has been delivered by later
  merged work or is no longer wanted. Comment with the superseding evidence,
  close the PR, and delete its remote head only when the branch is not active
  and the remote SHA still matches the closed PR head.
- `dependency security bump`: a bot PR that updates a dependency for a security
  or patch release. Treat urgency as reason to prioritize, not as automatic
  merge authority; it still needs current PR metadata, exact-head checks,
  thread-aware review state, changed-file review, CI, and focused local
  verification.
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

Use `docs/workflows/branch-protection-readiness-packet.md` as the source-owned
branch protection readiness packet before proposing branch or ruleset changes.
That packet is no GitHub mutation authority; it only records current evidence,
candidate posture, future approval fields, rollback, and stop lines.

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
- For dependency or bot PRs, verify in a temporary detached worktree from the
  PR head so dirty local work does not contaminate the evidence.
- Use supported `gh` commands for the installed CLI. Prefer
  `gh pr diff <number> --name-only` for changed-file discovery; do not assume
  `gh pr diff --stat` is available.
- Use exact-head merge commands such as
  `gh pr merge <number> --merge --delete-branch --match-head-commit <headRefOid>`.
- If direct `uv run --directory services/supervisor ...` fails in the sandbox
  with a read-only `$HOME/.cache/uv` error, rerun the exact same read-only
  verification command outside the sandbox rather than changing verification
  scope.
- If a broad verification suite hangs or becomes inconclusive, stop it cleanly,
  record the inconclusive result, and run focused verification that covers the
  changed surface.

## Remote Branch Cleanup Rules

Remote branch deletion is a separate GitHub mutation. Use it only when the
evidence proves the branch is stale and not owned by an active lane.

For managed workspaces, prefer the workspace lifecycle cleanup commands. When a
branch exists outside an applicable workspace cleanup path, use this exact
evidence gate before `git push origin --delete <branch>`:

- Fetch and prune `origin` immediately before classification.
- Gather all PRs for the head branch, including open, merged, and closed PRs.
- Exclude any branch with an active workspace manifest from
  `node ./scripts/codex-workspace.mjs list --active --json`.
- Exclude any branch with an open PR.
- Exclude any branch with a closed-unmerged PR unless the operator explicitly
  approves deleting that abandoned head.
- Delete only when the current `origin/<branch>` SHA exactly equals the merged
  PR `headRefOid`.
- Exclude no-PR-record branches and SHA-mismatch branches until separately
  inspected.

Preserve the exact deleted branch list and the excluded branch reasons as
cleanup evidence.

## Manifest Repair Rules

Use manifest repair only for retained closed workspace evidence that the
workspace lifecycle tool can classify without changing source branches,
worktrees, PRs, ownership, or active lane state.

```text
node ./scripts/codex-workspace.mjs repair-manifests --dry-run
node ./scripts/codex-workspace.mjs repair-manifests --apply
```

The dry-run must name the exact manifest, fields, and reason before apply. Apply
is acceptable only when the plan is limited to closed legacy manifests and fills
validation fields such as `worktree_path` or `base_branch`. Active malformed
manifests, unreadable JSON, missing identity fields, and healthy manifests are
not repair targets; stop and inspect them separately.

## Stop Lines

Do not perform these actions from a generic continuation:

- Merge a PR.
- Delete a worktree.
- Delete a local or remote branch.
- Discard local commits.
- Rewrite a shared branch.
- Resolve a review thread that has not been addressed.
- Start work in a lane whose scope overlaps an active dirty lane.
- Create an empty PR for a verified no-source refresh lane.
- Mutate an active workspace branch owned by another runner.
- Repair an active or unreadable workspace manifest without explicit inspection.
- Delete a remote branch with no PR record, a SHA mismatch, an open PR, or an
  active workspace owner.

Generic continuation is not standing approval. Use a narrow approval packet for
merge, cleanup, branch deletion, or discarding local commits unless the active
goal explicitly grants the named GitHub delivery operation and the action meets
the policy-approved low-risk delivery checklist above. If any checklist item is
missing, ambiguous, stale, failing, or high risk, stop for explicit operator
approval.

If a lane classifies as `no-source refresh lane`, record the base SHA, takeover
or ownership evidence, clean worktree status, scoped verification command and
result, and the `finish-pr` dry-run refusal if checked. Close or delete the
workspace only through a supported lifecycle command or an explicit cleanup
approval packet; do not invent a source diff solely to make PR delivery
possible.

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
