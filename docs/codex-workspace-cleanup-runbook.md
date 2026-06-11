# Codex Workspace Cleanup Runbook

Date: 2026-06-10

Use the Codex workspace script for routine task cleanup:

```powershell
node .\scripts\codex-workspace.mjs cleanup-merged --apply
```

The cleanup path removes generated Python artifacts before removing a disposable worktree. This prevents Windows ACL and cache residue from blocking `git worktree remove`.

For orphan directories that are no longer registered as Git worktrees, dry-run first:

```powershell
node .\scripts\codex-workspace.mjs cleanup-orphans
node .\scripts\codex-workspace.mjs cleanup-orphans <name-fragment> --apply
```

Use `--all --apply` only after reviewing the dry-run output.

Supervisor tests should run through the hardened wrapper:

```powershell
pnpm.cmd run test:supervisor -- tests/integration/test_routing_preview.py -q
```

The wrapper and `services/supervisor/pyproject.toml` run pytest with cache creation disabled and default collection to `tests`. If a direct pytest command is unavoidable outside that project config, add:

```powershell
-p no:cacheprovider
```

If Windows still denies deletion after Git unregisters a worktree, treat it as filesystem residue. Confirm Git no longer tracks it:

```powershell
git worktree list --porcelain
git branch --list "codex/implement-story-6-*"
```

Then run the exact admin fallback printed by `codex-workspace.mjs`. Do not use broad recursive deletion outside the managed Codex worktree root.
