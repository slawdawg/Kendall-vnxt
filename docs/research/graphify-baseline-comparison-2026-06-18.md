# Graphify Baseline Comparison

Date: 2026-06-18
Status: first workflow comparison

## Purpose

Compare the first successful Graphify code-only report against Kendall_Nxt's
current orientation baseline for the same two-script corpus.

This comparison does not approve wider Graphify use, provider-backed
extraction, assistant install, hooks, MCP, HTTP serving, or repo integration.

## Workflow

**Workflow type:** Likely non-fit localized task.

**Task objective:** Orient on the small code/config slice used for the first
Graphify technical trial and decide whether Graphify added useful understanding
compared with the existing baseline.

**Corpus:**

- `scripts/codex-workspace.mjs`
- `scripts/test-codex-workspace.mjs`

## Baseline Path

Baseline method:

1. Read the relevant part of `docs/ai-context/index.md`.
2. Use targeted `rg` searches against the two scripts.
3. Open narrow source slices around the matching functions.

Commands/read actions:

```bash
sed -n '1,90p' docs/ai-context/index.md
```

```bash
rg -n "function (startWorkspace|rebuildIndex|git|finishPr|cleanupMerged|workspaceState|parseOptions|run|doctor|removeManagedDirectory)|const (startWorkspace|rebuildIndex|git|finishPr|cleanupMerged|workspaceState|parseOptions|run|doctor|removeManagedDirectory)|async function (startWorkspace|rebuildIndex|git|finishPr|cleanupMerged|workspaceState|parseOptions|run|doctor|removeManagedDirectory)" scripts/codex-workspace.mjs scripts/test-codex-workspace.mjs
```

```bash
sed -n '1,180p' scripts/codex-workspace.mjs
sed -n '240,620p' scripts/codex-workspace.mjs
sed -n '1080,1175p' scripts/codex-workspace.mjs
sed -n '1,180p' scripts/test-codex-workspace.mjs
```

Baseline findings:

- `scripts/codex-workspace.mjs` is a command-line workspace lifecycle script.
- It dispatches commands including `start`, `list`, `resume`, `finish-pr`,
  `cleanup-merged`, `cleanup-orphans`, `rebuild-index`, and `doctor`.
- `parseOptions()` is a shared parser used by major command handlers.
- `startWorkspace()` creates task IDs, branches, manifests, and worktrees.
- `finishPr()` verifies, stages/commits, pushes, and creates or reuses a PR.
- `cleanupMerged()` checks PR merge state and clean worktree state before
  removal.
- `rebuildIndex()` reconstructs manifests from Git worktrees.
- `doctor()` checks Git, Node, GitHub CLI, origin, hooks, state root, and
  manifest/worktree consistency.
- `git()` and `run()` are shared command-execution helpers.
- `scripts/test-codex-workspace.mjs` is a lightweight Node test harness for the
  workspace CLI.

Baseline strengths:

- Quickly found exact implementation locations.
- Gave concrete behavior and safety checks for each command.
- Preserved source line references and command details.
- Required no external tool beyond normal repo inspection.

Baseline limitations:

- Required multiple searches and source reads.
- Did not automatically summarize centrality, bridge functions, or weakly
  connected nodes.
- Required the agent to decide which functions mattered.

## Graphify-Assisted Path

Graphify evidence sources:

- `docs/research/graphify-first-run-retry-evidence-2026-06-18.md`
- `docs/research/graphify-cluster-only-evidence-2026-06-18.md`
- `/tmp/kendall-nxt-graphify-trial-2/graphify-out/GRAPH_REPORT.md`

Graphify method:

1. Generate code-only graph from the two `.mjs` files.
2. Run `cluster-only` with `--no-label --no-viz`.
3. Inspect `GRAPH_REPORT.md`.

Graphify findings:

- 71 nodes.
- 179 edges.
- 7 communities.
- 100% `EXTRACTED`.
- 0% `INFERRED`.
- 0% `AMBIGUOUS`.
- 0 input and 0 output token cost.
- Central functions included `startWorkspace()`, `rebuildIndex()`, `git()`,
  `finishPr()`, `cleanupMerged()`, `workspaceState()`, `parseOptions()`,
  `run()`, `doctor()`, and `removeManagedDirectory()`.
- No import cycles were detected.
- The report identified weakly connected nodes and suggested questions about
  bridge functions.

Graphify strengths:

- Produced a fast structural summary after graph generation.
- Identified central functions without requiring the agent to pick them first.
- Exposed confidence as 100% extracted, with no inferred or ambiguous edges.
- Produced a Bob-readable report without provider use when run with
  `--no-label`.
- Helped explain what the code slice is structurally centered around.

Graphify limitations:

- Required prior install and graph generation.
- Initial corpus design accidentally triggered provider-boundary protection
  until retried with stricter code-only files.
- Community names were generic because LLM labeling was disabled.
- The report did not explain command behavior as concretely as source reads.
- It did not replace source confirmation.
- It did not yet prove token or speed savings on a real development task.

## Comparison

| Question | Baseline | Graphify |
| --- | --- | --- |
| Could it orient on the two scripts? | Yes | Yes |
| Did it stay local/no-provider? | Yes | Yes after stricter code-only retry |
| Did it identify central functions? | Yes, via targeted `rg` | Yes, automatically in report |
| Did it explain exact behavior? | Stronger | Weaker |
| Did it reveal structural centrality? | Manual/inferred | Stronger |
| Did it reduce source reads? | No, it is the source-read method | Potentially, but not proven |
| Did it produce Bob-readable output? | Only through agent summary | Yes, but with generic communities |
| Did it create workflow drag? | Low | Moderate during setup and retry |

## Bob-Readable Decision Card

**What Graphify did:** It turned two approved JavaScript files into a local graph
and report showing central functions, bridge relationships, communities, and
possible weakly connected nodes.

**What changed compared with baseline:** Graphify automatically surfaced a
structural map that the baseline had to build through targeted search and
source reads. The baseline was still better for understanding exact behavior.

**What risk this controls or introduces:** The no-provider command path worked
only after the corpus was restricted to true code files. This shows the safety
boundary is real and useful, but corpus selection is fragile.

**Evidence observed:** Graphify generated a 100% extracted, zero-token-cost
report with 71 nodes and 179 edges from only the two approved `.mjs` files.

**Could Bob explain what Graphify contributed?** Yes at a high level: it made a
map of the script structure and pointed out central functions. It did not yet
prove that Graphify saves time or tokens in normal work.

**Recommendation:** Continue the guided trial, but do not adopt Graphify yet.
Use the next workflow to test a more realistic orientation task where the
starting files are not already obvious.

**Stop or rollback line:** Do not widen the corpus, include docs, run
provider-backed extraction, install assistant guidance, add hooks, or integrate
Graphify into repo workflow without separate approval.

## Verdict

- **Understanding gate:** Partial pass. Bob can understand what Graphify did at
  a high level.
- **Speed/token gate:** Inconclusive. Graphify produced zero-token graph/report
  output after setup, but setup and retry added overhead.
- **Decision quality gate:** Pass for this limited slice. Graphify output
  matched important functions also found by baseline search.
- **Freshness gate:** Partial pass. The graph report was generated from the
  current temp corpus, but no repo freshness policy exists.
- **Authority gate:** Pass. Graphify did not authorize actions or mutate repo
  behavior.

Overall verdict: **continue trial, no adoption yet**.

## Next Work

Run Workflow 2, a more realistic code-navigation or BMAD story implementation
orientation test, only after Bob approves the next exact corpus and command
boundary.
