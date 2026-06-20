# Implementation Checkpoint: Supervisor Dynamic Routing Follow-On

Date: 2026-06-08
Branch: main
Remote sync: origin/main synced with HEAD at `e5ac648` before this handoff artifact was created.

## Scope

This checkpoint covers the Kendall_vNxt supervisor dynamic-routing follow-on work after the MVP routing preview/dashboard base. The work stayed inside the existing Kendall_vNxt supervisor and dashboard; it did not create a separate personal supervisor product or a second orchestrator.

## Completed Slices

- Story 1.11: Guarded utility worker adapter contract.
- Story 1.12: Worker capability and health registry.
- Story 1.13: Routing outcome evidence for guarded attempts.
- Story 1.14: Local read-only evidence packet contract.
- Story 1.15: Mock local read-only worker adapter.
- Story 1.16: Disabled OpenAI-compatible local worker adapter entries.
- Story 1.17: Subscription handoff template hardening.
- Story 1.18: Premium approval request artifacts.
- Story 1.19: Compact routing fleet panel.
- Story 1.20: Disabled subscription-agent launch stub.

## Capability State

The supervisor can now:

- Route deterministic guarded utility work through an internal allowlisted utility adapter.
- Record structured route outcome evidence for guarded attempts.
- Expose a static provider-neutral worker registry with real and disabled/future worker entries.
- Produce local read-only evidence packets and deterministic mock local worker previews without model calls.
- Represent Ollama, LM Studio, vLLM, and llama.cpp as disabled OpenAI-compatible local workers with no HTTP/model calls.
- Produce safer subscription handoff packages with task-kind-specific constraints and expected output guidance.
- Produce premium approval request artifacts with approval checklist, required evidence, risk controls, and `executionAllowed: false`.
- Show a compact read-only Routing Fleet panel on the controls page using real registry and lane-profile data.
- Produce disabled subscription-agent launch stubs with estimates, instructions, required approvals, `processLaunchAllowed: false`, and no CLI/process launch.

## Safety Boundaries Preserved

- No local model server was contacted.
- No Codex, Claude, Gemini, Antigravity, or subscription CLI agent was launched.
- No premium provider execution was added.
- No credentials are required by the new tests or endpoints.
- New provider/agent/local integrations are disabled or mock/read-only by default.
- Artifact endpoints are non-mutating by default and record events only when `recordEvent` is explicitly true.
- Direct process launch remains deferred until workspace isolation, approval, logging, cancellation, and lifecycle controls are designed and tested.

## Verification Snapshot

Latest broad verification commands during the final implementation slices:

- Story 1.17: `pnpm run check` - passed, dashboard build plus 61 supervisor tests.
- Story 1.18: `pnpm run check` - passed, dashboard build plus 64 supervisor tests.
- Story 1.19: `pnpm exec playwright test tests/e2e/dashboard.spec.ts -g "shows compact routing fleet data on controls"` - passed, 1 test.
- Story 1.19: `pnpm run check` - passed, dashboard build plus 64 supervisor tests.
- Story 1.20: `uv run --directory services/supervisor pytest tests/integration/test_routing_preview.py -q` - passed, 34 tests.
- Story 1.20: `pnpm run check` - passed, dashboard build plus 67 supervisor tests.

## Checkpoint Commits

- `f45848d` Add guarded utility worker adapter story
- `b48c523` Add guarded utility worker adapter
- `59a0e83` Add worker registry story
- `71cba10` Add worker capability registry
- `c5fbf54` Add routing outcome evidence story
- `5d7cf2e` Record routing outcomes for guarded attempts
- `aacd9da` Add local evidence packet story
- `ab19e5a` Add local evidence packet contract
- `979a3b8` Add mock local readonly worker story
- `5479270` Add mock local readonly worker
- `9e38f9a` Add disabled local provider worker story
- `1c29b12` Add disabled local provider workers
- `81fac2b` Add subscription handoff hardening story
- `8679bd6` Harden subscription handoff templates
- `0e47200` Add premium approval request story
- `9a185ed` Add premium approval request artifacts
- `d05ee65` Add compact routing fleet panel story
- `0b7c2c2` Add compact routing fleet panel
- `7412e2d` Add disabled subscription agent stub story
- `e5ac648` Add disabled subscription agent launch stub

## Remaining Work

Implementation-ready routing work from the current roadmap is exhausted. The remaining items are intentionally deferred:

- Direct subscription-agent launch: blocked by required process lifecycle, workspace isolation, approval, logging, cancellation, and rollback controls.
- Direct local model/provider calls: deferred until explicit enablement policy, endpoint health probing, credential/secret boundary, timeout, and test fixtures exist.
- Premium execution: deferred until explicit operator approval flow and provider execution boundary are designed.
- Adaptive scoring: deferred until enough auditable outcome evidence accumulates across real routed attempts.

## Recommended Next Step

Treat dynamic routing as ready for review and operational observation. The next product-safe move is not more execution authority; it is review of the new contracts and event trails, followed by a separate PRD/story set for process lifecycle and cancellation controls if direct agent launch becomes the next approved goal.
