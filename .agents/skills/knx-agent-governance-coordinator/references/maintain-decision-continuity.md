# Maintain Decision Continuity

## What Success Looks Like

Important governance decisions remain visible across sessions, and future workflows can discover the current state without relying on chat history.

## Use This When

- The user makes or changes a governance decision.
- A workflow produces a new artifact that changes routing.
- The session reaches a BMad phase boundary or should be continued later.
- A decision should be recorded as accepted, provisional, blocked, deferred, or superseded.

## Continuity Targets

Prefer shared module memory and handoffs:

- `{project-root}/_bmad/memory/knx/index.md`
- `{project-root}/_bmad/memory/knx/daily/YYYY-MM-DD.md`
- `{project-root}/_bmad/memory/knx/decisions/`
- `{project-root}/_bmad-output/handoffs/bmad-session-handoff.md`

Use the smallest update that preserves continuity. Do not create live runtime/deployment state while doing planning continuity work.

## Output Shape

When a record should be updated, state:

- What decision changed.
- Which file should carry it.
- Whether the decision is accepted, provisional, blocked, deferred, or superseded.
- The next workflow or artifact that depends on it.

If you update files directly, keep entries concise and source-linked.
