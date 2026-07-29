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

By default, both services bind to loopback for local-only use. LAN dashboard
access requires the authenticated HTTPS runtime: configure an explicit numeric
LAN bind, private certificate/key files, a supervisor-owned bootstrap password
file, and a private supervisor UDS path with `KENDALL_LAN_AUTH_ENABLED=true`.
The supervisor validates the bootstrap file and the dashboard must complete the
supervisor UDS startup gate before it accepts traffic; no plain HTTP LAN
listener is created.

For a first-time, copy-paste setup (including safe private-file permissions,
certificate creation, startup order, and troubleshooting), see
[Authenticated LAN dashboard setup](docs/workflows/authenticated-lan-dashboard-setup.md).

Important environment variables:

- `NEXT_PUBLIC_SUPERVISOR_URL`: browser-visible supervisor base URL
- `SUPERVISOR_INTERNAL_URL`: server-side dashboard fetch URL for the supervisor
- `SUPERVISOR_DATABASE_URL`: SQLite by default for local use, PostgreSQL supported via `asyncpg`
- `SUPERVISOR_CORS_ORIGINS`: comma-separated allowed dashboard origins for browser calls and SSE
- `SUPERVISOR_CORS_ORIGIN_REGEX`: regex fallback for browser origins such as LAN IPs or Tailscale hostnames on port `3000`

The checked-in Docker Compose profile is a container-only exception to the
loopback defaults: it sets `SUPERVISOR_CONTAINER_MODE=true` with
`SUPERVISOR_HOST=0.0.0.0` for the dashboard-to-supervisor service network and
`KENDALL_DASHBOARD_CONTAINER_MODE=true` with `KENDALL_DASHBOARD_HOST=0.0.0.0`
for the dashboard container. These values are ignored unless the matching
container mode flag is present; local runs remain loopback-only. This compose
profile is not LAN authentication: protected LAN access still requires the
explicit numeric HTTPS dashboard bind and private supervisor UDS gate. Compose
publishes both convenience ports on host loopback only; the `0.0.0.0` binds
exist solely on the private compose network.

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

