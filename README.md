# Kendall Vnxt

Kendall Vnxt is a local-first development control plane for coordinating
Codex/BMAD work, reviewing execution evidence, and running the dashboard and
supervisor services that support the Kendall workflow.

It is intended to make an Ubuntu machine a repeatable Kendall Vnxt workstation:
the installer prepares the required developer toolchain, clones or validates
the repo, runs setup, and writes local evidence that the host is ready.

## What Is Included

- `apps/dashboard` for the operator control plane
- `services/supervisor` for queue/state/orchestration
- `packages/contracts` for shared transport vocabulary
- `packages/workflow-core` for workflow semantics support

## Install On Ubuntu

The only supported install method is a local Ubuntu terminal session:

1. Log in to Ubuntu 26.04 or later as a non-root user with sudo permissions.
2. Run the Kendall Vnxt bootstrap command from that Ubuntu session.
3. The script installs approved tools, clones or validates the repo, runs setup,
   and verifies the install.

No SSH-driven install, remote operator install, staged script workflow, manual
fallback install, or Windows-to-Linux orchestration is supported.

Run this command from the local Ubuntu terminal:

```bash
tmp=/tmp/kendall-vnxt-bootstrap.sh; url=https://raw.githubusercontent.com/slawdawg/Kendall-vnxt/main/scripts/bootstrap-linux.sh; if command -v curl >/dev/null 2>&1; then curl -fsSL "$url" -o "$tmp"; elif command -v wget >/dev/null 2>&1; then wget -qO "$tmp" "$url"; else sudo apt-get update && sudo apt-get install -y curl ca-certificates && curl -fsSL "$url" -o "$tmp"; fi && bash "$tmp" --install-kendall-vnxt
```

This command requires the bootstrap script URL to be reachable by the installer.
If this repository is private, publish an equivalent bootstrap script release
asset or complete the documented pre-authenticated download path before using
the README command as final install proof.

The bootstrap script:

- verifies Ubuntu 26.04 or later and refuses root;
- prompts for sudo normally when needed;
- installs the approved Linux toolchain;
- installs Codex CLI, Claude Code, and BMAD Method CLI;
- clones Kendall Vnxt to `$HOME/Kendall_Nxt` if missing;
- runs `pnpm run setup`;
- runs Linux install validation;
- writes install evidence under
  `$HOME/Kendall_Nxt/docs/linux-install/evidence/`.

If neither `curl` nor `wget` is present, the one-line command installs only
`curl` and `ca-certificates` first so it can download the bootstrap script.

Base install does not log in to GitHub, OpenAI/Codex, Anthropic/Claude, or
Tailscale. If private repo access is required, complete GitHub authentication
manually as the local Ubuntu user and rerun the same bootstrap command.

Detailed install docs are in
[docs/linux-install/install-playbook.md](docs/linux-install/install-playbook.md).

## Getting Started

After the bootstrap completes, open a terminal on the Ubuntu host:

```bash
cd "$HOME/Kendall_Nxt"
pnpm run preflight
```

Start the local services in separate terminals:

```bash
pnpm run dev:supervisor
```

```bash
pnpm run dev:dashboard
```

Default local URLs:

- dashboard: `http://localhost:3000`
- supervisor API: `http://localhost:8000`

By default, the dev and start commands bind to `0.0.0.0`, so the dashboard is
reachable from localhost and approved network interfaces configured after base
install.

Important environment variables:

- `NEXT_PUBLIC_SUPERVISOR_URL`: browser-visible supervisor base URL
- `SUPERVISOR_INTERNAL_URL`: server-side dashboard fetch URL for the supervisor
- `SUPERVISOR_DATABASE_URL`: SQLite by default for local use, PostgreSQL supported via `asyncpg`
- `SUPERVISOR_CORS_ORIGINS`: comma-separated allowed dashboard origins for browser calls and SSE
- `SUPERVISOR_CORS_ORIGIN_REGEX`: regex fallback for browser origins such as LAN IPs or Tailscale hostnames on port `3000`

## Post-Install Authentication

Authentication is intentionally outside the base install. After the local
bootstrap succeeds, log in only to the services you plan to use:

