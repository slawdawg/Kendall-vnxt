# Story 3.43: Safe Delivery Hygiene

Date: 2026-06-09
Status: ready for review

## Goal

Fold GitHub delivery posture into the safe development backlog so future work uses larger coherent PR slices, Git/GCM or the Codex GitHub connector, and explicit plaintext-token stop lines before remote work depends on it.

## Scope

- Add a ready safe backlog item for GitHub delivery hygiene.
- Reference the GitHub workflow policy report from the safe backlog item.
- Keep runtime evidence export git-backed evidence aligned with this story.
- Extend static safe-backlog drift checks, supervisor integration coverage, and controls-page browser assertions.
- Refresh architecture status so current guidance is aligned through Story 3.43.

## Safety Boundary

This is read-only delivery guidance and drift coverage. It does not approve:

- local provider or model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- network access from workers,
- credential access,
- plaintext GitHub CLI token storage,
- arbitrary remote automation.

## Acceptance Criteria

- The safe backlog includes `github-delivery-hygiene` as a ready large slice item.
- The item references `GET /supervisor/github-workflow-policy-report`, `docs/github-connector-workflow.md`, Story 3.42, and Story 3.43.
- The item states future PRs should be larger coherent slices and should avoid persistent plaintext `gh` token storage.
- Runtime evidence export includes Story 3.43 in git-backed evidence.
- Static safe-backlog drift checks require the new item and delivery-hygiene stop-line text.
- Supervisor and dashboard e2e tests assert the new guidance.
- `pnpm run check` passes.

## Verification

- `pnpm run check:safe-backlog`
- `pnpm run check:runtime-export`
- `pnpm run check:docs`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "safe_development_backlog or runtime_evidence_export"`
- `pnpm run test:e2e:dashboard:controls`
- `pnpm run check`
