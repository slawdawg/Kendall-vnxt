# CI Gate Behavior

Current implementation reference: the accepted repository-wide target and
change rules are in `ci-confidence-and-efficiency-policy.md`. This document
describes behavior that exists today; when a policy migration is incomplete,
the effective gate remains the more conservative behavior until its replacement
has same-head evidence.

This repository uses tiered CI so pull requests get fast, relevant feedback while
`main` still receives the full repository gate.

## Pull Requests

Pull requests run a final `check` job backed by component jobs:

- `fast` always runs `pnpm run check:fast` before the broader static gate. It
  covers CI policy wiring, workspace delivery command readiness,
  sandbox-boundary and anti-churn routing, and dashboard E2E runner contracts.
- `static_bundle` runs required matrix jobs for `core`, `manager`,
  `workspace`, `policy`, `pipeline-dashboard`, and `anti-churn` when
  `scripts/check-plan.mjs --ci-outputs` marks full static confidence as
  required.
- `static` is the retained aggregate static gate. It does not rerun
  `pnpm run check:static` in PR CI; it fans in `changes`, `fast`, and the
  required `static_bundle` matrix result so existing final-check semantics keep
  a stable `static` authority point without duplicating the long static chain.
- `static_bundle_summary` downloads the bundle timing JSON artifacts and writes
  a same-head bundle summary artifact. It remains non-blocking and records that
  the final static gate now requires the bundle matrix.
- `javascript` runs only when dashboard, shared package, JavaScript lockfile, or
  JavaScript workflow inputs changed.
- `supervisor` runs only when supervisor service files, supervisor test runner
  inputs, Python preflight inputs, or workflow inputs changed.

The final `check` job accepts skipped component jobs as intentional when the
planner does not require that component. Failed or cancelled required component
jobs fail `check`.

## Main

Pushes to `main` run the full serial gate through `pnpm run check`. This keeps
the merged baseline covered by preflight, static drift checks, dashboard build,
and the complete supervisor test suite. The push job runs `pnpm run check:fast`
first so workflow, workspace, sandbox-boundary, and dashboard E2E contract
regressions fail before the long serial gate.

## Local Behavior

Use focused checks during development:

```bash
pnpm run check:fast
pnpm run check:ci-fast
pnpm run check:workspace-fast
pnpm run check:sandbox-fast
pnpm run check:dashboard-fast
pnpm run check:dashboard-delivery
pnpm run check:static
pnpm run check:static-bundles
pnpm run test:static-bundle-summary
pnpm run build:dashboard
pnpm run test:supervisor -- tests/integration/test_routing_preview.py -q -k routing
```

Use the narrower fast suites when the change touches only one friction surface:

- `check:ci-fast` for GitHub workflow and workspace coordination policy.
- `check:workspace-fast` for the bounded Codex workspace delivery proof: state,
  command resolution, Base Checkout recovery, admission/handoff/pre-write safety,
  the focused delivery fixture, and its exact-profile contract. The raw
  `test:codex-workspace` integration suite remains a separately runnable full
  static/full-check proof.
- `check:sandbox-fast` for sandbox-boundary and anti-churn routing.
- `check:dashboard-fast` for dashboard E2E runner contracts and pipeline
  fixture smoke coverage.
- `check:dashboard-delivery` for a dashboard-only managed lane. It is selected
  by `finish-pr --verify scoped` only when every changed path is a dashboard
  source, dashboard contract/e2e test, dashboard runner/configuration file, or
  documentation path. It runs docs validation, the dashboard type/build
  boundary and build, authenticated runtime/proxy contracts, pipeline loader
  and fixture contracts, and browser/E2E runner contracts. It deliberately
  excludes `check:workspace-fast` and `test:codex-workspace`; mixed or unknown
  changes still use the generic `check:fast` profile. It is not a replacement
  for the repository `check` gate or PR CI.
- `check:static-<bundle>` for one static bundle lane.
- `node ./scripts/summarize-static-bundle-reports.mjs --reports-dir <dir>` for
  the same-head summary used by the CI artifact.

Use the profiled supervisor suite when test runtime is the question:

```bash
pnpm run test:supervisor:profile
```

That command reports the slowest supervisor tests with pytest durations so CI
runtime work starts from evidence instead of guessing.
