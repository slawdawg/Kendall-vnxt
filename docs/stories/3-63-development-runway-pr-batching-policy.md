# Story 3.63: Development Runway PR Batching Policy

Status: done
Ready for Review

## Goal

Make larger PR slice expectations explicit in the read-only development runway so safe work is batched into complete reviewable units instead of fragmented micro-PRs.

## Scope

- Add development runway batching policy and PR checklist contract fields.
- Populate policy guidance that defaults future safe work to larger reviewable PRs across related surfaces.
- Render batching policy and checklist guidance in the controls-page development runway panel.
- Extend supervisor, dashboard browser, development runway drift, runtime export drift, docs, and story evidence coverage.
- Preserve execution-authority stop lines; batching policy does not approve provider calls, process launch, premium execution, arbitrary commands, source mutation, network access, credential access, or remote automation.

## Acceptance

- `DevelopmentRunwayReportView` exposes `batchingPolicy` and `prBatchingChecklist`.
- The development runway report states that related API contracts, supervisor service, dashboard, tests, drift checks, and docs should land together when they support one safe slice.
- The controls page renders `Batching policy` and `PR batching checklist`.
- `pnpm run check:development-runway` fails if contract, schema, service, dashboard, browser, supervisor, story, runtime evidence, or doc coverage drifts.
- Runtime evidence export story evidence includes Story 3.63.

## Verification

- `pnpm run check:development-runway`
- `pnpm run check:runtime-export`
- `pnpm run check:docs`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "development_runway"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
