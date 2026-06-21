# Codex Workspace Cleanup Runbook

Date: 2026-06-10

Use the Codex workspace script for routine task cleanup:

```bash
node ./scripts/codex-workspace.mjs cleanup-merged --apply
```

The cleanup path removes generated Python artifacts before removing a disposable
worktree. This prevents stale cache and temporary-file residue from blocking
`git worktree remove`.

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
