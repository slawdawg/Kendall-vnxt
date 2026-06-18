# Graphify Workflow 3 Evidence

Date: 2026-06-18
Status: completed within approved multi-file code-only boundary

## Approval Scope

Bob approved the Workflow 3 bounded run from
`docs/research/graphify-workflow-3-approval-packet.md`.

Approved scope:

- Reuse already installed `graphifyy==0.8.41`.
- Create `/tmp/kendall-nxt-graphify-workflow-3`.
- Copy only selected dashboard E2E runner `.mjs` files.
- Run Graphify only inside that temporary corpus.
- Disable query logging with `GRAPHIFY_QUERY_LOG_DISABLE=1`.
- Run `cluster-only` with `--no-label --no-viz` only after code-only
  extraction succeeds.
- No provider-backed extraction.
- No docs/Markdown extraction.
- No assistant install.
- No hooks.
- No MCP or HTTP serving.
- No repo writes.

## Commands Run

```bash
rm -rf /tmp/kendall-nxt-graphify-workflow-3
```

```bash
mkdir -p /tmp/kendall-nxt-graphify-workflow-3/scripts
```

```bash
cp scripts/dashboard-e2e-runner.mjs scripts/run-detail-e2e.mjs scripts/run-mobile-e2e.mjs scripts/run-managed-recipe-e2e.mjs scripts/setup-e2e.mjs scripts/run-supervisor-tests.mjs /tmp/kendall-nxt-graphify-workflow-3/scripts/
```

Corpus confirmed:

```text
scripts/dashboard-e2e-runner.mjs
scripts/run-detail-e2e.mjs
scripts/run-managed-recipe-e2e.mjs
scripts/run-mobile-e2e.mjs
scripts/run-supervisor-tests.mjs
scripts/setup-e2e.mjs
```

```bash
GRAPHIFY_QUERY_LOG_DISABLE=1 graphify .
```

Result:

```text
[graphify extract] scanning /tmp/kendall-nxt-graphify-workflow-3
[graphify extract] found 6 code, 0 docs, 0 papers, 0 images
[graphify extract] AST extraction on 6 code files...
[graphify extract] wrote /tmp/kendall-nxt-graphify-workflow-3/graphify-out/graph.json: 25 nodes, 30 edges, 4 communities
[graphify extract] wrote /tmp/kendall-nxt-graphify-workflow-3/graphify-out/.graphify_analysis.json
[graphify extract] next: run `graphify cluster-only /tmp/kendall-nxt-graphify-workflow-3` to generate GRAPH_REPORT.md and name communities
```

```bash
GRAPHIFY_QUERY_LOG_DISABLE=1 graphify cluster-only /tmp/kendall-nxt-graphify-workflow-3 --no-label --no-viz
```

Result:

```text
Loading existing graph...
Graph: 25 nodes, 30 edges
Re-clustering...
Done - 4 communities. GRAPH_REPORT.md and graph.json updated (--no-viz; graph.html removed).
```

## Output Check

Files present:

```text
graphify-out/.graphify_analysis.json 2957 bytes
graphify-out/.graphify_labels.json 80 bytes
graphify-out/GRAPH_REPORT.md 2159 bytes
graphify-out/graph.json 18409 bytes
graphify-out/manifest.json 1096 bytes
scripts/dashboard-e2e-runner.mjs 6155 bytes
scripts/run-detail-e2e.mjs 258 bytes
scripts/run-managed-recipe-e2e.mjs 290 bytes
scripts/run-mobile-e2e.mjs 275 bytes
scripts/run-supervisor-tests.mjs 1604 bytes
scripts/setup-e2e.mjs 1062 bytes
```

No repo writes from Graphify were observed.

No provider/API key prompt appeared.

No `graph.html` was present after `--no-viz`.

## Graphify Report Summary

`GRAPH_REPORT.md` reported:

- 25 nodes.
- 30 edges.
- 4 communities, with 2 thin communities omitted.
- Extraction: 100% `EXTRACTED`, 0% `INFERRED`, 0% `AMBIGUOUS`.
- Token cost: 0 input, 0 output.
- Most connected node: `runFocusedDashboardE2E()` with 9 edges.
- Other central nodes: `dashboardCommand()`, `dashboardArgs()`,
  `startProcess()`, `waitForUrl()`, and `waitForExit()`.
