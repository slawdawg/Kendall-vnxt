# Story 3.42: GitHub Workflow Policy Report

Date: 2026-06-09
Status: ready for review

## Goal

Add a read-only supervisor report that surfaces the supported GitHub delivery workflow: Git/GCM for Git remotes, the Codex GitHub connector for PR automation, optional local `gh` auth only when a workflow explicitly shells out to `gh`, and plaintext-token stop lines.

## Scope

- Add `GET /supervisor/github-workflow-policy-report`.
- Add shared contract and supervisor schema types for the report.
- Render the report on the controls page.
- Add the report to the supervisor report catalog and runtime evidence export references.
- Extend report catalog drift checks, runtime export checks, supervisor integration tests, and controls-page browser coverage.
- Refresh architecture status so the GitHub workflow policy is part of the current safe-work state.

## Safety Boundary

This is read-only policy visibility. It does not approve:

- local provider or model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- network access,
- credential access,
- plaintext GitHub CLI token storage,
- arbitrary remote automation.

## Acceptance Criteria

- The report documents Git/GCM, Codex GitHub connector, and optional local `gh` auth posture.
- The report lists `pnpm run doctor:github`, `pnpm run doctor:github -- --remote`, and the connector probe as required evidence paths.
- The report states plaintext GitHub CLI token storage remains blocked.
- Reading the report does not mutate work-item events.
- The controls page renders the report and report catalog references its endpoint.
- Runtime evidence export references the report endpoint and Story 3.42.
- `pnpm run check` passes.

## Verification

- `pnpm run check:reports`
- `pnpm run check:runtime-export`
- `pnpm run check:docs`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "report_catalog or runtime_evidence_export or github_workflow_policy_report"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
