---
baseline_commit: ab19e5a
---

# Story 1.15: Mock Local Read-Only Worker Adapter

Status: in-progress

## Story

As the Kendall_vNxt operator,
I want a mock local read-only worker adapter that consumes evidence packets,
so that the supervisor can prove the local AI worker boundary before connecting Ollama, LM Studio, vLLM, llama.cpp, or other model servers.

## Acceptance Criteria

1. The supervisor defines a mock local read-only worker adapter contract with worker id, run id, packet id, status, summary, recommendations, and safety flags.
2. The mock adapter consumes `LocalEvidencePacketView` and returns deterministic output without model calls.
3. The mock adapter cannot write files, run commands, read arbitrary repo files, or call external providers.
4. The supervisor exposes a read-only preview endpoint using existing API envelope conventions.
5. The worker registry reports the mock local read-only worker as online while real provider-backed local adapters remain disabled.
6. Integration tests prove deterministic output, registry health, and non-mutating behavior.
7. Shared TypeScript contracts are updated.

## Tasks / Subtasks

- [ ] Add mock local read-only worker contract. (AC: 1, 2, 3)
  - [ ] Define deterministic result view.
  - [ ] Add adapter that consumes evidence packets only.
- [ ] Add read-only preview endpoint. (AC: 4)
  - [ ] Expose `POST /work-items/{work_item_id}/local-readonly-worker-preview`.
  - [ ] Do not record workflow events by default.
- [ ] Update registry and shared contracts. (AC: 5, 7)
  - [ ] Mark `local.readonly.mock` online.
  - [ ] Keep real local provider adapters disabled/not configured.
- [ ] Add focused tests. (AC: 3, 6)
  - [ ] Assert deterministic mock output.
  - [ ] Assert registry health for mock local worker.
  - [ ] Assert no item/event mutation.
- [ ] Verify and update story trail. (AC: all)
  - [ ] Run focused tests.
  - [ ] Run broader workspace verification.
  - [ ] Update Dev Agent Record, File List, and Change Log.

## Dev Notes

Source artifacts:

- `docs/prds/supervisor-dynamic-routing-follow-on-roadmap.md`
- `docs/stories/1-14-local-readonly-evidence-packet-contract.md`

Implementation constraints:

- Do not connect real local model servers.
- Do not add OpenAI-compatible clients yet.
- Do not execute commands.
- Do not write files.
- Do not record workflow events by default.

Recommended design:

- Add `services/supervisor/src/supervisor/domain/local_readonly_worker.py`.
- Add `LocalReadonlyWorkerPreviewView`.
- Use the existing evidence packet endpoint/service helper as the boundary input.

## Dev Agent Record

### Implementation Plan

- Add deterministic mock adapter.
- Add service/route preview.
- Update worker registry and contracts.
- Verify focused and broad checks.

### Debug Log References

- Pending.

### Completion Notes List

- Pending.

### File List

- Pending.

## Change Log

- 2026-06-08: Created story from routing follow-on roadmap after Story 1.14 completion.

