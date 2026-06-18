# Graphify Cluster-Only Help Evidence

Date: 2026-06-18
Status: help inspected, no cluster-only run performed

## Approval Scope

Bob approved inspecting help for `graphify cluster-only`.

No `cluster-only` command was run against the trial corpus.

## Commands Run

```bash
graphify cluster-only --help
```

Result:

```text
Run 'graphify --help' for full usage.
```

The command pointed to top-level help, so top-level help was inspected:

```bash
graphify --help
```

## Relevant Help Findings

Top-level help documents:

```text
cluster-only <path>     rerun clustering on an existing graph.json and regenerate report
  --no-viz                skip graph.html generation (useful for >5000 node graphs / CI)
  --graph <path>          path to graph.json (default <path>/graphify-out/graph.json)
  --no-label              keep 'Community N' placeholders (skip LLM community naming)
  --backend=<name>        backend to use for community naming (default: auto-detect)
  --model=<name>          model to use for community naming
```

## Interpretation

`cluster-only` can regenerate a report from an existing `graph.json`.

Important provider boundary:

- Default behavior may auto-detect a backend for community naming.
- `--backend` and `--model` are available for naming.
- `--no-label` explicitly skips LLM community naming.

Important output boundary:

- `--no-viz` skips `graph.html` generation.

## Recommended Safe Follow-Up

If Bob approves a report-generation follow-up, use:

```bash
GRAPHIFY_QUERY_LOG_DISABLE=1 graphify cluster-only /tmp/kendall-nxt-graphify-trial-2 --no-label --no-viz
```

Expected behavior:

- Reuse existing `/tmp/kendall-nxt-graphify-trial-2/graphify-out/graph.json`.
- Generate or update a report without LLM community naming.
- Skip `graph.html` generation.
- Keep writes inside `/tmp/kendall-nxt-graphify-trial-2/graphify-out/`.

Stop lines:

- Stop if Graphify asks for an API key.
- Stop if Graphify attempts backend/model use.
- Stop if Graphify writes outside `/tmp/kendall-nxt-graphify-trial-2`.
- Stop if Graphify tries assistant install, hooks, MCP, HTTP serving, or repo
  mutation.
