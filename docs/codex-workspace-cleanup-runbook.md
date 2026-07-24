# Codex Workspace Cleanup Runbook

Date: 2026-06-10

Use the Codex workspace script for routine task cleanup:

```bash
node ./scripts/codex-workspace.mjs cleanup-merged --apply
```

The cleanup path removes generated Python artifacts before removing a disposable
worktree. This prevents stale cache and temporary-file residue from blocking
`git worktree remove`.

## Restricted exact-tree closeout

`cleanup-integrated --exact-tree-closeout` is a deliberately narrow recovery
path for only `20260723-tailnet-authenticated-dashboard-persistence-and`. It
does not accept a title, description, branch, fragment, or another task id in
place of that exact manifest `task_id`.

Before either preview or apply, the command requires all of the following:

- the named worktree is registered, clean, and on its manifest branch;
- the source tree exactly equals local `origin/dev`;
- a live read-only `git ls-remote` query shows `origin/dev` still equals the
  local tracking ref (the command never fetches, resets, or rewrites refs);
- the source remote branch is absent, and GitHub CLI reports no PR for the
  exact source branch;
- the linked assignment has an exact, preflighted identity and a visible
  dry-run closeout action.

The required preview is metadata-only:

```bash
node ./scripts/codex-workspace.mjs cleanup-integrated \
  20260723-tailnet-authenticated-dashboard-persistence-and \
  --exact-tree-closeout --base origin/dev --summary-json \
  --supersession-provenance "reviewed supersession provenance" \
  --closeout-reason "reviewed exact-tree closeout rationale"
```

Apply only after reviewing that packet and obtaining the required authority:

```bash
node ./scripts/codex-workspace.mjs cleanup-integrated \
  20260723-tailnet-authenticated-dashboard-persistence-and \
  --exact-tree-closeout --base origin/dev --apply \
  --supersession-provenance "reviewed supersession provenance" \
  --closeout-reason "reviewed exact-tree closeout rationale"
```

The command retains metadata-only evidence: exact tree IDs; the local and live
`origin/dev` IDs; source-remote absence; no-PR check status and count; the
preflighted assignment closeout and its closed timestamp; and final rechecks
of `origin/dev`, source-remote absence, and GitHub no-PR state. It retains no
GitHub payloads, credentials, tokens, or secrets. It never creates, deletes,
fetches, force-pushes, or otherwise mutates a remote ref; `--delete-remote` is
rejected.

Apply writes a locked `cleanup_partial` journal before local worktree or branch
deletion, then records the linked-assignment metadata closure before those
local deletions. If an interruption or final live check fails, the manifest
remains `cleanup_partial`; do not infer success or manually alter it. Inspect
the retained evidence, restore the required local state if necessary, fetch
`origin/dev` explicitly when the live/local IDs differ, and rerun the identical
restricted command. A resume preserves the prior assignment-closeout
`closed` status and timestamp rather than replacing that audit record.

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

### Restricted legacy first-use repair

`cleanup-superseded` normally requires a current source remote, matching
assignment, and manifest base. The `--first-use-repair` bridge exists only for
one audited historical shape: a clean no-PR source still exists locally, its
remote was successfully observed as absent, its manifest has no assignment and
names a deleted predecessor base, and a named commit was carried inside a named
merged PR before a bounded review-hardening sequence.

If an interrupted first-use cleanup has already removed its local worktree and
branch, resumption requires the journal's recorded normalized carry-forward PR
base OID and canonical base head to match the newly checked current evidence
exactly. A changed base proof leaves the partial journal and all remaining
targets untouched; inspect and restart from fresh evidence instead.

It is an explicit migration contract, not a fallback. All fields below are
required, including metadata-only provenance and hardening rationale:

```bash
node ./scripts/codex-workspace.mjs cleanup-superseded <source-task> \
  --source-head <exact-source-sha> \
  --carry-forward-pr <merged-pr-number> \
  --carry-forward-commit <commit-contained-by-that-pr> \
  --scope path/one,path/two,path/hardened \
  --first-use-repair \
  --canonical-base dev \
  --supersession-provenance "audited migration/supersession reference" \
  --source-remote absent \
  --legacy-unassigned \
  --successor-hardening-commits <sha1,sha2> \
  --successor-hardening-scope path/hardened \
  --successor-hardening-evidence "bounded review-hardening rationale" \
  --summary-json
```

The preview proves the carried commit is in the merged PR lineage and its head
is integrated into that merge, the complete post-carry PR lineage is declared,
and the declared hardening paths exactly equal every carried-to-merge path
difference. It also proves the recorded predecessor `origin/<branch>` ref is
absent both locally and at origin, and the current `origin/dev` scoped tree
still equals that merged PR. The named carry-forward PR base object ID must
also exactly equal the current canonical `origin/dev` head; a ready proof records
that normalized exact ID for audit. It separately queries the source remote: an empty
successful result proves `absent`; a lookup failure, a present branch, an
unknown or matching active unlinked assignment, a dangling assignment id, a
non-`dev` canonical base, or any unlisted path/commit blocks cleanup. The
source branch remote remains untouched whether it is present or absent.

Do not use this bridge on a real legacy workspace until a separate independent
audit has reviewed its exact JSON proof packet. `--apply` retains the standard
approval/reason requirement, manifest lock, source no-PR check, clean-worktree
check, journal, locked re-proof, and rollback record. For an absent source
remote it records absence and rechecks absence during apply and partial resume;
it never creates, deletes, or assumes a remote branch. A partial resume must
repeat the identical repair inputs and retain the same verified absence.

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
