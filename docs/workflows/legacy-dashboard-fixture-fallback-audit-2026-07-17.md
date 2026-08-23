# Legacy dashboard fixture and fallback audit

Date: 2026-07-17  
Lane: `20260717-audit-legacy-dashboard-fixtures-and-fallback-pat`

## Decision

The initial inventory is superseded for the legacy WorkPacket HTTP reads: the
normal dashboard is canonical-only, the legacy list/detail API and transport
admissions are retired, and explicit source-zero/404/deny coverage records the
change. The demo fixture catalog remains intentionally bounded.

## Inventory and evidence

| Path | Current use | Decision |
| --- | --- | --- |
| `apps/dashboard/src/lib/pipeline-fixtures.ts` | Imported by `/pipeline/demo` and `/pipeline/demo/packets/[packetId]`. The demo is the explicit fixture catalog; normal `/pipeline` is tested to avoid this import. | Retain. Removing it would break the supported demo and its fixture-only contract. |
| `apps/dashboard/src/lib/pipeline-evidence-source.ts` | Compiled and exercised by `tests/dashboard-pipeline-fixtures.test.mjs` as the metadata-only evidence-source contract. It is not a normal `/pipeline` fixture fallback. | Retain. No replacement contract or proof of dead code exists. |
| Canonical runtime reads in `apps/dashboard/src/lib/pipeline-supervisor-runtime.ts` | Requests versioned `/pipeline-control-plane/work-packets`; no `/work-packets` fallback remains. Loader tests cover canonical success, malformed payloads, and safe packet IDs. | Retain as the normal canonical boundary. |
| Legacy `/work-packets` routes | Removed. The restart-backed mixed-data test proves native WorkItem/CandidateWork and canonical packet readbacks while both removed GET forms return 404. | Do not reintroduce a synthetic read route; internal V0 projection retirement is a separate later dependency. |
| Legacy route entries in `apps/dashboard/scripts/dashboard-supervisor-proxy.mjs` | Removed from operator and test-viewer read admissions. Proxy tests prove legacy list/detail attempts return 404 without supervisor forwarding. | Keep exact deny coverage. |
| `legacySignInPage` in `apps/dashboard/scripts/secure-dashboard-runtime.mjs` | Legacy sign-in rendering compatibility. It is outside the fixture/fallback surface audited here. | No change in this slice. |

## Verification evidence

The inventory was checked with targeted source searches for
`pipeline-fixtures`, `pipeline-evidence-source`, `requestLegacyJson`,
`/work-packets` and `legacySignInPage`.
The source-level contract tests specifically prove that normal `/pipeline`
rendering does not reach fixture data while the demo routes do.

Reproducible checks for this audit all passed:

```text
rg -n "pipeline-fixtures|pipeline-evidence-source|requestLegacyJson|/work-packets|legacySignInPage" apps/dashboard/src apps/dashboard/scripts services/supervisor/src services/supervisor/tests tests
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

Re-audit before removing the remaining internal V0 projector/fixture holds.
Any later retirement must preserve the explicit `/pipeline/demo` boundary unless
that route is deliberately removed as a product decision.
