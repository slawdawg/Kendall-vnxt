---
date: 2026-06-18
status: recommendation research
topic: standard worktree management and environment readiness tooling
input_documents:
  - docs/research/direnv-git-worktrees-agentic-programming-technical-research-2026-06-18.md
  - docs/research/direnv-alternatives-for-kendall-nxt-technical-research-2026-06-18.md
  - docs/research/worktree-environment-method-comparison-decision-research-2026-06-18.md
  - scripts/codex-workspace.mjs
  - docs/workflows/workspace-coordination-report.md
---

# Standard Worktree Workflow and Tooling Recommendation

## Executive Summary

The prior recommendation over-weighted custom code. If Kendall_Nxt should use
mature tools and standard workflows first, the recommendation changes:

1. Keep `scripts/codex-workspace.mjs` only as Kendall_Nxt's thin governance
   wrapper around standard Git worktree operations.
2. Evaluate `mise` first for worktree environment readiness because it is a
   mature tool for project tools, environment variables, and tasks.
3. Use `mise` tasks to reduce command friction before writing new workflow
   scripts.
4. Use dotenvx only when a command needs explicit dotenv injection.
5. Use Devbox/Nix or Dev Containers only when reproducibility or isolation
   needs are proven by pain, not as the default.
6. Write custom Kendall_Nxt code last, only for gaps mature tools cannot cover:
   evidence, authority, redaction, lane classification, and cleanup guardrails.

The next implementation should therefore be:

**Evaluate mise for Kendall_Nxt Managed Worktree Readiness**

not "build a custom readiness checker" first.

## Decision Shift

Previous decision:

```text
Build repo-native worktree-env-readiness.mjs first.
Evaluate mise later.
```

Revised decision:

```text
Use mature tooling first.
Evaluate mise with existing codex-workspace.mjs.
Document standard workflow.
Only add custom code for uncovered governance/evidence gaps.
```

The purpose is to reduce Bob's friction and pain points without creating a
bespoke environment-management subsystem.

## Standard Practices From Primary Sources

### Git Worktree Management

Git already provides the worktree lifecycle primitives Kendall_Nxt should use:

- `git worktree add` for linked working trees;
- `git worktree list --porcelain` for machine-readable inventory;
- `git worktree remove` for cleanup;
- `git worktree prune` for stale administrative records;
- `git worktree lock` for preventing pruning/removal of active or special
  worktrees;
- clean-worktree checks before removal.

Kendall_Nxt should avoid reimplementing Git behavior. The current
`codex-workspace.mjs` is acceptable because it wraps these standard operations
with task manifests, branch naming, dry-runs, and cleanup gates. That is
governance glue, not a replacement for Git.

Source: https://git-scm.com/docs/git-worktree

### Environment and Task Readiness

`mise` is a strong standard tool for the specific friction Bob is describing:
moving between project directories and having tools, env vars, and common tasks
ready. Its docs describe:

- per-project tool management;
- environment variables in `mise.toml`;
- `mise exec` / `mise run` execution with configured env;
- shell activation when changing directories;
- redaction support for sensitive variables;
- required variables;
- dotenv/json/yaml/toml env file loading;
- path directives;
- tasks in `mise.toml` or standalone task files.

Those features map directly to Kendall_Nxt's current pain points better than a
new custom checker does.

Source: https://mise.jdx.dev/ and https://mise.jdx.dev/environments/

### Agent Worktree Workflows

Claude Code documents native worktree support with `claude --worktree`,
`.worktreeinclude`, cleanup behavior, and manual Git worktree workflows. This
means Kendall_Nxt should not reinvent Claude's native exploratory flow. For
governed Kendall_Nxt work, keep using managed worktrees; for exploratory Claude
sessions, Claude's native workflow is a mature option.

Source: https://code.claude.com/docs/en/worktrees

### Containerized Development

Dev Containers are mature and standard for full development environments where
isolation and repeatability matter. They are not the lowest-friction default for
every worktree, but they should be the escalation path when host pollution,
dependency mutation, or high-risk tool experiments cause pain.

Sources: https://containers.dev/overview and
https://code.visualstudio.com/docs/devcontainers/containers

## Comparison Against Bob's Pain Points

| Pain Point | Best Standard Tool/Workflow | Why |
| --- | --- | --- |
| New worktree needs setup every time | `mise install`, `mise run`, existing `pnpm run setup` | Mature task/tool readiness without custom code |
| Hard to remember commands | `mise` tasks | Standard task aliases in `mise.toml` or `mise-tasks/` |
| Missing Node/Python versions | `mise` tools | Project-pinned tools |
| Env vars not present | `mise` env with redaction/required vars, dotenvx for command-scoped injection | Structured env management |
| Fear of leaking secrets | `mise` redactions and required vars; dotenvx only for command wrapper | Avoid broad session secrets |
| Parallel agents conflict | Git worktrees plus existing workspace manifests | Standard source isolation with governance |
| Cleanup risk | Git worktree remove/prune plus `codex-workspace.mjs` dry-run gates | Standard cleanup with Kendall_Nxt guardrails |
| Dependency experiments pollute host | Dev Containers or Devbox/Nix | Mature isolation/reproducibility |
| Too much custom ceremony | Use tool-native workflows first | Less bespoke process |

## Recommended Near-Term Workflow

### 1. Keep Current Worktree Lifecycle

Continue using:

```text
node ./scripts/codex-workspace.mjs start "<task>"
node ./scripts/codex-workspace.mjs list
node ./scripts/codex-workspace.mjs resume "<task>"
node ./scripts/codex-workspace.mjs finish-pr ...
node ./scripts/codex-workspace.mjs cleanup-merged --dry-run
```