```bash
gh auth login
codex login
claude auth login
tailscale up
```

Those commands may vary by provider version and account policy. Keep secrets in
the local user's normal credential stores; do not commit them to the repo or
embed them in bootstrap scripts.

## Developer Checks

- `pnpm run check` runs preflight, documentation drift checks, documentation authority report drift checks, verification readiness report drift checks, authority readiness matrix drift checks, adaptive scoring decision-prep drift checks, premium execution policy drift checks, worker launch policy drift checks, dashboard e2e report drift checks, supervisor report catalog drift checks, execution boundary report drift checks, execution evidence boundary drift checks, provider fixture policy drift checks, process lifecycle policy drift checks, runbook verification checks, runtime evidence export drift checks, runtime evidence review drift checks, safe backlog drift checks, managed recipe policy drift checks, maintenance action plan drift checks, development runway drift checks, runner assignment status drift checks, delivery readiness policy drift checks, GitHub workflow policy drift checks, cleanup automation policy drift checks, maintenance readiness drift checks, token economy drift checks, workspace coordination drift checks, mise workflow drift checks, Linux install lane checks, BMAD work product boundary checks, Kendall Obsidian memory checks, clean-install boundary checks, dashboard build, and supervisor integration tests
- `pnpm run check:linux-bootstrap` verifies the Linux bootstrap contract, shell syntax, install docs, and focused bootstrap tests
- `pnpm run check:docs` verifies documentation indexes and blocked execution-authority story references
- `pnpm run check:documentation-authority` verifies documentation authority report contract/schema/service/dashboard/story alignment
- `pnpm run check:verification-readiness` verifies verification readiness report contract/schema/service/dashboard/story alignment
- `pnpm run check:authority-readiness` verifies authority readiness matrix contract/schema/service/dashboard/story alignment
- `pnpm run check:adaptive-scoring` verifies the adaptive scoring decision-prep package and runtime tripwires without enabling scoring
- `pnpm run check:premium-execution` verifies premium execution approval-packet boundaries without enabling paid provider execution
- `pnpm run check:worker-launch` verifies real CLI worker-launch approval-packet boundaries without enabling process launch
- `pnpm run check:e2e-report` verifies dashboard e2e runner/report/browser/story alignment
- `pnpm run check:reports` verifies supervisor report catalog route/runtime/dashboard/story alignment
- `pnpm run check:execution-boundary` verifies execution configuration/readiness/threat-boundary route/service/dashboard/story alignment
- `pnpm run check:execution-evidence` verifies execution-state boundary and disabled-provider proof route/service/story alignment
- `pnpm run check:provider-fixtures` verifies disabled local-provider fixture policy alignment
- `pnpm run check:process-lifecycle` verifies future process lifecycle design and disabled launch evidence alignment
- `pnpm run check:runbooks` verifies current operator runbooks describe the active verification chain
- `pnpm run check:runtime-export` verifies runtime evidence export contract/schema/service/dashboard/story alignment
- `pnpm run check:runtime-review` verifies runtime evidence review contract/schema/service/dashboard/story/runbook alignment
- `pnpm run check:safe-backlog` verifies safe backlog contract/schema/service/dashboard/story alignment
- `pnpm run check:managed-recipes` verifies managed recipe policy contract/schema/service/dashboard/story alignment
- `pnpm run check:maintenance-action-plan` verifies maintenance action plan contract/schema/service/dashboard/story alignment
- `pnpm run check:development-runway` verifies development runway contract/schema/service/dashboard/story/runbook alignment for larger PR-sized safe slices
- `pnpm run check:runner-assignment-status` verifies runner assignment status contract/schema/service/dashboard/runbook alignment
- `pnpm run check:delivery-readiness` verifies delivery readiness policy contract/schema/service/dashboard/story alignment
- `pnpm run check:github-workflow-policy` verifies Git/GCM, Codex connector, optional gh auth, connector probe, and plaintext-token stop-line alignment
- `pnpm run check:cleanup-automation` verifies cleanup automation approval-packet boundaries without deleting worktrees, branches, refs, or evidence
- `pnpm run check:maintenance-readiness` verifies maintenance readiness contract/schema/service/dashboard/story alignment
- `pnpm run check:token-economy` verifies token economy workflow and measurement evidence alignment
- `pnpm run check:workspace-coordination` verifies managed-worktree coordination evidence and cleanup approval boundaries
- `pnpm run check:mise-workflow` verifies the mise-managed normal workflow evidence
- `pnpm run check:linux-install-lane` verifies the delivered Linux install package, docs, and unsupported Windows/remote-install boundary
- `pnpm run check:bmad-work-products` verifies generated BMAD work products stay outside the Git-tracked clean-install surface
- `pnpm run check:knx-obsidian-memory` verifies the synthetic Kendall Obsidian memory vault loop
- `pnpm run check:clean-install-boundary` rejects tracked local-only BMAD/runtime/secret/unsupported Windows or WSL install artifacts
- Required aggregate test and build commands currently include `pnpm run test:clean-install-boundary`, `pnpm run test:knx-obsidian-memory`, `pnpm run test:codex-workspace`, `pnpm run test:codex-workspace-state`, `pnpm run test:workspace-command-resolution`, `pnpm run test:anti-churn-event-writer`, `pnpm run test:anti-churn-signature-classifier`, `pnpm run test:anti-churn-event-reader`, `pnpm run test:anti-churn-guidance-candidate-classifier`, `pnpm run test:anti-churn-guidance-dedupe`, `pnpm run test:anti-churn-guidance-output`, `pnpm run test:anti-churn-verification-routing`, `pnpm run test:anti-churn-apply-safe-gate`, `pnpm run test:anti-churn-hook-transaction-store`, `pnpm run test:anti-churn-source-apply`, `pnpm run test:anti-churn-verification-rollback`, `pnpm run test:dashboard-e2e-runner`, and `pnpm run build:dashboard`
- `pnpm run test:supervisor` runs supervisor tests through a repo-local uv cache wrapper
- `pnpm run test:e2e:dashboard` runs browser coverage for intake drafts, workflow actions, and detail navigation
- `pnpm run test:e2e:dashboard:controls` runs the focused controls-page browser slice with repo-local Playwright cache defaults
- `pnpm run lint:dashboard` runs the dashboard lint pass
- `pnpm run preflight` checks that shared JS deps and the supervisor virtualenv are ready
- `pnpm run doctor` is an alias for `preflight`