- One surprising connection:
  `runFocusedDashboardE2E()` calls `waitForUrl()`.
- No import cycles detected.

## Baseline Comparison

Baseline method:

1. Targeted `rg` over the same six scripts for runner, dashboard, Playwright,
   supervisor, spawn, and environment symbols.
2. Narrow source reads from `scripts/dashboard-e2e-runner.mjs` and the small
   entrypoint scripts.

Baseline findings:

- `run-detail-e2e.mjs`, `run-mobile-e2e.mjs`, and
  `run-managed-recipe-e2e.mjs` are thin entrypoints importing
  `runFocusedDashboardE2E()`.
- `dashboard-e2e-runner.mjs` starts supervisor, dashboard, and Playwright
  processes, waits for service readiness, and tears down child processes.
- The runner manages browser path, temp directories, uv cache, dashboard URL,
  supervisor URL, ports, database path, and environment variables.
- `setup-e2e.mjs` installs Chromium through Playwright.
- `run-supervisor-tests.mjs` runs pytest in `services/supervisor` with a
  per-run temp directory.

Baseline strengths:

- Better at explaining exact runtime behavior, environment variables, ports,
  and process launch details.
- Quickly shows thin entrypoint parameters and test grep strings.

Baseline limitations:

- Required targeted search and source reads.
- Did not automatically summarize which function was the central hub.
- Did not automatically flag community/bridge structure.

Graphify comparison:

- Graphify correctly identified `runFocusedDashboardE2E()` as the central hub
  across the multi-file E2E runner slice.
- Graphify identified helper functions that define the runner lifecycle:
  `dashboardCommand()`, `dashboardArgs()`, `startProcess()`, `waitForUrl()`,
  and `waitForExit()`.
- Graphify was more useful here than in Workflow 2 because the corpus had a
  shared runner and several entrypoint files.
- Graphify still did not replace source reads for exact behavior.

## Bob-Readable Decision Card

**What Graphify did:** It mapped six dashboard E2E runner scripts and showed
that `runFocusedDashboardE2E()` is the central function connecting the workflow.

**What changed compared with baseline:** Graphify surfaced the main structural
hub and related helper functions faster than manual reading. Baseline was still
needed to understand exact process launch behavior, ports, env vars, and
platform branches.

**What risk this controls or introduces:** The no-provider, code-only boundary
worked again. The risk is over-reading the report as behavior explanation; it
is a map, not a full code review.

**Evidence observed:** 25 nodes, 30 edges, 4 communities, 100% extracted, 0
inferred, 0 ambiguous, 0 token cost, no provider prompt, no repo writes.

**Could Bob explain what Graphify contributed?** Yes. It showed which function
is the center of the dashboard E2E runner flow and which helpers matter next.

**Recommendation:** Count Workflow 3 as a positive code-only result. Graphify
appears useful for multi-file code orientation where there is a shared runner
or central lifecycle function.

**Stop or rollback line:** Do not widen to docs, provider-backed extraction,
assistant install, hooks, MCP, HTTP serving, committed output, or repo
integration without separate approval.

## Verdict

- **Understanding gate:** Pass for code-structure understanding.
- **Speed/token gate:** Partial pass. Graphify produced a zero-token report and
  surfaced the main hub quickly, but total workflow savings remain directional.
- **Decision quality gate:** Pass. Graphify highlighted functions that baseline
  source reading confirmed as important.
- **Freshness gate:** Partial pass. Output matched the temp corpus.
- **Authority gate:** Pass. No authority or repo behavior was changed.

Overall verdict: **positive for multi-file code-only orientation, no adoption
yet**.

## Next Options

1. Stop technical runs and summarize evidence across three workflows.
2. Prepare a larger code-only trial on a real implementation area.
3. Prepare a doc-inclusive/provider-boundary packet for documentation/context
   workflows.

Recommended next step: stop technical runs and summarize evidence before any
larger or provider-backed decision.
