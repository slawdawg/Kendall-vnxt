# Story 3.29: Runbook Verification Alignment

Date: 2026-06-09
Status: ready for review

## Goal

Keep current operator runbooks aligned with the active verification chain so fresh VM setup, handoffs, and local development instructions do not drift behind the repo checks.

## Scope

- Add `pnpm run check:runbooks`.
- Validate current runbooks mention `pnpm run check`, `check:docs`, `check:e2e-report`, `check:reports`, `check:runbooks`, `check:runtime-export`, and `check:safe-backlog`.
- Validate current runbooks avoid stale fixed supervisor test counts.
- Update README, fresh VM checklist, bootstrap guide, and current handoff orientation with the active verification chain.
- Include the runbook check in `pnpm run check`.
- Surface the runbook check in verification readiness, runtime evidence export references, browser assertions, and architecture tracking.

## Safety Boundary

This is documentation and static verification only. It does not approve:

- local provider or model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- network access,
- credential access.

## Acceptance Criteria

- `scripts/check-runbook-verification.mjs` fails when current runbooks omit active verification commands or retain stale fixed supervisor test counts.
- `pnpm run check:runbooks` is part of `pnpm run check`.
- Verification readiness lists the runbook check as required for runbook and verification command changes.
- Controls-page browser coverage asserts the runbook command is visible.
- Runtime evidence export references this story as git-backed evidence.
- `pnpm run check` passes.

## Verification

- `node --check scripts/check-runbook-verification.mjs`
- `pnpm run check:runbooks`
- `pnpm run check:docs`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "verification_readiness_report or runtime_evidence_export"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
