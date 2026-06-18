---
date: 2026-06-18
status: decision research
topic: worktree environment readiness method comparison
input_documents:
  - docs/research/direnv-git-worktrees-agentic-programming-technical-research-2026-06-18.md
  - docs/research/direnv-alternatives-for-kendall-nxt-technical-research-2026-06-18.md
  - scripts/codex-workspace.mjs
  - docs/workflows/workspace-coordination-report.md
---

# Worktree Environment Method Comparison and Implementation Decision Research

## Executive Summary

Kendall_Nxt should not replace `scripts/codex-workspace.mjs` with `direnv`,
`mise`, Nix, Devbox, dotenvx, Dev Containers, Claude Code worktrees, or Codex
app worktrees. Those tools solve different parts of the problem. The existing
`codex-workspace.mjs` script is the strongest fit for workspace lifecycle
governance because it owns task manifests, branch and worktree creation,
resume, finish-pr, verification hooks, PR creation, merged cleanup, orphan
cleanup, rebuild-index, and doctor checks.

The actual gap is narrower: fresh or parallel worktrees need a reliable,
redacted, lane-aware way to determine whether the environment is ready before
an agent starts work. The best implementation is therefore a new
repo-native **worktree environment readiness contract/checker** that integrates
with `codex-workspace.mjs` and can later use environment tools as adapters.

Recommendation:

1. **Implement a read-only Kendall_Nxt worktree environment readiness checker.**
2. **Do not adopt `direnv`, `mise`, Nix, Devbox, dotenvx, or Dev Containers as
   mandatory defaults yet.**
3. **Use `mise` as the leading optional backend candidate after the checker
   exists.**
4. **Use dotenvx only for explicit command-scoped env injection, not broad
   session activation.**
5. **Reserve Devbox/Nix and Dev Containers for later escalation profiles.**

## Problem Framing

There are two separate jobs:

1. **Workspace lifecycle control**
   - create task worktree;
   - choose branch/base;
   - write task manifest;
   - resume work;
   - run verification;
   - commit/push/create PR;
   - preserve cleanup evidence;
   - remove merged or orphaned worktrees safely.

2. **Environment readiness**
   - verify tool versions;
   - confirm `pnpm`, `uv`, Node, Python, Git, and agent CLIs are usable;
   - determine whether dependencies are installed;
   - decide shared vs isolated venv policy;
   - decide whether any env/config/secrets are allowed;
   - produce redacted readiness evidence.

`scripts/codex-workspace.mjs` already does the first job. None of the
environment tools should take that over. The missing implementation should
cover the second job.

## Method Comparison Matrix

| Method | Primary Job | Strength | Weakness | Implement Now? | Role |
| --- | --- | --- | --- | --- | --- |
| `scripts/codex-workspace.mjs` | Workspace lifecycle | Best fit for manifests, branch/worktree safety, finish-pr, cleanup | Does not deeply classify env readiness | Extend adjacent, do not replace | Control plane |
| repo-native readiness checker | Env policy/evidence | Best fit for Kendall_Nxt authority, redaction, lane policy | New code to maintain | Yes, read-only first | Decision layer |
| `mise` | Tools/env/tasks | Best default third-party candidate; structured project config | New dependency; secret policy still required | Not mandatory yet | Optional backend |
| `direnv` | Shell env activation | Lightweight, works with worktrees | `.envrc` is executable Bash; broad session env risk | No default adoption | Optional local preference |
| dotenvx | Command-scoped env | Good explicit wrapper for approved commands | Does not manage tools/venv | Later, scoped | Secret/env command adapter |
| Devbox | Reproducible shell | Friendlier Nix-backed OS tools | Heavier than routine readiness | Later | Reproducibility profile |
| Nix develop | Strict reproducibility | Strongest package reproducibility | High adoption burden; experimental command caveats | Later | Strict reproducibility profile |
| Dev Containers | Runtime isolation | Strongest isolation boundary | Slowest/heaviest daily workflow | Later | High-isolation profile |
| asdf | Tool versions | Simple `.tool-versions` | Does not manage env vars | No standalone implementation | Possible version-only input |
| `.worktreeinclude` | Copy ignored files into tool worktrees | Useful for Claude/Codex app managed worktrees | Can fan out secrets/config; tool-specific | Only with policy | Tool-native bridge |
| Claude `--worktree` | Claude-native worktree creation | Fast native Claude parallel sessions | Outside Kendall_Nxt manifest unless mirrored | No for governed work | Exploratory or adapter |
| Codex app worktrees | Codex app native background work | App-managed worktree, snapshots, local env scripts | Different lifecycle than repo protocol | No for CLI lane default | Adjacent surface |

