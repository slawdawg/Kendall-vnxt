# Story 3.35: Runbook Check Chain Hardening

Date: 2026-06-09
Status: ready for review

## Goal

Keep current operator runbooks aligned with the full active verification chain, including newer runtime evidence export and safe backlog drift checks.

## Scope

- Strengthen `pnpm run check:runbooks` so current runbooks must mention `pnpm run check:runbooks`, `pnpm run check:runtime-export`, and `pnpm run check:safe-backlog`.
- Update README, fresh VM acceptance checklist, bootstrap guide, current handoff, and date-specific handoff with the full verification chain.
- Keep stale fixed supervisor test count protection.
- Surface this story in safe backlog evidence, runtime evidence export git-backed evidence, and architecture tracking.

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

- `scripts/check-runbook-verification.mjs` fails when current runbooks omit `pnpm run check:runbooks`, `pnpm run check:runtime-export`, or `pnpm run check:safe-backlog`.
- Current operator runbooks name the full active check chain.
- `pnpm run check:runbooks` remains part of `pnpm run check`.
- Runtime evidence export references this story as git-backed evidence.
- `pnpm run check` passes.

## Verification

- `node --check scripts/check-runbook-verification.mjs`
- `pnpm run check:runbooks`
- `pnpm run check:docs`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "safe_development_backlog or runtime_evidence_export"`
- `pnpm run check`
