# Mise Workflow

Status: source-owned workflow contract

## Decision

Kendall_Nxt uses a minimal tracked `mise.toml` for optional local readiness.
`mise` activates non-secret tool versions and exposes task aliases only.

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

## Boundary

`mise.toml` must not define:

- `[env]`
- hooks
- plugins
- dotenv loading
- provider/API secrets
- worker launch
- process launch
- GitHub mutation
- PR/merge automation
- cleanup
- branch deletion
- worktree removal
- local commit discard
- shell profile edits
- Graphify commands
- Linux install lane work
- custom lifecycle automation

Future expansion to env loading, secrets, hooks, plugins, Devbox, Nix, Dev
Containers, or provider-backed behavior needs separate approval and evidence.

## Evidence Boundary

Dated implementation evidence, post-merge validation transcripts, and local
tool trial packets belong under ignored local output. If their decisions matter
to the repo, rewrite the decision into a source-owned artifact and keep the
packet local.
