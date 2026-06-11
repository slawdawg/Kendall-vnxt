# Story 3.20: Runtime Evidence Review Manifest

Date: 2026-06-08
Status: done

## Goal

Make each runtime evidence export easier to review by adding a read-only manifest with evidence counts, checklist items, retention notes, and authority stop lines.

## Scope

- Add a `reviewManifest` section to `RuntimeEvidenceExportView`.
- Include counts for attempts, workflow events, related reports, git-backed evidence, and excluded state.
- Add review checklist, retention notes, and stop lines to the export.
- Show the manifest on the work-item runtime evidence export dashboard panel.
- Cover the manifest in supervisor integration and dashboard e2e tests.

## Safety Boundary

This story is reporting-only. It does not approve local provider/model calls, launch subscription-agent processes, enable premium execution, run worker commands, mutate worker source, grant network access, or read credentials.

## Acceptance Criteria

- Runtime evidence exports include a read-only review manifest.
- The manifest counts match the export's attempts, events, report references, and git-backed evidence.
- The manifest explicitly states it is not execution-authority approval.
- The dashboard shows review manifest, checklist, retention notes, and stop lines.
- Reading the export remains non-mutating.
- Focused supervisor and dashboard e2e tests cover the new behavior.

## Verification

- `services\supervisor\.venv\Scripts\python.exe -m pytest services\supervisor\tests\integration\test_routing_preview.py -k runtime_evidence_export`
- `pnpm --filter @kendall/dashboard build`
- `pnpm run test:e2e:dashboard`
- `pnpm run check`
