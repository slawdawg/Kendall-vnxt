# Legacy dashboard fixture and fallback audit

Date: 2026-07-17  
Lane: `20260717-audit-legacy-dashboard-fixtures-and-fallback-pat`

## Decision

This audit found no fixture or fallback path that is safe to retire in this
slice. No compatibility route, fallback branch, fixture catalog, or supervisor
endpoint was removed. The paths below remain intentionally bounded and have
current test or runtime-contract evidence.

## Inventory and evidence

| Path | Current use | Decision |
| --- | --- | --- |
| `apps/dashboard/src/lib/pipeline-fixtures.ts` | Imported by `/pipeline/demo` and `/pipeline/demo/packets/[packetId]`. The demo is the explicit fixture catalog; normal `/pipeline` is tested to avoid this import. | Retain. Removing it would break the supported demo and its fixture-only contract. |
| `apps/dashboard/src/lib/pipeline-evidence-source.ts` | Compiled and exercised by `tests/dashboard-pipeline-fixtures.test.mjs` as the metadata-only evidence-source contract. It is not a normal `/pipeline` fixture fallback. | Retain. No replacement contract or proof of dead code exists. |
| Canonical-first runtime reads in `apps/dashboard/src/lib/pipeline-supervisor-runtime.ts` | Requests `/pipeline-control-plane/work-packets` first, then uses the guarded legacy `/work-packets` read for compatibility. Loader tests cover canonical success, legacy fallback, malformed payloads, and safe packet IDs. | Retain until all supported supervisor consumers are canonical-only. |
| Legacy `/work-packets` and `/work-packets/{packet_id}/learn-follow-up-candidate-work` routes | `services/supervisor/tests/integration/test_work_packets.py` and `services/supervisor/tests/integration/test_routing_preview.py` exercise legacy reads and follow-up mutation behavior. Source-intake adapter tests exercise legacy reads; they are not mutation evidence. | Retain. These are compatibility/API paths, not fixture-only code. |
| Legacy route entries in `apps/dashboard/scripts/dashboard-supervisor-proxy.mjs` | Proxy tests exercise canonical and legacy base read/mutation allowlists and authentication forwarding. The follow-up subresource allowlist is source-reviewed but has no direct proxy test in this slice. | Retain with the compatibility routes; add a direct subresource proxy regression test before any retirement. |
| `legacySignInPage` in `apps/dashboard/scripts/secure-dashboard-runtime.mjs` | Legacy sign-in rendering compatibility. It is outside the fixture/fallback surface audited here. | No change in this slice. |

## Verification evidence

The inventory was checked with targeted source searches for
`pipeline-fixtures`, `pipeline-evidence-source`, `requestLegacyJson`,
`/work-packets`, `learn-follow-up-candidate-work`, and `legacySignInPage`.
The source-level contract tests specifically prove that normal `/pipeline`
rendering does not reach fixture data while the demo routes do.

Reproducible checks for this audit all passed:

```text
rg -n "pipeline-fixtures|pipeline-evidence-source|requestLegacyJson|/work-packets|learn-follow-up-candidate-work|legacySignInPage" apps/dashboard/src apps/dashboard/scripts services/supervisor/src services/supervisor/tests tests
pnpm run test:dashboard-pipeline-loader
pnpm run test:dashboard-pipeline-fixtures
pnpm run check:dashboard-pipeline-boundary
node --test apps/dashboard/scripts/dashboard-supervisor-proxy.test.mjs
pnpm run check:docs
pnpm run check:runbooks
pnpm run check:static
```

The fixture, proxy, auth-runtime, and full static commands were rerun outside
the Codex sandbox because their child-process or Unix-socket listeners are
blocked by the managed sandbox; no source or test skip was used. The complete
static run and focused checks passed on this lane. No separate evidence payload
is retained; this document records the bounded commands and result only.

## Revisit triggers

Re-audit before removal when the repository and deployed-client inventory shows
no supported legacy callers, the follow-up mutation has a canonical replacement
and migrated callers (including a direct proxy regression test), and the
metadata-only evidence source has a replacement contract with equivalent test
coverage. Any retirement should preserve the explicit `/pipeline/demo` boundary
unless that route is deliberately removed as a product decision.