Do not replace this with Claude-native worktrees, Codex app worktrees, `mise`,
Nix, or containers for governed work.

### 2. Evaluate mise in One Managed Experiment Worktree

Create a non-invasive `mise` trial:

```text
mise.toml or .mise.example.toml
[tools]
node = "22.13.0"
pnpm = "11.5.2"
python = "3.12"

[tasks.preflight]
run = "pnpm run preflight"

[tasks.setup]
run = "pnpm run setup"
```

The version pins must come from existing Kendall_Nxt sources of truth:

- `.node-version` currently pins Node `22.13.0`.
- `package.json` currently declares `pnpm@11.5.2` through both `engines.pnpm`
  and `packageManager`.
- `services/supervisor/pyproject.toml` requires Python `>=3.12`.
- `runtime/pyproject.toml` requires Python `>=3.11`.

The first trial should avoid creating a competing version policy. The research
point is that `mise` should own tool/task activation after reading the repo's
declared requirements, before Kendall_Nxt invents a custom readiness command.
Python `3.12` is the appropriate first shared worktree default because it
satisfies both Python package constraints.

### 3. Keep Secrets Out of the Default Trial

The first `mise` trial should not load provider/API secrets. It can define
non-secret defaults, required-variable names, and output redaction conventions,
but credential workflows should remain separate. Do not treat `mise` redaction as
a secret manager.

### 4. Use dotenvx Only for Approved Commands

If a command needs a dotenv file:

```text
dotenvx run -f <approved-env-file> -- <approved-command>
```

This should be command-scoped, not a default login-shell behavior.

### 5. Defer Heavyweight Options

Do not start with Nix, Devbox, or Dev Containers unless the `mise` trial fails
on a concrete need:

- strict reproducibility;
- OS-level packages;
- high-risk dependency mutation;
- host contamination;
- CI parity.

## What Custom Code Remains Justified?

Custom code is still justified only in Kendall_Nxt-specific seams that mature
tools do not own:

1. Workspace task manifest lifecycle.
2. Authority stop lines.
3. Redacted evidence summaries.
4. PR finish and cleanup governance.
5. Mapping Bob's work lanes to allowed actions.

Custom code is **not** justified yet for:

- replacing `mise` task execution;
- replacing `mise` tool version activation;
- replacing dotenvx env injection;
- replacing Git worktree operations;
- replacing Dev Container isolation.

## Revised Implementation Recommendation

### Story 1: Evaluate mise for Kendall_Nxt Managed Worktree Readiness

Scope:

- Add a docs proposal for `mise` use in Kendall_Nxt managed worktrees.
- Create an example `mise` config or tracked proposal, without secrets.
- Test in one managed experiment worktree.
- Verify setup/preflight path.
- Compare friction against current workflow.
- Document gaps.

Acceptance criteria:

- A fresh managed worktree can run `mise install` without changing unrelated
  repo files.
- `mise run setup` reaches the existing `pnpm run setup` path.
- `mise run preflight` reaches the existing `pnpm run preflight` path.
- The trial records command count and elapsed setup time for the current
  workflow and the `mise` workflow.
- The trial records any prompts, manual steps, or missing host prerequisites.
- The trial confirms Node `22.13.0`, pnpm `11.5.2`, and Python `3.12` are active
  for the worktree.
- The trial confirms no provider/API secrets are loaded by default.
- The trial documents whether `mise` tasks reduce command friction enough to
  justify a tracked config.
- The trial identifies any remaining gaps that would require custom
  Kendall_Nxt code.

Stop lines:

- Do not make `mise` mandatory.
- Do not load provider/API secrets.
- Do not remove `codex-workspace.mjs`.
- Do not add Nix/Devbox/Dev Containers in this story.
- Do not add a custom readiness checker unless the `mise` trial proves a
  specific uncovered gap.

### Story 2: Standardize Worktree Task Commands

Only if Story 1 is successful:

- Add `mise` tasks for setup, preflight, dashboard build, supervisor tests, and
  workspace doctor.
- Keep package scripts as source of truth where they already exist.
- Use `mise` as a convenience task layer, not a replacement build system.

### Story 3: Add Governance Evidence Glue

Only after the mature tool workflow is proven:

- Add minimal custom evidence capture if needed.
- Keep it separate from tool setup.
- Record only metadata and redacted summaries.

## Final Recommendation

The implementation decision should be:

```text
Use Git worktrees as the standard lifecycle primitive.
Keep codex-workspace.mjs as thin Kendall_Nxt governance around Git.
Evaluate mise first for environment readiness and task friction.
Use dotenvx for command-scoped env only when needed.
Escalate to Devbox/Nix/Dev Containers only for proven reproducibility/isolation pain.
Write custom code last, only for authority/evidence gaps.
```

This better matches the principle: mature tools and standard practices first,
custom Kendall_Nxt code last.

## Sources

- Git worktree docs: https://git-scm.com/docs/git-worktree
- mise home: https://mise.jdx.dev/
- mise environments: https://mise.jdx.dev/environments/
- mise tasks: https://mise.jdx.dev/tasks/
- Claude Code worktrees: https://code.claude.com/docs/en/worktrees
- Dev Containers spec: https://containers.dev/overview
- VS Code Dev Containers:
  https://code.visualstudio.com/docs/devcontainers/containers
- Prior local research:
  `docs/research/direnv-git-worktrees-agentic-programming-technical-research-2026-06-18.md`
- Prior local alternatives research:
  `docs/research/direnv-alternatives-for-kendall-nxt-technical-research-2026-06-18.md`
- Prior local comparison research:
  `docs/research/worktree-environment-method-comparison-decision-research-2026-06-18.md`
- Kendall_Nxt workspace protocol:
  `scripts/codex-workspace.mjs`
