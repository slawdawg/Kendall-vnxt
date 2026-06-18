# Graphify Workflow 2 Approval Packet

Date: 2026-06-18
Status: approved, executed, and closed with evidence

## Purpose

Define the next bounded Graphify trial for a more realistic code-navigation /
BMAD story orientation task.

This packet did not approve execution until Bob explicitly approved it. The
approved run was executed and recorded in
`docs/research/graphify-workflow-2-evidence-2026-06-18.md`.

## Historical Decision Requested

Bob was asked to approve or reject a second bounded Graphify run with these
limits:

- Reuse the already installed `graphifyy==0.8.41`.
- Create a temporary corpus under `/tmp/kendall-nxt-graphify-workflow-2`.
- Copy only `scripts/check-token-economy.mjs`.
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
  `/tmp/kendall-nxt-graphify-workflow-2/graphify-out`.

## Workflow Target

**Workflow:** Code-navigation / BMAD story implementation orientation.

**Task objective:** Determine whether Graphify helps orient on the drift-check
implementation for Story 21.4 and token-economy measurement readiness.

**Why this workflow matters:** This resembles a real BMAD implementation
orientation path. A normal agent needs to connect a story, research guidance,
context routing, and the drift-check script. Graphify can only be run on the
code part without provider-backed extraction, so the comparison should treat
Graphify as a code-structure aid, not a full story/doc mapper.

## Baseline Context For Comparison

The baseline path may read:

- `docs/ai-context/index.md`
- `docs/stories/21-4-token-economy-measurement-readiness.md`
- `docs/research/token-economy-measurement-readiness.md`
- `docs/research/token-economy-tool-evaluation.md`
- `scripts/check-token-economy.mjs`

The Graphify path may read:

- The generated Graphify report for `scripts/check-token-economy.mjs`.
- The same source files needed for confirmation.

## Proposed Commands

These commands were not approved until Bob said so explicitly.

```bash
rm -rf /tmp/kendall-nxt-graphify-workflow-2
```

```bash
mkdir -p /tmp/kendall-nxt-graphify-workflow-2/scripts
```

```bash
cp scripts/check-token-economy.mjs /tmp/kendall-nxt-graphify-workflow-2/scripts/
```

```bash
GRAPHIFY_QUERY_LOG_DISABLE=1 graphify .
```

Working directory for graph extraction:

```text
/tmp/kendall-nxt-graphify-workflow-2
```

If extraction succeeds with code-only classification, run:

```bash
GRAPHIFY_QUERY_LOG_DISABLE=1 graphify cluster-only /tmp/kendall-nxt-graphify-workflow-2 --no-label --no-viz
```

## Corpus Included

Only:

- `scripts/check-token-economy.mjs`

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

- `/tmp/kendall-nxt-graphify-workflow-2/`
- `/tmp/kendall-nxt-graphify-workflow-2/graphify-out/`

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
- baseline comparison against the story/docs/source-read path.

## Recommendation

Historical recommendation: approve this only if Bob wants to continue the
technical trial without provider-backed doc extraction.

This run can test whether Graphify helps with code structure inside the
token-economy drift-check script. It cannot test whether Graphify connects the
story and research docs unless Bob separately approves provider-backed or
doc-inclusive behavior.

## Execution Evidence

The approved run was completed within the code-only boundary. The evidence
showed limited usefulness for a one-file drift checker and did not support
adoption. See `docs/research/graphify-workflow-2-evidence-2026-06-18.md`.