Playwright starts the dashboard with `next dev` for faster browser-test startup. `pnpm run check` remains the production-build gate. Supervisor tests launched from package scripts use a repo-local uv cache wrapper so local user-cache state does not decide whether verification can start.

## Project Docs

- Linux install docs: [docs/linux-install/index.md](docs/linux-install/index.md)
- Current architecture index: [docs/architecture/index.md](docs/architecture/index.md)
- Product requirements boundary: [docs/workflows/product-requirements-boundary.md](docs/workflows/product-requirements-boundary.md)
- Implementation evidence boundary: [docs/workflows/implementation-evidence-boundary.md](docs/workflows/implementation-evidence-boundary.md)
- Adaptive scoring decision preparation: [docs/workflows/adaptive-scoring-decision-prep.md](docs/workflows/adaptive-scoring-decision-prep.md)
- Current implementation checkpoint: [docs/implementation-checkpoint-2026-06-08-supervisor-dynamic-routing-follow-on.md](docs/implementation-checkpoint-2026-06-08-supervisor-dynamic-routing-follow-on.md)

## Why pnpm

This repo uses a `pnpm` workspace so JS dependencies come from a shared global store instead of being re-downloaded per worktree. Fresh worktrees still need `pnpm run setup`, but the JS install is mostly local linking and reuse rather than a full reinstall.

## Setup Commands

- `pnpm run setup` installs workspace dependencies and syncs the supervisor virtualenv
- `pnpm run setup:js` installs the JS workspace only
- `pnpm run setup:py` syncs the supervisor virtualenv only
- `pnpm run setup:e2e` installs the Chromium browser used by Playwright
- `pnpm run doctor` confirms the local Node/dependency/runtime setup is usable

## Container stack

`docker compose up --build` starts:

- PostgreSQL on `localhost:5432`
- supervisor on `localhost:8000`
- dashboard on `localhost:3000`
