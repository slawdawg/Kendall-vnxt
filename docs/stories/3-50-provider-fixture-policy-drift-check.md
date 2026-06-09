# Story 3.50: Provider Fixture Policy Drift Check

Date: 2026-06-09
Status: ready for review

## Goal

Add a dedicated static verification check for disabled local-provider fixtures so Ollama, LM Studio, vLLM, and llama.cpp remain no-call providers with documented endpoint, redaction, timeout, cancellation, and retention evidence before any future provider PRD can request enablement.

## Scope

- Add `pnpm run check:provider-fixtures`.
- Include the check in full `pnpm run check`.
- Surface the command in the verification readiness report and controls-page browser coverage.
- Require the command in current runbooks and handoffs.
- Add Story 3.50 to runtime evidence export git-backed evidence.
- Refresh architecture status through Story 3.50.

## Safety Boundary

This is static drift coverage. It does not approve:

- local provider or model calls,
- worker execution,
- subscription-agent process launch,
- premium execution,
- arbitrary worker shell commands,
- worker source mutation,
- worker network access,
- credential access.

## Acceptance Criteria

- `package.json` defines `check:provider-fixtures`.
- Full `pnpm run check` includes `pnpm run check:provider-fixtures`.
- The drift check validates disabled provider adapter fixtures, worker registry entries, no-call proof tests, architecture policy, runtime export references, runbook coverage, and architecture tracking.
- Verification readiness lists `pnpm run check:provider-fixtures` as required.
- Current operator runbooks name the command in the active verification chain.
- Runtime evidence export references Story 3.50.
- `pnpm run check` passes.

## Verification

- `pnpm run check:provider-fixtures`
- `pnpm run check:verification-readiness`
- `pnpm run check:runbooks`
- `pnpm run check:runtime-export`
- `pnpm run check:docs`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "worker_registry or disabled_provider_proofs or verification_readiness or runtime_evidence_export"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
