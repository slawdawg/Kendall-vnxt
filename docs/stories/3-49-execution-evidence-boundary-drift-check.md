# Story 3.49: Execution Evidence Boundary Drift Check

Date: 2026-06-09
Status: ready for review

## Goal

Add a dedicated static verification check for execution-state boundary and disabled-provider proof surfaces so queue/attempt separation and local-provider no-call evidence stay aligned across contracts, schemas, API routes, service construction, report catalog entries, browser assertions, supervisor assertions, runtime evidence, runbooks, and story evidence.

## Scope

- Add `pnpm run check:execution-evidence`.
- Include the check in full `pnpm run check`.
- Surface the command in the verification readiness report and controls-page browser coverage.
- Require the command in current runbooks and handoffs.
- Add Story 3.49 to runtime evidence export git-backed evidence.
- Refresh architecture status through Story 3.49.

## Safety Boundary

This is static drift coverage. It does not approve:

- worker execution,
- local provider or model calls,
- subscription-agent process launch,
- premium execution,
- arbitrary worker shell commands,
- worker source mutation,
- worker network access,
- credential access.

## Acceptance Criteria

- `package.json` defines `check:execution-evidence`.
- Full `pnpm run check` includes `pnpm run check:execution-evidence`.
- The drift check validates execution-state boundary and disabled-provider proof contracts, schemas, routes, service evidence, report catalog entries, browser assertions, supervisor assertions, runtime export references, runbook coverage, and architecture tracking.
- Verification readiness lists `pnpm run check:execution-evidence` as required.
- Current operator runbooks name the command in the active verification chain.
- Runtime evidence export references Story 3.49.
- `pnpm run check` passes.

## Verification

- `pnpm run check:execution-evidence`
- `pnpm run check:verification-readiness`
- `pnpm run check:runbooks`
- `pnpm run check:runtime-export`
- `pnpm run check:docs`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "disabled_provider_proofs or execution_state_boundary or verification_readiness or runtime_evidence_export"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
