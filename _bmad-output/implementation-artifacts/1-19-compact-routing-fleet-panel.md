# Implementation Artifact: Story 1.19 Compact Routing Fleet Panel

Date: 2026-06-08
Baseline: 9a185ed

## Summary

The controls page now includes a compact read-only Routing Fleet panel backed by actual supervisor registry and lane-profile endpoints. It shows worker health/disabled state and lane evidence counts without adding worker launches, provider probes, policy mutation, or override controls.

## Safety Boundaries

- Dashboard-only read path; no POSTs or mutation controls were added.
- Uses existing `GET /routing/worker-registry` and `GET /routing/lane-profiles` endpoints.
- Does not probe Ollama, LM Studio, vLLM, llama.cpp, subscription agents, or premium providers.
- Keeps fleet visibility supportive to supervisor controls rather than product-centered.

## Verification

- `pnpm -C C:\Users\slaw_dawg\Kendall_Nxt --filter @kendall/dashboard build` - passed after fixing a missing type import caught by the first run.
- `pnpm -C C:\Users\slaw_dawg\Kendall_Nxt exec playwright test tests/e2e/dashboard.spec.ts -g "shows compact routing fleet data on controls"` - passed, 1 test.
- `pnpm -C C:\Users\slaw_dawg\Kendall_Nxt run check` - passed, dashboard build plus 64 supervisor tests, 1 existing aiosqlite warning.
