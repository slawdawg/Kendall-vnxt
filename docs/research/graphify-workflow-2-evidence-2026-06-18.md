# Graphify Workflow 2 Evidence

Date: 2026-06-18
Status: completed within approved code-only boundary

## Approval Scope

Bob approved the Workflow 2 bounded run from
`docs/research/graphify-workflow-2-approval-packet.md`.

Approved scope:

- Reuse already installed `graphifyy==0.8.41`.
- Create `/tmp/kendall-nxt-graphify-workflow-2`.
- Copy only `scripts/check-token-economy.mjs`.
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
rm -rf /tmp/kendall-nxt-graphify-workflow-2
```

```bash
mkdir -p /tmp/kendall-nxt-graphify-workflow-2/scripts
```

```bash
cp scripts/check-token-economy.mjs /tmp/kendall-nxt-graphify-workflow-2/scripts/
```

Corpus confirmed:

```text
scripts/check-token-economy.mjs
```

```bash
GRAPHIFY_QUERY_LOG_DISABLE=1 graphify .
```

Result:

```text
[graphify extract] scanning /tmp/kendall-nxt-graphify-workflow-2
[graphify extract] found 1 code, 0 docs, 0 papers, 0 images
[graphify extract] AST extraction on 1 code files...
[graphify extract] wrote /tmp/kendall-nxt-graphify-workflow-2/graphify-out/graph.json: 21 nodes, 21 edges, 2 communities
[graphify extract] wrote /tmp/kendall-nxt-graphify-workflow-2/graphify-out/.graphify_analysis.json
[graphify extract] next: run `graphify cluster-only /tmp/kendall-nxt-graphify-workflow-2` to generate GRAPH_REPORT.md and name communities
```

```bash
GRAPHIFY_QUERY_LOG_DISABLE=1 graphify cluster-only /tmp/kendall-nxt-graphify-workflow-2 --no-label --no-viz
```

Result:

```text
Loading existing graph...
Graph: 21 nodes, 21 edges
Re-clustering...
Done - 2 communities. GRAPH_REPORT.md and graph.json updated (--no-viz; graph.html removed).
```

## Output Check

Files present:

```text
graphify-out/.graphify_analysis.json 2458 bytes
graphify-out/.graphify_labels.json 40 bytes
graphify-out/GRAPH_REPORT.md 1898 bytes
graphify-out/graph.json 14037 bytes
graphify-out/manifest.json 187 bytes
scripts/check-token-economy.mjs 11782 bytes
```

No repo writes from Graphify were observed.

No provider/API key prompt appeared.

No `graph.html` was present after `--no-viz`.

## Graphify Report Summary

`GRAPH_REPORT.md` reported:

- 21 nodes.
- 21 edges.
- 2 communities, with 1 thin community omitted.
- Extraction: 100% `EXTRACTED`, 0% `INFERRED`, 0% `AMBIGUOUS`.
- Token cost: 0 input, 0 output.
- Most connected nodes were `readWorkspaceFile()` and
  `readRequiredWorkspaceFile()`.
- No surprising cross-file connections were detected because the corpus
  contained one source file.
- Knowledge gaps reported 16 weakly connected or isolated nodes.

## Baseline Comparison

Baseline method:

1. Read the relevant Graphify trial and token-economy context.
2. Search for token-economy/story/check symbols.
3. Read `scripts/check-token-economy.mjs`.

Baseline findings:

- `scripts/check-token-economy.mjs` is a documentation drift checker.
- It reads `package.json`, `AGENTS.md`, `docs/ai-context/index.md`, Tool Churn
  RCA docs, token-economy research docs, story index, and Stories 21.2, 21.3,
  and 21.4.
- It verifies the package script, check chain, required artifacts, AI context
  routing, Tool Churn RCA triggers/classes/stop lines/actions/non-goals,
  story-index references, measurement baseline packet fields, workflow samples,
  adoption gates, and Story 21.4 guardrails.
- The source-read baseline made the purpose and acceptance-criteria coverage
  clear.

Graphify comparison:

- Graphify correctly stayed code-only and produced a report.
- Graphify identified the helper read functions as central.
- Graphify did not surface the most important semantic fact: this script's
  value is the list of asserted docs, story requirements, and required text
  contracts.
- The graph report was less useful than simply reading the script for this
  one-file drift-check task.

## Bob-Readable Decision Card

**What Graphify did:** It mapped the structure of
`scripts/check-token-economy.mjs` and showed the most connected helper
functions.

**What changed compared with baseline:** Baseline source reading explained what
the drift checker actually protects. Graphify mostly showed that the script has
many weakly connected constants and two central file-reading helpers.

**What risk this controls or introduces:** Code-only safety worked again, with
no provider use and no repo writes. The limitation is that Graphify's AST-only
view misses the meaning of text assertions and docs relationships.

**Evidence observed:** 21 nodes, 21 edges, 2 communities, 100% extracted,
0 inferred, 0 ambiguous, 0 token cost.

**Could Bob explain what Graphify contributed?** Yes, but the contribution is
modest: it showed the script's structural center, not the story or doc
semantics.

**Recommendation:** Count Workflow 2 as a negative/limited-value result for
code-only Graphify on a one-file drift checker. Continue the trial only if the
next workflow tests either a multi-file code area or a separately approved
doc-inclusive/provider boundary.

**Stop or rollback line:** Do not widen to docs, provider-backed extraction,
assistant install, hooks, MCP, HTTP serving, or repo integration without
separate approval.

## Verdict

- **Understanding gate:** Partial pass. Graphify's output is understandable but
  not very informative for this workflow.
- **Speed/token gate:** Fail for this workflow. Baseline source reading was more
  directly useful.
- **Decision quality gate:** Pass. Graphify did not mislead, but it omitted the
  important semantic purpose.
- **Freshness gate:** Partial pass. Output matched the temp corpus.
- **Authority gate:** Pass. No authority or repo behavior was changed.

Overall verdict: **limited value for Workflow 2 code-only run**.

## Next Options

1. Run Workflow 3 as a documentation/context update only if Bob approves a
   doc-inclusive/provider boundary.
2. Run another no-provider code-only workflow using a multi-file implementation
   area instead of a one-file drift checker.
3. Stop the technical trial and summarize current evidence.

Recommended next step: summarize current evidence before approving any
provider-backed or wider-corpus run.
