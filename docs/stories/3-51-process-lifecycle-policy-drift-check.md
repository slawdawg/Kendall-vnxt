# Story 3.51: Process Lifecycle Policy Drift Check

Date: 2026-06-09
Status: done

## Goal

Add a dedicated static verification check for the future process lifecycle design so subscription-agent launch planning, execution attempt lifecycle states, disabled process-launch safety flags, runtime evidence references, and stop lines stay aligned before any process launch authority is considered.

## Scope

- Add `pnpm run check:process-lifecycle`.
- Include the check in full `pnpm run check`.
- Surface the command in the verification readiness report and controls-page browser coverage.
- Require the command in current runbooks and handoffs.
- Add Story 3.51 to runtime evidence export git-backed evidence.
- Refresh architecture status through Story 3.51.

## Safety Boundary

This is static drift coverage. It does not approve:

- subscription-agent process launch,
- local provider or model calls,
- premium execution,
- arbitrary worker shell commands,
- worker source mutation,
- worker network access,
- credential access.

## Acceptance Criteria

- `package.json` defines `check:process-lifecycle`.
- Full `pnpm run check` includes `pnpm run check:process-lifecycle`.
- The drift check validates process lifecycle design, execution attempt lifecycle states, model/schema fields, disabled process-launch event evidence, runtime export references, runbook coverage, and architecture tracking.
- Verification readiness lists `pnpm run check:process-lifecycle` as required.
- Current operator runbooks name the command in the active verification chain.
- Runtime evidence export references Story 3.51.
- `pnpm run check` passes.

## Verification

- `pnpm run check:process-lifecycle`
- `pnpm run check:verification-readiness`
- `pnpm run check:runbooks`
- `pnpm run check:runtime-export`
- `pnpm run check:docs`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "execution_attempt_lifecycle or execution_attempt_approval or verification_readiness or runtime_evidence_export"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
