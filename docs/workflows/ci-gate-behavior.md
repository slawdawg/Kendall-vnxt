# CI Gate Behavior

This repository uses tiered CI so pull requests get fast, relevant feedback while
`main` still receives the full repository gate.

## Pull Requests

Pull requests run a final `check` job backed by component jobs:

- `static` always runs the deterministic repository drift checks through
  `pnpm run check:static`.
- `javascript` runs only when dashboard, shared package, JavaScript lockfile, or
  JavaScript workflow inputs changed.
- `supervisor` runs only when supervisor service files, supervisor test runner
  inputs, Python preflight inputs, or workflow inputs changed.

The final `check` job accepts skipped component jobs as intentional when their
path filters do not match. Failed or cancelled component jobs fail `check`.

## Main

Pushes to `main` run the full serial gate through `pnpm run check`. This keeps
the merged baseline covered by preflight, static drift checks, dashboard build,
and the complete supervisor test suite.

## Local Behavior

Use focused checks during development:

```bash
pnpm run check:static
pnpm run build:dashboard
pnpm run test:supervisor -- tests/integration/test_routing_preview.py -q -k routing
```

Use the profiled supervisor suite when test runtime is the question:

```bash
pnpm run test:supervisor:profile
```

That command reports the slowest supervisor tests with pytest durations so CI
runtime work starts from evidence instead of guessing.
