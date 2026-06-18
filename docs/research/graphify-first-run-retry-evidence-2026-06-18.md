# Graphify First-Run Retry Evidence

Date: 2026-06-18
Status: completed within stricter code-only boundary

## Approval Scope

Bob approved a stricter retry after the first run stopped at the provider
boundary.

Approved retry scope:

- Keep Graphify installed.
- Create `/tmp/kendall-nxt-graphify-trial-2`.
- Copy only:
  - `scripts/codex-workspace.mjs`
  - `scripts/test-codex-workspace.mjs`
- Run Graphify only inside `/tmp/kendall-nxt-graphify-trial-2`.
- Disable query logging with `GRAPHIFY_QUERY_LOG_DISABLE=1`.
- No provider-backed extraction.
- No assistant install.
- No hooks.
- No MCP or HTTP serving.
- No repo writes.
- Allow generated output only under
  `/tmp/kendall-nxt-graphify-trial-2/graphify-out`.

## Commands Run

```bash
rm -rf /tmp/kendall-nxt-graphify-trial-2
```

```bash
mkdir -p /tmp/kendall-nxt-graphify-trial-2/scripts
```

```bash
cp scripts/codex-workspace.mjs scripts/test-codex-workspace.mjs /tmp/kendall-nxt-graphify-trial-2/scripts/
```

Corpus confirmed:

```text
scripts/codex-workspace.mjs
scripts/test-codex-workspace.mjs
```

```bash
GRAPHIFY_QUERY_LOG_DISABLE=1 graphify .
```

Working directory:

```text
/tmp/kendall-nxt-graphify-trial-2
```

Result:

```text
[graphify extract] scanning /tmp/kendall-nxt-graphify-trial-2
[graphify extract] found 2 code, 0 docs, 0 papers, 0 images
[graphify extract] AST extraction on 2 code files...
[graphify extract] wrote /tmp/kendall-nxt-graphify-trial-2/graphify-out/graph.json: 71 nodes, 179 edges, 7 communities
[graphify extract] wrote /tmp/kendall-nxt-graphify-trial-2/graphify-out/.graphify_analysis.json
[graphify extract] next: run `graphify cluster-only /tmp/kendall-nxt-graphify-trial-2` to generate GRAPH_REPORT.md and name communities
```

## Output Check

Files present after the retry:

```text
graphify-out/.graphify_analysis.json 6463 bytes
graphify-out/graph.json 81034 bytes
graphify-out/manifest.json 368 bytes
scripts/codex-workspace.mjs 38051 bytes
scripts/test-codex-workspace.mjs 5401 bytes
```

No repo writes from Graphify were observed.

No `GRAPH_REPORT.md` or `graph.html` was produced by this command.

The CLI suggested a follow-up command:

```bash
graphify cluster-only /tmp/kendall-nxt-graphify-trial-2
```

That command was not run because it was not included in the retry approval and
may involve community naming or semantic report generation.

## Graph Structure Metadata

`graphify-out/graph.json` top-level keys:

```text
directed
multigraph
graph
nodes
links
hyperedges
```

Observed counts:

```text
nodes: 71
links: 179
hyperedges: 0
```

Observed source files in graph nodes:

```text
scripts/codex-workspace.mjs
scripts/test-codex-workspace.mjs
```

Sample node fields included:

```text
label
file_type
source_file
source_location
_origin
id
community
norm_label
```

Sample link fields included:

```text
relation
confidence
source_file
source_location
weight
source
target
confidence_score
```

Sample relation observed:

```text
contains
```

## Scorecard

```text
Graphify Guided Trial Scorecard

Workflow:
- Likely non-fit localized task.

Task objective:
- Determine whether Graphify can safely run on a small known code slice without
  provider-backed extraction.

Baseline Path:
- Not yet executed as a usefulness comparison.
- Current evidence is technical boundary evidence only.

Graphify-Assisted Path:
- Ran `GRAPHIFY_QUERY_LOG_DISABLE=1 graphify .` on two approved `.mjs` files in
  `/tmp/kendall-nxt-graphify-trial-2`.
- Graphify found 2 code files, 0 docs, 0 papers, 0 images.
- Graphify produced `graph.json`, `.graphify_analysis.json`, and
  `manifest.json` under the approved temp output path.
- Graphify did not produce `GRAPH_REPORT.md` or `graph.html` in this step.

Comparison:
- Graphify successfully stayed inside the stricter code-only corpus.
- Graphify generated source-linked AST graph data.
- Graphify did not yet produce Bob-readable orientation output.
- A usefulness comparison cannot be completed until either the graph JSON is
  queried manually or a separately approved report/community naming step is run.

Bob-Readable Decision Card:
- What Graphify did: read two approved JavaScript files and created a local
  source-linked graph with 71 nodes and 179 links.
- What changed compared with baseline: no direct baseline comparison yet;
  Graphify created a relationship artifact that can be inspected or queried.
- What risk this controls or introduces: code-only AST extraction worked without
  provider use, but the readable report requires another step not yet approved.
- Evidence observed: all graph node sources were limited to the two approved
  files; no repo writes were observed.
- Could Bob explain what Graphify contributed? partially. It proved code-only
  graph generation, but not usefulness or token savings yet.
- Recommendation: approve a separate inspection/report step, or stop here and
  classify the first technical run as safe but not yet useful.
- Stop or rollback line: do not run `graphify cluster-only`, query commands,
  MCP, HTTP serving, provider-backed extraction, or cleanup without explicit
  approval.

Verdict:
- Pass for stricter code-only safety boundary.
- Inconclusive for usefulness.
- Inconclusive for speed/token savings.
```

## Next Options

1. Approve a read-only manual graph JSON inspection and baseline comparison.
2. Approve `graphify cluster-only /tmp/kendall-nxt-graphify-trial-2` if Bob is
   comfortable with its report/community naming behavior.
3. Stop the technical trial and classify Graphify as safe for code-only graph
   generation but not yet proven useful.

Historical recommended next step: inspect whether `graphify cluster-only --help`
documents provider behavior before deciding whether to run it.

Current note: this recommendation was later superseded by approved cluster-only
and workflow evidence. The current durable decision is
`docs/research/graphify-final-recommendation-2026-06-18.md`.
