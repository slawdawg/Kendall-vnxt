# Story 3.38: Runbook Managed Recipe Check Chain

Date: 2026-06-09
Status: done

## Goal

Keep current operator runbooks and handoffs aligned after managed recipe policy drift checks entered the full verification chain.

## Scope

- Strengthen `pnpm run check:runbooks` so current runbooks must mention `pnpm run check:managed-recipes`.
- Update README, fresh VM acceptance checklist, bootstrap guide, current handoff, and date-specific handoff with the active verification chain.
- Update verification readiness full-check evidence to name managed recipe policy drift checks.
- Surface this story in safe backlog evidence, runtime evidence export git-backed evidence, story index, and architecture tracking.

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

- `scripts/check-runbook-verification.mjs` fails when current runbooks omit `pnpm run check:managed-recipes`.
- Current operator runbooks name the full active check chain including `check:managed-recipes`.
- Verification readiness full-check evidence names managed recipe policy drift checks.
- Runtime evidence export and safe backlog verification evidence reference this story.
- `pnpm run check` passes.

## Verification

- `node --check scripts/check-runbook-verification.mjs`
- `pnpm run check:runbooks`
- `pnpm run check:docs`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "safe_development_backlog or runtime_evidence_export"`
- `pnpm run check`
