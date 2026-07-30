# Live Lane Clarity Dogfood

This is a disposable, integrated-local proof that a coherent manager Lane
Clarity summary reaches the supervisor receipt store and the production
`/pipeline` card. It is not a production-observed claim and grants no action,
worker, provider, delivery, cleanup, or tracker authority.
Providers remain disabled throughout the proof.

## Automated feature-lane proof

Run the source-owned proof from a prepared checkout:

```bash
node ./scripts/lane-clarity-live-dogfood.mjs
```

It reserves the explicit feature-lane dashboard port `3102` and loopback
supervisor ports `8113`/`8114`. If any is occupied, stop the conflicting
feature-lane process and rerun; do not silently choose another port. The proof
starts disposable local processes and SQLite files, posts through the normal
manager run-loop with `--lane-clarity-supervisor-url`, verifies the exact
supervisor readback and projection, and removes its runtime state afterwards.

The browser matrix is Windows desktop Chromium plus WebKit approximations of
iPad Pro 2nd gen Safari/iOS 26 and iPhone 15 Pro Max Safari/iOS 27. WebKit is
an approximation, not real iOS hardware coverage. A missing WebKit browser is
a blocker; install the configured Playwright browser rather than silently
reducing coverage.

## Main cockpit operator check

The main cockpit remains on port `3000`. Start the local supervisor first, then
the dashboard using the normal development workflow, and open
`http://localhost:3000/pipeline`. Configure an explicit loopback Lane Clarity
URL only for the manager cycle being observed. Do not start a second main
dashboard on a nearby port.

## Expected and fail-closed results

On success, the supervisor exact receipt and its active projection have one
matching run, watermark, cursor, and Lane Clarity record. The rendered card
shows **Lane Clarity**, the source goal, criterion evidence, and **On scope**.

The harness also submits a stale summary to a fresh disposable supervisor. It
must retain a local `coherent_lane_clarity_unavailable` receipt, return
`activeManagerLaneClarity: null`, and render no Lane Clarity card. That absent
card is fail-closed truth, never a browser reconstruction or fixture fallback.

If the card is absent unexpectedly, inspect the manager cycle's bounded
`laneClarityHandoff` receipt and the supervisor projection. Correct only the
explicit loopback configuration or the upstream current canonical summary, then
run the next normal manager cycle. Do not edit the supervisor database, invoke
a parallel runner, add a dashboard control, or use a provider.
