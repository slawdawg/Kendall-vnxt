---
story: "1.14"
title: "Local Read-Only Evidence Packet Contract"
status: done
completed: 2026-06-08
---

# Story 1.14: Local Read-Only Evidence Packet Contract

## Summary

Implemented a structured read-only evidence packet contract for future local AI explanation. The supervisor can now preview bounded evidence packets without giving local model adapters direct repo access, shell execution, file writes, secrets, or provider credentials.

## Scope Completed

- Added `LocalEvidencePacketView` and `LocalEvidencePacketItemView`.
- Added shared TypeScript contracts.
- Added `GET /work-items/{work_item_id}/local-evidence-packet`.
- Built packets from:
  - work item metadata
  - deterministic route preview
  - recipe allowed paths
  - recipe validation commands
  - existing workflow event summaries
- Added local-read-only boundaries and redaction notes.
- Added non-mutating integration coverage.

## Safety Boundaries

- No local model connection.
- No external command execution.
- No file reads beyond existing metadata/events.
- No workflow event recording by default.
- No work-item mutation.
- No secrets or raw prompts in the packet contract.

## Verification

- Focused: `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k "local_evidence_packet"` passed, 1 test.
- Routing integration: `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q` passed, 26 tests.
- Workspace check: `pnpm run check` passed. Dashboard build succeeded and supervisor tests passed, 59 tests, 1 aiosqlite warning.

## Files Changed

- `docs/stories/1-14-local-readonly-evidence-packet-contract.md`
- `_bmad-output/implementation-artifacts/1-14-local-readonly-evidence-packet-contract.md`
- `packages/contracts/src/api.ts`
- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

