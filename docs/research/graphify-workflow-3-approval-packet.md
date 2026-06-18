# Graphify Workflow 3 Approval Packet

Date: 2026-06-18
Status: draft approval packet, not approved for execution

## Purpose

Define a third Graphify trial that gives the tool a fairer code-only test on a
multi-file implementation slice.

This packet does not approve execution until Bob explicitly approves it.

## Decision Requested

Approve or reject a bounded Graphify run with these limits:

- Reuse the already installed `graphifyy==0.8.41`.
- Create a temporary corpus under `/tmp/kendall-nxt-graphify-workflow-3`.
- Copy only selected dashboard E2E runner JavaScript files.
- Run Graphify only inside that temporary corpus.
- Disable query logging with `GRAPHIFY_QUERY_LOG_DISABLE=1`.
- Run `cluster-only` with `--no-label --no-viz` only after graph extraction
  succeeds.
- No provider-backed extraction.
- No docs/Markdown extraction.
- No assistant install.
- No hooks.
- No MCP or HTTP serving.
- No repo writes.
- Allow generated output only under
  `/tmp/kendall-nxt-graphify-workflow-3/graphify-out`.

## Workflow Target

**Workflow:** Multi-file code-only implementation orientation.

**Task objective:** Determine whether Graphify helps orient on the dashboard E2E
runner family better than targeted `rg` and narrow source reads.

**Why this workflow matters:** Workflow 2 showed Graphify is weak on a one-file
drift checker. This workflow tests a more suitable code-structure problem:
several small entrypoint scripts that call a shared runner.

## Corpus Included

Only:

- `scripts/dashboard-e2e-runner.mjs`
- `scripts/run-detail-e2e.mjs`
- `scripts/run-mobile-e2e.mjs`
- `scripts/run-managed-recipe-e2e.mjs`
- `scripts/setup-e2e.mjs`
- `scripts/run-supervisor-tests.mjs`

## Corpus Excluded

Everything else, including:

- `docs/`
- Markdown stories and research files
- package metadata
- `_bmad-output/`
- `.agents/`
- `.codex/`
- `.git/`
- dependency folders
- generated output
- credentials, sessions, provider payloads, prompt/completion logs, reasoning
  traces, and secrets
- media, office files, PDFs, URLs, and database introspection

## Proposed Commands

These commands are not approved until Bob says so explicitly.

```bash
rm -rf /tmp/kendall-nxt-graphify-workflow-3
```

```bash
mkdir -p /tmp/kendall-nxt-graphify-workflow-3/scripts
```

```bash
cp scripts/dashboard-e2e-runner.mjs scripts/run-detail-e2e.mjs scripts/run-mobile-e2e.mjs scripts/run-managed-recipe-e2e.mjs scripts/setup-e2e.mjs scripts/run-supervisor-tests.mjs /tmp/kendall-nxt-graphify-workflow-3/scripts/
```

```bash
GRAPHIFY_QUERY_LOG_DISABLE=1 graphify .
```

Working directory for graph extraction:

```text
/tmp/kendall-nxt-graphify-workflow-3
```

If extraction succeeds with code-only classification, run:

```bash
GRAPHIFY_QUERY_LOG_DISABLE=1 graphify cluster-only /tmp/kendall-nxt-graphify-workflow-3 --no-label --no-viz
```

## Baseline Context For Comparison

The baseline path may use:

- `docs/ai-context/index.md`
- targeted `rg` over the six approved scripts
- narrow source reads from those scripts

The baseline should answer:

- Which scripts are entrypoints?
- Which shared runner do they call?
- What services/processes does the runner launch?
- What environment variables and ports matter?
- Where are platform-specific branches?
- Does Graphify reveal useful centrality or relationships faster than the
  baseline?

## Provider Boundary

No provider-backed extraction is approved.

If Graphify reports docs/paper/image files, prompts for a provider, tries to use
a backend/model, or reports missing API keys, stop immediately.

## Query Logging Setting

Disable Graphify query logging:

```bash
GRAPHIFY_QUERY_LOG_DISABLE=1
```

## Expected Writes

Allowed writes if approved:

- `/tmp/kendall-nxt-graphify-workflow-3/`
- `/tmp/kendall-nxt-graphify-workflow-3/graphify-out/`

Not allowed:

- Any write under the repo root.
- `AGENTS.md`
- `.codex/hooks.json`
- `.agents/skills/graphify/`
- `.graphifyignore`
- Git hooks.
- committed generated output.

## Expected Outputs

Expected output files under the temporary corpus:

- `graphify-out/graph.json`
- `graphify-out/.graphify_analysis.json`
- `graphify-out/manifest.json`
- `graphify-out/GRAPH_REPORT.md` after `cluster-only`
- `graphify-out/.graphify_labels.json` after `cluster-only --no-label`

Not expected:

- `graphify-out/graph.html`, because `--no-viz` should skip or remove it.

## Explicitly Blocked Behaviors

- `graphify install`
- `graphify install --project`
- `graphify install --platform codex`
- `graphify codex install`
- `graphify hook install`
- MCP serving
- HTTP serving
- provider-backed extraction
- docs/PDF/image/media extraction
- URL fetching
- database introspection
- edits to repo instructions or assistant configuration
- staging or committing generated output

## Stop Lines

Stop immediately if:

- Graphify writes inside the repo.
- Graphify creates assistant instructions or hooks.
- Graphify requests or uses provider credentials.
- Graphify reads outside the approved temporary corpus.
- Graphify creates unexpected persistent logs.
- Graphify tries to serve graph data.
- The command behavior differs from this packet.

## Evidence To Capture

Capture:

- temporary corpus file list.
- extraction output summary.
- cluster-only output summary.
- generated output file list and sizes.
- graph node/link counts.
- source files referenced in graph nodes.
- brief `GRAPH_REPORT.md` summary.
- baseline comparison against targeted `rg` and narrow source reads.

## Recommendation

Approve this if Bob wants one more no-provider trial before considering
doc-inclusive/provider-backed Graphify use.

This is the fairest local-only test so far because it gives Graphify a
multi-file code relationship problem without crossing into Markdown semantics.
