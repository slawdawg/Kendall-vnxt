# Graphify Cluster-Only Evidence

Date: 2026-06-18
Status: completed within approved no-label, no-viz boundary

## Approval Scope

Bob approved running this exact command:

```bash
GRAPHIFY_QUERY_LOG_DISABLE=1 graphify cluster-only /tmp/kendall-nxt-graphify-trial-2 --no-label --no-viz
```

Approved boundary:

- Use existing `/tmp/kendall-nxt-graphify-trial-2/graphify-out/graph.json`.
- Skip LLM community naming with `--no-label`.
- Skip `graph.html` generation with `--no-viz`.
- Keep writes under `/tmp/kendall-nxt-graphify-trial-2/graphify-out/`.
- No provider-backed extraction.
- No assistant install.
- No hooks.
- No MCP or HTTP serving.
- No repo writes.

## Command Run

```bash
GRAPHIFY_QUERY_LOG_DISABLE=1 graphify cluster-only /tmp/kendall-nxt-graphify-trial-2 --no-label --no-viz
```

Working directory:

```text
/tmp/kendall-nxt-graphify-trial-2
```

Result:

```text
Loading existing graph...
Graph: 71 nodes, 179 edges
Re-clustering...
Done - 7 communities. GRAPH_REPORT.md and graph.json updated (--no-viz; graph.html removed).
```

## Output Check

Files present after the command:

```text
graphify-out/.graphify_analysis.json 6463 bytes
graphify-out/.graphify_labels.json 140 bytes
graphify-out/GRAPH_REPORT.md 4342 bytes
graphify-out/graph.json 83803 bytes
graphify-out/manifest.json 368 bytes
scripts/codex-workspace.mjs 38051 bytes
scripts/test-codex-workspace.mjs 5401 bytes
```

No repo writes from Graphify were observed.

No provider/API key prompt appeared.

No `graph.html` was present after `--no-viz`.

## Report Summary

`GRAPH_REPORT.md` reported:

- 71 nodes.
- 179 edges.
- 7 communities.
- Extraction: 100% `EXTRACTED`, 0% `INFERRED`, 0% `AMBIGUOUS`.
- Token cost: 0 input, 0 output.

Important sections generated:

- Community hubs.
- God nodes, including `startWorkspace()`, `rebuildIndex()`, `git()`,
  `finishPr()`, `cleanupMerged()`, and `workspaceState()`.
- Surprising connections, such as `startWorkspace()` calling
  `assertSafeBranch()` and `branchExists()`.
- Import cycles: none detected.
- Communities with generic names because `--no-label` skipped LLM naming.
- Knowledge gaps: 7 isolated or weakly connected nodes.
- Suggested questions about bridge nodes and weakly connected nodes.

## Scorecard Update

```text
Graphify Guided Trial Scorecard

Workflow:
- Likely non-fit localized task.

Task objective:
- Determine whether Graphify can safely produce a Bob-readable report for a
  small known code slice without provider-backed behavior.

Baseline Path:
- Not yet executed as a direct usefulness comparison.

Graphify-Assisted Path:
- Used existing code-only graph for two `.mjs` files.
- Ran cluster-only with `--no-label --no-viz`.
- Produced `GRAPH_REPORT.md` without provider prompt.
- Report showed 100% extracted relationships and 0 token cost.

Comparison:
- Graphify created a concise structural map of the two scripts.
- It identified central functions and possible bridge nodes.
- It did not provide human-named communities because LLM naming was disabled.
- It may be useful for orienting in a script, but usefulness and speed/token
  savings still need a baseline comparison.

Bob-Readable Decision Card:
- What Graphify did: turned two approved JavaScript files into a source-linked
  code graph and report.
- What changed compared with baseline: no direct baseline comparison yet, but
  Graphify surfaced central functions, communities, bridge relationships, and
  weakly connected nodes in one short report.
- What risk this controls or introduces: `--no-label` avoided provider-backed
  naming; generic community names reduce readability but preserve safety.
- Evidence observed: 71 nodes, 179 edges, 7 communities, 100% extracted, 0
  inferred, 0 ambiguous, 0 token cost.
- Could Bob explain what Graphify contributed? likely yes at a high level:
  it made a map of the two scripts and pointed out central functions and
  relationships.
- Recommendation: run a baseline comparison on the same two-script orientation
  task before claiming usefulness or savings.
- Stop or rollback line: do not run provider-backed labeling, wider corpus
  extraction, query commands, MCP, HTTP serving, hooks, or repo integration
  without explicit approval.

Verdict:
- Pass for no-provider report generation on code-only graph.
- Partial pass for Bob-readable understanding.
- Inconclusive for usefulness and speed/token savings until baseline
  comparison.
```

## Next Options

1. Run a baseline comparison manually: orient on the same two scripts using
   `docs/ai-context/index.md`, targeted `rg`, and narrow source reads, then
   compare against the Graphify report.
2. Approve read-only Graphify query commands against the generated graph.
3. Stop here and classify Graphify as safe for code-only local report
   generation but not yet proven valuable.

Historical recommended next step: do the manual baseline comparison before
using more Graphify commands.

Current note: this recommendation was later superseded by baseline comparison
and workflow evidence. The current durable decision is
`docs/research/graphify-final-recommendation-2026-06-18.md`.