## codex-workspace.mjs Assessment

`scripts/codex-workspace.mjs` should remain authoritative for managed
Kendall_Nxt work because it already provides the lifecycle features the
environment tools do not:

- `start`: creates a task manifest, branch, and Git worktree.
- `list`: inventories known workspaces.
- `resume`: prints task status, branch, worktree, and resume command.
- `finish-pr`: runs optional verification, stages/commits intentionally,
  pushes, and creates/views a PR through GitHub CLI.
- `cleanup-merged`: requires merged PR state and clean worktree before cleanup.
- `cleanup-orphans`: identifies unregistered directories under the managed
  worktree root.
- `rebuild-index`: rebuilds manifests from Git worktrees when local state is
  stale.
- `doctor`: checks local workspace protocol readiness.

Its safety model lines up with Kendall_Nxt's operating principles:

- branch and task id validation;
- protected branch awareness;
- manifest locks;
- managed worktree root;
- explicit dry-runs;
- explicit `--apply` for cleanup;
- no implicit merge or cleanup from generic continuation.

The right implementation is not to fold `mise`, `direnv`, or Nix directly into
`finish-pr` or `start`. Instead, add a separate readiness command or profile
that `start`/`resume` can reference.

## Decision Criteria

### Must-Have

- Preserves `codex-workspace.mjs` as the lifecycle control plane.
- Produces redacted evidence.
- Fails closed on missing tools, ambiguous worktree state, or secret policy.
- Works in a fresh managed Git worktree.
- Supports Node/pnpm and Python/uv readiness.
- Does not load provider/API secrets into every agent process.
- Does not mutate setup unless explicitly approved.

### Should-Have

- Detects optional backends: `mise`, dotenvx, Devbox, Nix, devcontainer.
- Recommends backend by lane.
- Provides a command wrapper for approved command-scoped env injection.
- Distinguishes docs/planning, code, dependency, provider, and cleanup lanes.
- Can be run from `codex-workspace.mjs doctor` or after `start`.

### Non-Goals

- Replacing `codex-workspace.mjs`.
- Automatically running `direnv allow`.
- Automatically installing `mise`, Nix, Devbox, Docker, or dotenvx.
- Copying `.env` into every worktree.
- Launching providers, agents, GitHub delivery, or cleanup.
- Making containers mandatory for routine work.

## Recommended Implementation

Implement a new read-only script:

```text
node ./scripts/worktree-env-readiness.mjs doctor
node ./scripts/worktree-env-readiness.mjs plan --lane <lane>
```

Optional future:

```text
node ./scripts/worktree-env-readiness.mjs run --profile dotenvx -- <command>
```

Initial behavior:

- inspect current worktree;
- verify Git worktree state;
- detect active `codex-workspace` manifest if present;
- check Node, pnpm, uv, Python, Git;
- check `pnpm run preflight` readiness optionally as a separate profile;
- detect config files: `mise.toml`, `devbox.json`, `flake.nix`,
  `.tool-versions`, `.devcontainer/devcontainer.json`;
- detect installed optional tools without installing them;
- classify lane policy;
- report redacted result.

Initial evidence shape:

```json
{
  "schema": "kendall-worktree-env-readiness/v1",
  "worktreePath": "...",
  "manifestTaskId": "...",
  "lane": "docs|code|dependency|provider|cleanup|unknown",
  "selectedProfile": "plain",
  "detectedBackends": ["mise", "dotenvx"],
  "checks": [],
  "mutations": [],
  "redactions": ["environment", "provider-tokens"],
  "result": "pass|fail|blocked|skipped"
}
```

