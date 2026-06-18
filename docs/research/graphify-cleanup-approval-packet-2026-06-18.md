# Graphify Cleanup Approval Packet

Date: 2026-06-18
Status: draft cleanup approval packet, not approved for execution

## Purpose

Define optional cleanup after Bob approved stopping technical Graphify runs and
preserving evidence.

This packet does not approve cleanup until Bob explicitly approves it.

## Current Retained State

Graphify tool state:

- `graphifyy==0.8.41` was installed with `uv tool install graphifyy`.
- Installed executables included `graphify` and `graphify-mcp`.

Temporary trial output state:

- `/tmp/kendall-nxt-graphify-trial-1`
- `/tmp/kendall-nxt-graphify-trial-2`
- `/tmp/kendall-nxt-graphify-workflow-2`
- `/tmp/kendall-nxt-graphify-workflow-3`

Repo evidence state:

- Evidence summaries were written under `docs/research/`.
- No `graphify-out/` output was written into the repo.
- No Graphify assistant install, hooks, MCP serving, HTTP serving, or
  provider-backed extraction was performed.

## Cleanup Options

### Option A: Preserve Everything

Do nothing.

Pros:

- Keeps raw `/tmp` graph outputs available for inspection.
- Keeps Graphify installed for a future approved trial.

Cons:

- Leaves temporary generated outputs on disk.
- Leaves the uv tool installed.

### Option B: Remove Temporary Trial Outputs Only

Remove:

```text
/tmp/kendall-nxt-graphify-trial-1
/tmp/kendall-nxt-graphify-trial-2
/tmp/kendall-nxt-graphify-workflow-2
/tmp/kendall-nxt-graphify-workflow-3
```

Pros:

- Cleans generated trial outputs.
- Keeps the installed tool for later approved use.
- Repo evidence remains preserved in `docs/research/`.

Cons:

- Raw graph JSON/report outputs are no longer available unless regenerated.

### Option C: Uninstall Graphify Tool Only

Run:

```bash
uv tool uninstall graphifyy
```

Pros:

- Removes the installed Graphify tool.
- Leaves `/tmp` outputs available for inspection.

Cons:

- Future Graphify trials require reinstall approval.

### Option D: Full Local Cleanup

Remove temporary trial outputs and uninstall the uv tool.

Commands:

```bash
rm -rf /tmp/kendall-nxt-graphify-trial-1 /tmp/kendall-nxt-graphify-trial-2 /tmp/kendall-nxt-graphify-workflow-2 /tmp/kendall-nxt-graphify-workflow-3
```

```bash
uv tool uninstall graphifyy
```

Pros:

- Returns local machine closest to pre-trial tool/output state.
- Keeps only repo evidence summaries.

Cons:

- Raw graph outputs are deleted.
- Future Graphify trials require reinstall and regeneration.

## Recommended Cleanup Choice

Choose **Option B: remove temporary trial outputs only** if Bob is satisfied
with the repo evidence summaries and wants to reduce local clutter.

Choose **Option A: preserve everything** if Bob may want to inspect raw
`GRAPH_REPORT.md` or `graph.json` outputs again before deciding on future
trials.

Do not uninstall Graphify unless Bob wants to avoid retained local tool state.

## Stop Lines

Stop before cleanup if:

- Bob wants raw `/tmp` graph outputs preserved.
- Bob wants a copy of raw outputs converted into a reviewed evidence artifact.
- A cleanup command would touch anything outside the listed `/tmp` paths.
- `uv tool uninstall graphifyy` reports unexpected package/tool state.

## Approval Request Template

```text
Graphify Cleanup Approval

Approved option:
- A preserve everything / B remove temp outputs / C uninstall tool / D full cleanup

Approved paths:
- /tmp/kendall-nxt-graphify-trial-1
- /tmp/kendall-nxt-graphify-trial-2
- /tmp/kendall-nxt-graphify-workflow-2
- /tmp/kendall-nxt-graphify-workflow-3

Approved uninstall:
- yes/no for `uv tool uninstall graphifyy`
```
