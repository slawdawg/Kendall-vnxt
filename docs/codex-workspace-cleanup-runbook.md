# Codex Workspace Cleanup Runbook

Date: 2026-06-10

Use the Codex workspace script for routine task cleanup:

```bash
node ./scripts/codex-workspace.mjs cleanup-merged --apply
```

The cleanup path removes generated Python artifacts before removing a disposable
worktree. This prevents stale cache and temporary-file residue from blocking
`git worktree remove`.

## No-PR supersession cleanup

Use `cleanup-superseded` only for one clean, no-PR source lane whose exact
scoped tree content was carried forward by a named merged PR. It is not a
replacement for `cleanup-integrated`: it does not infer equivalence from the
current base, ancestry, filename overlap, or patch IDs.

First create a metadata-only proof packet. Supply the original source branch
head, the merged carry-forward PR, its exact integrated commit, and a bounded
comma-separated repository-relative scope:

```bash
node ./scripts/codex-workspace.mjs cleanup-superseded <source-task> \
  --source-head <exact-source-sha> \
  --carry-forward-pr <merged-pr-number> \
  --carry-forward-commit <exact-integrated-sha> \
  --scope path/one,path/two \
  --summary-json
```

The preview proves all of the following without mutation: source manifest has
no PR evidence, GitHub reports no PR for the exact source branch, and the lane
is not held; the registered source worktree is clean; lane
owner and linked assignment have unambiguous matching identities (or an
explicit recorded takeover); local and remote source branch heads both equal
`--source-head`; the named PR is merged at the named commit; that commit and
the exact scoped content remain in the current canonical `origin/<base_branch>`
head; and every scoped tree entry matches exactly, including entry existence,
modes, object types, object IDs, additions, deletions, and renames.

Stop if any field is absent, changes, is ambiguous, or reports `blocked` or
`mismatch`. Do not broaden the scope or substitute a current-base comparison.
Do not use this command on a held workspace, a source lane with any PR record,
multiple source lanes, or a manifest that retains a previously required remote
cleanup target. Scope paths are exact identifiers: surrounding whitespace is
rejected rather than normalized.

The proof packet records whether the carry-forward PR base head came directly
from `gh pr view` or, only when that installed CLI explicitly rejects
`baseRefOid`, from a repository-scoped GitHub GraphQL lookup. Both paths require
one exact Git object ID for the requested PR; missing, malformed, conflicting,
or drifted fallback evidence remains blocked and never authorizes cleanup.

After reviewing the packet, apply only with explicit approval and a reason:

```bash
node ./scripts/codex-workspace.mjs cleanup-superseded <source-task> \
  --source-head <exact-source-sha> \
  --carry-forward-pr <merged-pr-number> \
  --carry-forward-commit <exact-integrated-sha> \
  --scope path/one,path/two \
  --apply \
  --approval "<operator approval evidence>" \
  --reason "<reviewed supersession rationale>"
```

Apply reacquires the source manifest and assignment locks and repeats the
complete proof before deleting anything. It persists a `cleanup_partial`
journal before each local deletion and after each completed target. It removes
only the named source worktree and local branch, then closes the matching
assignment and manifest with metadata-only proof and rollback records. The
source remote branch is deliberately retained; remote deletion, PR
comments/closure, and held-workspace deletion are outside this command. If
apply records `cleanup_partial`, inspect the recorded target and
supersession evidence. Resume only when the same proof shows the local source
worktree and branch are both absent while the retained remote branch is still
at the exact source SHA; otherwise repair the exact local target first, then
rerun the same proof with the same arguments. The rollback record names the
source SHA needed to recreate the local branch and worktree.

After merged workspace cleanup, local `codex/*` branches may remain. Run the
branch cleanup preview before deleting anything:

```bash
node ./scripts/codex-workspace.mjs cleanup-branches
```

Review the dry-run output. Preserve the selected base ref, skipped active
worktrees, and proposed branch deletion list as cleanup evidence. The command
only considers local `codex/*` branches, skips branches checked out in any
worktree, and treats a branch as eligible only when it is already included in
the base ref by ancestry or patch equivalence. It does not fetch; if the base
ref looks stale, fetch explicitly before re-running the dry-run.

Apply local branch deletion only when every listed branch is expected:

```bash
node ./scripts/codex-workspace.mjs cleanup-branches --apply
```

Stop if the dry-run lists an unexpected branch, reports a missing base ref, or
skips a branch you expected to be deleted. Do not use broad branch deletion as a
fallback.

For orphan directories that are no longer registered as Git worktrees, dry-run first:

```bash
node ./scripts/codex-workspace.mjs cleanup-orphans
node ./scripts/codex-workspace.mjs cleanup-orphans <name-fragment> --apply
```

Use `--all --apply` only after reviewing the dry-run output.

For assignment closeout, dry-run first and keep the closeout evidence bounded
to metadata:

```bash
node ./scripts/codex-workspace.mjs close-assignments --ids <assignment-id> --summary-json
```

When a manager-owned worker has a fresh runner owner id but the assignment is
owned by the manager's stable lane owner, do not use takeover or a broad
`--owner` impersonation for abandoned stale records. Use the manager owner
delegation file and explicit operator approval with the narrow stale-record
cleanup flags:

```bash
node ./scripts/codex-workspace.mjs close-assignments --ids <assignment-id> --summary-json --allow-stale-record-cleanup --approval "<operator approval evidence>" --delegated-cleanup-owner <stable-owner> --delegation-evidence "<manager delegation evidence>"
```

Apply only after the summary shows the expected assignment id, matching closed
manifest, missing worktree, absent local/remote branch, no PR evidence, and the
delegated cleanup owner matching the assignment owner.

Supervisor tests should run through the hardened wrapper:

```bash
pnpm run test:supervisor -- tests/integration/test_routing_preview.py -q
```

The wrapper and `services/supervisor/pyproject.toml` run pytest with cache creation disabled and default collection to `tests`. If a direct pytest command is unavoidable outside that project config, add:

```bash
-p no:cacheprovider
```

If the filesystem still denies deletion after Git unregisters a worktree, treat
it as local residue. Confirm Git no longer tracks it:

```bash
git worktree list --porcelain
git branch --list "codex/implement-story-6-*"
```

Then run only the exact fallback printed by `codex-workspace.mjs`. Do not use
broad recursive deletion outside the managed Codex worktree root.