For a read-only, bounded recommendation about whether source-ready work can be
planned in parallel, use the [Parallel Suitability Report runbook](docs/workflows/end-to-end-lane-runner.md#parallel-suitability-report-read-only).
It is advisory only and does not dispatch workers or mutate workspace, Git, or
GitHub state.

- `pnpm run check` runs preflight, documentation drift checks, governed worker execution dry-run checks, documentation authority report drift checks, legacy planning artifact inventory drift checks, review resource policy drift checks, verification readiness report drift checks, pipeline implementation readiness evidence drift checks, dashboard pipeline import-boundary checks, authority readiness matrix drift checks, adaptive scoring decision-prep drift checks, premium execution policy drift checks, worker launch policy drift checks, dashboard e2e report drift checks, supervisor report catalog drift checks, execution boundary report drift checks, execution evidence boundary drift checks, provider fixture policy drift checks, process lifecycle policy drift checks, runbook verification checks, runtime evidence export drift checks, runtime evidence review drift checks, safe backlog drift checks, managed recipe policy drift checks, maintenance action plan drift checks, development runway drift checks, runner assignment status drift checks, manager quality-gate adapter tests, delivery readiness policy drift checks, GitHub workflow policy drift checks, cleanup automation policy drift checks, maintenance readiness drift checks, token economy drift checks, workspace coordination drift checks, tmux orientation report checks, mise workflow drift checks, Linux install lane checks, BMAD work product boundary checks, Kendall Obsidian memory checks, clean-install boundary checks, dashboard build, and supervisor integration tests
- `pnpm run check:fast` runs the fast workflow gate for workspace, sandbox, dashboard, and CI drift before broader static or full verification
- `pnpm run test:check-plan` verifies changed-file check routing, fail-closed Git diff collection, quick-fail command coverage, and aggregate wiring for CI acceleration
- `pnpm run test:supervisor-runner` verifies supervisor test runner phase selection, conflicting flag rejection, and hard timeout diagnostics
- `pnpm run test:supervisor:review-route` runs focused supervisor Disclosure Packet parity tests for the report-only route; it makes no provider call and invokes no adapter or execution authority
- `pnpm run test:static-bundles` verifies static bundle coverage stays aligned with the monolithic static gate before CI reports bundle timing
- `pnpm run test:review-gated-low-risk-automation`, `pnpm run test:review-gated-low-risk-fake-adapter`, `pnpm run test:review-gated-low-risk-dry-run-adapter`, `pnpm run test:review-gated-low-risk-read-only-review`, `pnpm run test:review-gated-low-risk-bounded-write`, `pnpm run test:review-gated-low-risk-pilot-admission`, `pnpm run test:review-gated-low-risk-policy-eligibility`, `pnpm run test:review-gated-low-risk-route-policy`, `pnpm run test:metadata-only-provider-result`, and `pnpm run test:private-evidence-packet-policy` verify the metadata-only review-gated automation, ordered routes, private-evidence external-processing boundary, and provider-result redaction contracts
- `pnpm run test:static-bundle-summary` verifies static bundle timing reports, same-head summary evidence, and reporting-only promotion guardrails
- `pnpm run check:linux-bootstrap` verifies the Linux bootstrap contract, shell syntax, install docs, and focused bootstrap tests
- `pnpm run check:docs` verifies documentation indexes and blocked execution-authority story references
- `pnpm run check:governed-worker-execution-dry-run` verifies Claude/Hermes dry-run packet guardrails, metadata-only evidence, and blocked execution authorities
- `pnpm run check:documentation-authority` verifies documentation authority report contract/schema/service/dashboard/story alignment
- `pnpm run check:legacy-planning-inventory` verifies legacy planning artifact inventory contract/schema/service/API metadata-only boundary alignment
- `pnpm run check:review-resource-policy` verifies review trigger contract/schema/service/API/dashboard/catalog alignment without launching review tools
- `pnpm run check:verification-readiness` verifies verification readiness report contract/schema/service/dashboard/story alignment
- `pnpm run check:pipeline-implementation-readiness` verifies pipeline implementation readiness evidence covers contracts, fixtures, UI, guards, model/worker/review lanes, memory/source boundaries, refined UI readiness, and live-integration stop lines without approving execution authority
- `pnpm run check:dashboard-pipeline-boundary` verifies `/pipeline` dashboard source does not directly import or call provider, shell, filesystem, GitHub, Obsidian, runner launch, cleanup, or live network boundaries
- `pnpm run test:pipeline-implementation-readiness` verifies pipeline readiness evidence fails closed for missing evidence, unresolved blockers, refined UI follow-up drift, and live-integration authority metadata drift
- `pnpm run test:live-memory-source-enforcement` verifies the bounded live memory/source policy, fake-adapter evaluator, stop lines, rollback metadata, metadata-only audit event, and no default write authority
- `pnpm run test:bounded-live-memory-source` verifies bounded dry-run memory/source write plans, read-only approved source metadata inspection, and approval-gated draft-preview artifact creation
- `pnpm run check:authority-readiness` verifies authority readiness matrix contract/schema/service/dashboard/story alignment
- `pnpm run check:adaptive-scoring` verifies the adaptive scoring decision-prep package and runtime tripwires without enabling scoring
- `pnpm run check:branch-protection-readiness` verifies the standalone branch protection readiness packet without applying GitHub branch protection or repository rulesets
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
- `pnpm run test:manager-quality-gate` verifies manager quality-gate adapter catalog, dry-run, failure-packet, timeout, and fail-closed boundary behavior
- `pnpm run test:manager-control-plane` verifies manager orchestration, usage/resource routing, worker lifecycle, refill, continuous mode, and recovery behavior
- `pnpm run test:manager-control-plane-contract` verifies manager control-plane contract namespace, schema metadata, authority decisions, and type-only boundaries
- `pnpm run test:manager-control-plane-dispatcher-port` verifies dispatcher port contracts, in-memory adapter behavior, lease claiming, recovery, and bounded summaries
- `pnpm run test:manager-control-plane-forbidden-boundary` verifies backend-proof forbidden-operation classification, source boundaries, and metadata-only evidence
- `pnpm run test:manager-control-plane-run-contract` verifies Implementation Run Contract schema, backend-proof defaults, and authority operation classification
- `pnpm run test:manager-worker-clean-cycle-observer` verifies ten-clean-cycle worker observation, question handling, restart resets, missing sessions, and blocked checkpoints
- `pnpm run check:manager-control-plane` verifies manager control-plane script wiring, source policy, skill presence, and runtime contract drift
- `pnpm run check:manager-lifecycle-status-parity` verifies lifecycle status parity across TypeScript, workflow transitions, summary projection, and Python supervisor contracts
- `pnpm run test:runner-handoff-audit-json-validation` verifies filtered runner handoff audit JSON malformed-input and metadata-only retention fixture coverage
- `pnpm run check:delivery-readiness` verifies delivery readiness policy contract/schema/service/dashboard/story alignment
- `pnpm run check:github-workflow-policy` verifies Git/GCM, Codex connector, optional gh auth, connector probe, and plaintext-token stop-line alignment
- `pnpm run check:cleanup-automation` verifies cleanup automation approval-packet boundaries without deleting worktrees, branches, refs, or evidence
- `pnpm run check:maintenance-readiness` verifies maintenance readiness contract/schema/service/dashboard/story alignment
- `pnpm run check:token-economy` verifies token economy workflow and measurement evidence alignment
- `pnpm run check:workspace-coordination` verifies managed-worktree coordination evidence and cleanup approval boundaries
- `pnpm run test:tmux-orientation-report` verifies metadata-only tmux pane/workspace mapping, owner stop lines, malformed metadata handling, and no pane capture or tmux mutation
- `pnpm run check:tmux-orientation-report` verifies tmux orientation report script, test, runbook, aggregate wiring, and safety text alignment
- `pnpm run check:mise-workflow` verifies the mise-managed normal workflow evidence
- `pnpm run check:linux-install-lane` verifies the delivered Linux install package, docs, and unsupported Windows/remote-install boundary
- `pnpm run check:bmad-work-products` verifies generated BMAD work products stay outside the Git-tracked clean-install surface
- `pnpm run check:knx-obsidian-memory` verifies the synthetic Kendall Obsidian memory vault loop
- `pnpm run check:clean-install-boundary` rejects tracked local-only BMAD/runtime/secret/unsupported Windows or WSL install artifacts
- Required aggregate test and build commands currently include `pnpm run test:supervisor-runner`, `pnpm run test:static-bundle-summary`, `pnpm run test:clean-install-boundary`, `pnpm run test:knx-obsidian-memory`, `pnpm run test:work-packet-contracts`, `pnpm run test:work-packet-stage-map`, `pnpm run test:work-packet-fixtures`, `pnpm run test:pipeline-state-matrix`, `pnpm run test:dashboard-pipeline-fixtures`, `pnpm run test:dashboard-memory-proposals`, `pnpm run test:pipeline-implementation-readiness`, `pnpm run test:live-memory-source-enforcement`, `pnpm run test:bounded-live-memory-source`, `pnpm run test:tmux-orientation-report`, `pnpm run test:codex-workspace`, `pnpm run test:sandbox-boundary-classifier`, `pnpm run test:codex-workspace-state`, `pnpm run test:workspace-command-resolution`, `pnpm run test:manager-quality-gate`, `pnpm run test:manager-control-plane`, `pnpm run test:manager-control-plane-contract`, `pnpm run test:manager-control-plane-dispatcher-port`, `pnpm run test:manager-control-plane-forbidden-boundary`, `pnpm run test:manager-control-plane-run-contract`, `pnpm run test:manager-worker-clean-cycle-observer`, `pnpm run test:runner-handoff-audit-json-validation`, `pnpm run test:anti-churn-event-writer`, `pnpm run test:anti-churn-signature-classifier`, `pnpm run test:anti-churn-event-reader`, `pnpm run test:anti-churn-guidance-candidate-classifier`, `pnpm run test:anti-churn-guidance-dedupe`, `pnpm run test:anti-churn-guidance-output`, `pnpm run test:anti-churn-verification-routing`, `pnpm run test:anti-churn-apply-safe-gate`, `pnpm run test:anti-churn-hook-transaction-store`, `pnpm run test:anti-churn-source-apply`, `pnpm run test:anti-churn-verification-rollback`, `pnpm run test:dashboard-e2e-runner`, and `pnpm run build:dashboard`
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
- Epic 27 requirements/evidence contract: [docs/product/kendall-nxt-epic-27-requirements-and-evidence-contract.md](docs/product/kendall-nxt-epic-27-requirements-and-evidence-contract.md)
- Implementation evidence boundary: [docs/workflows/implementation-evidence-boundary.md](docs/workflows/implementation-evidence-boundary.md)
- Bounded-write plan runbook: [docs/workflows/bounded-write-plan-runbook.md](docs/workflows/bounded-write-plan-runbook.md)
- Provider-routing gateway note: [docs/workflows/provider-routing-gateway-note.md](docs/workflows/provider-routing-gateway-note.md) — report-only disclosure packets only; it does not execute provider calls.
- Managed workspace cleanup runbook: [docs/codex-workspace-cleanup-runbook.md](docs/codex-workspace-cleanup-runbook.md)
- Base Checkout recovery: [docs/workflows/base-checkout-recovery.md](docs/workflows/base-checkout-recovery.md)
- Restricted exact-tree closeout: [docs/codex-workspace-cleanup-runbook.md#restricted-exact-tree-closeout](docs/codex-workspace-cleanup-runbook.md#restricted-exact-tree-closeout)
- Manager terminal-event dogfood runbook: [docs/workflows/manager-terminal-event-dogfood.md](docs/workflows/manager-terminal-event-dogfood.md)
- Manager worker delivery receipt/instruction smoke run: [docs/workflows/tmux-codex-worker-smoke-run.md](docs/workflows/tmux-codex-worker-smoke-run.md)
- Legacy dashboard fixture/fallback audit: [docs/workflows/legacy-dashboard-fixture-fallback-audit-2026-07-17.md](docs/workflows/legacy-dashboard-fixture-fallback-audit-2026-07-17.md)
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