## Backend Policy

### Plain Profile

Default first implementation. Uses only current repo tools:

- `git status`;
- `git worktree list --porcelain`;
- `node --version`;
- `pnpm --version`;
- `uv --version`;
- `pnpm run preflight` when explicitly requested.

Implement first.

### mise Profile

Recommended first third-party backend after plain profile. Use for:

- routine local tool version readiness;
- non-secret env/tasks;
- project-local task wrappers.

Do not use for:

- broad provider secrets;
- dependency isolation;
- replacing workspace manifests.

### dotenvx Profile

Use only for approved command-scoped env injection:

```text
dotenvx run -f <approved-env-file> -- <approved-command>
```

Do not use as a broad session default.

### Devbox/Nix Profile

Use when reproducible OS-level tooling matters. Defer until a real pain point
justifies the complexity.

### Dev Container Profile

Use for high-isolation lanes, dependency experiments, or toolchain mutation
that should not touch the host. Defer as an escalation profile.

## Should We Implement Any of Them?

Yes, but only the repo-native readiness checker now.

Do **not** immediately implement:

- committed `.envrc`;
- mandatory `mise.toml`;
- Nix/Devbox dev shell;
- devcontainer requirement;
- dotenvx secret workflow;
- Claude/Codex app worktree replacement.

Implement first:

1. readiness contract doc;
2. read-only readiness checker;
3. fixtures/tests for lane decisions;
4. optional `codex-workspace.mjs doctor` link to the checker;
5. no mutations and no secrets.

Then evaluate whether `mise` earns adoption based on a real managed-worktree
proof.

## Recommended Next Story

**Define Worktree Environment Readiness Contract**

Acceptance criteria:

- Adds a docs contract describing readiness profiles and lane policy.
- Adds `scripts/worktree-env-readiness.mjs` in read-only mode.
- Detects current worktree and optional backends.
- Emits redacted JSON or structured text evidence.
- Blocks provider/secret readiness by default.
- Does not install tools, copy secrets, run `direnv allow`, create PRs, or clean
  worktrees.
- Adds focused tests for profile selection and redaction.

Suggested follow-up story:

**Evaluate mise as Default Worktree Readiness Backend**

Only after the first story exists.

## Sources

Primary source links:

- Git worktree docs: https://git-scm.com/docs/git-worktree
- direnv docs: https://direnv.net/
- mise docs: https://mise.jdx.dev/
- Nix develop docs:
  https://nix.dev/manual/nix/2.28/command-ref/new-cli/nix3-develop.html
- Devbox docs: https://www.jetify.com/docs/devbox
- asdf docs: https://asdf-vm.com/guide/introduction.html
- dotenvx docs/repo: https://github.com/dotenvx/dotenvx
- Dev Containers spec: https://containers.dev/overview
- VS Code Dev Containers:
  https://code.visualstudio.com/docs/devcontainers/containers
- Claude Code worktrees: https://code.claude.com/docs/en/worktrees
- OpenAI Codex manual:
  https://developers.openai.com/codex/codex-manual.md

Local source inputs:

- `scripts/codex-workspace.mjs`
- `docs/workflows/workspace-coordination-report.md`
- `README.md`
- `AGENTS.md`
- `docs/research/direnv-git-worktrees-agentic-programming-technical-research-2026-06-18.md`
- `docs/research/direnv-alternatives-for-kendall-nxt-technical-research-2026-06-18.md`

## Final Decision

Implement **Kendall_Nxt Worktree Environment Readiness** first. Treat every
third-party method as a backend option, not as the control plane.

The practical implementation decision is:

```text
Keep codex-workspace.mjs.
Add worktree-env-readiness.mjs.
Default to plain read-only checks.
Evaluate mise next.
Use dotenvx only for approved command-scoped env.
Defer Nix, Devbox, and Dev Containers until lane-specific needs justify them.
```
