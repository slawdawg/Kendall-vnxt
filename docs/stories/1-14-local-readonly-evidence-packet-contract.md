---
baseline_commit: 5d7cf2e
---

# Story 1.14: Local Read-Only Evidence Packet Contract

Status: in-progress

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

- [ ] Add evidence packet API contract. (AC: 1, 5, 6)
  - [ ] Define evidence packet and item view schemas.
  - [ ] Export shared TypeScript contracts.
- [ ] Add read-only packet generation. (AC: 2, 3, 4)
  - [ ] Generate packets from existing item, recipe, route, and events.
  - [ ] Include local-read-only boundaries and redaction notes.
  - [ ] Avoid model calls, commands, event recording, and workflow mutation.
- [ ] Add focused tests. (AC: 3, 7)
  - [ ] Assert packet shape for a recipe work item.
  - [ ] Assert repeated preview does not mutate item/events.
- [ ] Verify and update story trail. (AC: all)
  - [ ] Run focused tests.
  - [ ] Run broader workspace verification.
  - [ ] Update Dev Agent Record, File List, and Change Log.

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

- Pending.

### Completion Notes List

- Pending.

### File List

- Pending.

## Change Log

- 2026-06-08: Created story from routing follow-on roadmap after Story 1.13 completion.

