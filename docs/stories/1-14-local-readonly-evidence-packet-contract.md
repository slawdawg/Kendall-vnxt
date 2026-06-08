---
baseline_commit: 5d7cf2e
---

# Story 1.14: Local Read-Only Evidence Packet Contract

Status: done

## Story

As the Kendall_vNxt operator,
I want the supervisor to produce a structured read-only evidence packet for local AI explanation,
so that future local model adapters can receive bounded evidence without direct repo access, shell commands, secrets, or file-write authority.

## Acceptance Criteria

1. The supervisor defines an evidence packet contract with packet id, work item id, task kind, step id, route, summary, evidence items, boundaries, allowed paths, validation commands, and redaction notes.
2. Evidence packets are generated from existing work-item metadata, recipe data, and workflow events only.
3. Evidence packet generation is read-only and does not mutate work items, record events by default, run commands, call models, or launch workers.
4. The supervisor exposes an API endpoint for evidence packet preview using existing API envelope conventions.
5. Evidence packets include explicit local-read-only boundaries suitable for a future local AI adapter.
6. Shared TypeScript contracts are updated for the packet view.
7. Integration tests prove packet shape and non-mutating behavior.

## Tasks / Subtasks

- [x] Add evidence packet API contract. (AC: 1, 5, 6)
  - [x] Define evidence packet and item view schemas.
  - [x] Export shared TypeScript contracts.
- [x] Add read-only packet generation. (AC: 2, 3, 4)
  - [x] Generate packets from existing item, recipe, route, and events.
  - [x] Include local-read-only boundaries and redaction notes.
  - [x] Avoid model calls, commands, event recording, and workflow mutation.
- [x] Add focused tests. (AC: 3, 7)
  - [x] Assert packet shape for a recipe work item.
  - [x] Assert repeated preview does not mutate item/events.
- [x] Verify and update story trail. (AC: all)
  - [x] Run focused tests.
  - [x] Run broader workspace verification.
  - [x] Update Dev Agent Record, File List, and Change Log.

## Dev Notes

Source artifacts:

- `docs/prds/supervisor-dynamic-routing-follow-on-roadmap.md`
- `docs/stories/1-8-local-readonly-evidence-explanations.md`
- `docs/stories/1-12-worker-capability-health-registry.md`

Implementation constraints:

- Do not connect Ollama, LM Studio, vLLM, llama.cpp, or any OpenAI-compatible server.
- Do not add a mock local worker in this story.
- Do not read arbitrary files.
- Do not include secrets or raw prompts.
- Do not record workflow events by default.

Recommended design:

- Add `LocalEvidencePacketView` and `LocalEvidencePacketItemView`.
- Add endpoint `GET /work-items/{work_item_id}/local-evidence-packet`.
- Reuse routing preview with `TaskKind.EVIDENCE_SUMMARY` default.

## Dev Agent Record

### Implementation Plan

- Add schemas/contracts.
- Add service helper and route.
- Add non-mutating integration coverage.
- Verify focused and broad checks.

### Debug Log References

- Focused: `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q -k "local_evidence_packet"` passed, 1 test.
- Routing integration: `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q` passed, 26 tests.
- Workspace check: `pnpm run check` passed; dashboard build succeeded and supervisor tests passed, 59 tests, 1 aiosqlite warning.

### Completion Notes List

- Added `LocalEvidencePacketView` and evidence packet item contracts in Python and TypeScript.
- Added read-only `GET /work-items/{work_item_id}/local-evidence-packet` endpoint.
- Generated packets from work item metadata, recipe allowed paths/validation commands, route preview, and existing workflow event summaries only.
- Included local-read-only boundaries, redaction notes, and explicit no-write/no-command flags for future local AI adapter use.

### File List

- `docs/stories/1-14-local-readonly-evidence-packet-contract.md`
- `_bmad-output/implementation-artifacts/1-14-local-readonly-evidence-packet-contract.md`
- `packages/contracts/src/api.ts`
- `services/supervisor/src/supervisor/api/main.py`
- `services/supervisor/src/supervisor/api/schemas.py`
- `services/supervisor/src/supervisor/application/service.py`
- `services/supervisor/tests/integration/test_routing_preview.py`

## Change Log

- 2026-06-08: Created story from routing follow-on roadmap after Story 1.13 completion.
- 2026-06-08: Implemented local read-only evidence packet contract; status moved to done.

