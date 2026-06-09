# Story 3.53: Authority Readiness Matrix Report

Date: 2026-06-09
Status: ready for review

## Goal

Add a read-only authority readiness matrix that maps each blocked execution-authority family to required approvals, evidence, blocked stories, related reports, dashboard anchors, and stop lines before any real worker authority can be enabled.

## Scope

- Add `GET /supervisor/authority-readiness-matrix-report`.
- Add shared contracts, supervisor schemas, and service construction for authority readiness families.
- Render the matrix on the controls page.
- Add report catalog, runtime evidence export, report-shortcut, supervisor test, browser test, and static drift-check coverage.
- Add `pnpm run check:authority-readiness` to the full verification chain.

## Safety Boundary

This is read-only governance and evidence navigation. It does not approve:

- local or remote provider/model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- worker network access,
- credential access,
- worker remote delivery automation.

## Acceptance Criteria

- The API exposes `authority-readiness-matrix-report-v1` without mutating work items or workflow events.
- The report includes local provider execution, subscription-agent launch, premium execution, worker command/source/network/credential authority, and remote delivery automation families.
- The report preserves blocked Ollama and subscription-agent story references.
- The controls page renders authority families, readiness ladder, stop lines, and next safe actions.
- Runtime evidence export and report catalog include the new report.
- Verification readiness lists `pnpm run check:authority-readiness`.
- Full `pnpm run check` includes the new static drift check.

## Verification

- `pnpm run check:authority-readiness`
- `pnpm run check:verification-readiness`
- `pnpm run check:reports`
- `pnpm run check:runtime-export`
- `pnpm run check:docs`
- `pnpm run check:runbooks`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "authority_readiness or supervisor_report_catalog or verification_readiness or runtime_evidence_export"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
