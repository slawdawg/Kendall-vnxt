# Story 3.58: Verification Handoff Checkpoints

Date: 2026-06-09
Status: done

## Goal

Add runbook-backed handoff checkpoints to the verification readiness report so larger development slices can preserve local delivery, dashboard, fresh-VM, and authority-boundary gates in one review surface.

## Scope

- Add a shared `VerificationHandoffCheckpointView` contract and supervisor schema.
- Add handoff checkpoints to `GET /supervisor/verification-readiness-report`.
- Render checkpoints on the controls-page verification readiness panel.
- Extend supervisor integration, dashboard browser, verification drift, runbook drift, documentation, and story evidence coverage.
- Refresh architecture and story indexes through Story 3.58.

## Safety Boundary

This is verification and handoff guidance only. It does not approve:

- local or remote provider/model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- worker network access,
- credential access,
- worker remote delivery automation.

## Acceptance Criteria

- The verification readiness API includes local development, dashboard change, fresh-VM, and authority-boundary handoff checkpoints.
- Each checkpoint names required command IDs, related runbooks, and the next safe action.
- The controls page renders `Handoff checkpoints` with checkpoint IDs, commands, runbooks, and next actions.
- Static verification readiness and runbook checks fail if checkpoint coverage is removed.
- Full `pnpm run check` remains green.

## Verification

- `pnpm run check:verification-readiness`
- `pnpm run check:runbooks`
- `pnpm run check:docs`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "verification_readiness"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
