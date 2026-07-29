# Pipeline Lane Clarity

## Purpose

The read-only **Lane Clarity** panel in the `/pipeline` Manager Execution Lane
shows the current metadata-only clarity record for the selected manager lane.
It helps an operator see the source goal, criterion evidence, canonical state,
next safe gate, and drift posture without creating a second work tracker.

## Prerequisites and startup

Start the dashboard and its configured supervisor projection using the normal
local development workflow:

```bash
pnpm run dev:dashboard
```

Open `http://localhost:3000/pipeline`. The panel appears only when the
production projection includes a non-null
`activeManagerLaneClarity` record. It intentionally does not substitute a demo
fixture or infer a record in the browser, so an absent panel is the truthful
result when no coherent current record has been handed off.

## Reading the panel

- **Source goal** and **source ref** identify the manager-owned goal being
  represented.
- **Criteria and evidence** retain their source order and show the supporting
  metadata references.
- **Canonical state** and **next safe gate** describe the current execution
  boundary; they do not grant an action.
- **On scope** means the manager supplied current coherent metadata.
- **Pivot required** means the manager supplied a qualified current drift event
  and its decision/evidence references.
- **Not assessed** means the record was absent, stale, malformed, cross-run, or
  otherwise not qualified. Treat the supplied recovery text as the next
  non-mutating inspection step.

## Recovery and boundaries

If the panel is absent or shows **Not assessed**, inspect the manager-to-
supervisor loopback receipt and the bounded evidence references; do not use the
browser to reconstruct posture or modify a lane. A valid handoff binds one
selected lane, run, watermark, and cursor, then has a matching supervisor GET
readback. Re-submit only a newer coherent snapshot if it is stale; do not edit
the supervisor database. The dashboard has no Lane Clarity controls,
persistence, worker launch, delivery, cleanup, provider, or tracker authority.

The canonical record, allowed posture values, freshness requirements, and
loopback recovery boundary are defined in
[Manager Lane Clarity Projection Boundary](../architecture/manager-lane-clarity-projection-boundary.md).
The `/pipeline/demo` route remains a separate fixture surface and is not
production evidence.
