# Mise Normal Workflow Implementation Evidence

Date: 2026-06-18
Status: tracked mise workflow implemented
Story: `docs/stories/22-3-implement-mise-normal-workflow.md`
Predecessor: `docs/stories/22-2-evaluate-mise-managed-worktree-readiness.md`

## Decision

Adopt a minimal tracked `mise.toml` as Kendall_Nxt's normal supported local
readiness workflow.

`mise` is responsible only for non-secret tool activation and task aliases.
Git worktrees, `scripts/codex-workspace.mjs`, pnpm package scripts, and uv
remain the workflow authorities.

## Tracked Config

`mise.toml` pins:

- Node `22.13.0`, matching `.node-version`.
- pnpm `11.5.2`, matching `package.json`.
- Python `3.12`, satisfying `services/supervisor/pyproject.toml` and
  `runtime/pyproject.toml`.

Tracked tasks delegate to existing package scripts:

- `mise run setup` -> `pnpm run setup`
- `mise run preflight` -> `pnpm run preflight`
- `mise run workspace-doctor` -> `pnpm run codex:workspace:doctor`
- `mise run check` -> `pnpm run check`

No `[env]`, hooks, plugins, dotenv loading, provider/API secrets, worker launch,
process launch, GitHub mutation, PR/merge automation, cleanup, branch deletion,
worktree removal, local commit discard, shell profile edits, Graphify commands,
Linux install lane work, or custom lifecycle automation is defined in
`mise.toml`.

## Post-Merge Validation

The post-merge validation ran from the repaired `research-brainstorming`
worktree at `c08e563 Harden research workflow readiness`, which matched
`origin/main`.

Scoped environment:

```text
MISE_OFFLINE=1
MISE_NO_UPDATE_NOTIFIER=1
MISE_INSTALL_PATH=/tmp/kendall-mise-trial/bin/mise
MISE_DATA_DIR=/tmp/kendall-mise-trial/data
MISE_CACHE_DIR=/tmp/kendall-mise-trial/cache
MISE_STATE_DIR=/tmp/kendall-mise-trial/state
HOME=/tmp/kendall-mise-trial/home
```

Version checks:

```text
mise --version: 2026.6.11 linux-x64 (2026-06-16)
mise exec -- node --version: v22.13.0
mise exec -- pnpm --version: 11.5.2
mise exec -- python --version: Python 3.12.13
```

Task results:

```text
mise run setup: pass
mise run preflight: pass
mise run workspace-doctor: pass with expected scoped-HOME state-root warning
mise run check: pass outside the sandbox; dashboard build passed; supervisor suite reported 205 passed, 1 known aiosqlite deprecation warning
```

`mise run setup` delegated to `pnpm run setup`, confirmed pnpm dependencies were
already up to date, synced the supervisor virtualenv through uv, and completed
preflight successfully.

## Drift Check

`scripts/check-mise-workflow.mjs` verifies:

- `mise.toml` pins the expected tool versions.
- tracked tasks delegate to the expected package scripts.
- `mise.toml` does not define `[env]`, `[hooks]`, or `[plugins]`.
- this evidence, Story 22.3, and the story index stay linked.

The check is wired into `pnpm run check:static`.

## Risk And Stop Lines

- `mise` remains a developer prerequisite only for the `mise` workflow; package
  scripts still work directly.
- `mise` does not replace pnpm, uv, Git worktrees, or
  `scripts/codex-workspace.mjs`.
- No `[env]`, hooks, plugins, dotenv loading, provider/API secrets, worker
  launch, process launch, GitHub mutation, PR/merge automation, custom lifecycle
  automation, shell profile edits, provider calls, paid calls, Graphify
  commands, cleanup, branch deletion, worktree removal, local commit discard,
  credential/session access, or Linux install lane work occurred.
- Future expansion to env loading, secrets, hooks, plugins, Devbox, Nix, Dev
  Containers, or provider-backed behavior needs separate approval and evidence.

## Sources

- mise configuration file precedence and `mise.toml`: https://mise.jdx.dev/configuration.html
- mise task configuration: https://mise.jdx.dev/tasks/
