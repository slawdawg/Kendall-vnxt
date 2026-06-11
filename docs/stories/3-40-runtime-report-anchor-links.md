# Story 3.40: Runtime Report Anchor Links

Date: 2026-06-09
Status: done

## Goal

Make runtime evidence export related report entries use the same stable controls-page report anchors as the work-item evidence overview shortcuts.

## Scope

- Extract dashboard report endpoint-to-anchor mapping into a shared helper.
- Use the helper from both evidence overview report shortcuts and runtime evidence export related reports.
- Keep unknown endpoints falling back to the supervisor report catalog anchor.
- Extend dashboard detail browser assertions and static drift checks for the shared helper and runtime export links.
- Track the story in runtime evidence export git-backed evidence, story index, and architecture reconciliation.

## Safety Boundary

This is read-only navigation polish. It does not approve:

- local provider or model calls,
- subscription-agent process launch,
- premium execution,
- worker shell commands,
- worker source mutation,
- network access,
- credential access.

## Acceptance Criteria

- Related report links in the runtime evidence export panel use `/controls#...` anchors.
- Evidence overview and runtime export panels share the same report shortcut helper.
- Browser coverage asserts runtime export related report link targets.
- `pnpm run check:runtime-export` and `pnpm run check:reports` protect the shared mapping.
- `pnpm run check` passes.

## Verification

- `pnpm run check:runtime-export`
- `pnpm run check:reports`
- `pnpm run test:supervisor -- tests/integration/test_routing_preview.py -k "runtime_evidence_export"`
- `pnpm run test:e2e:dashboard:detail`
- `pnpm run check`
