# Graphify First-Run Approval Packet

Date: 2026-06-18
Status: approved and attempted; historical provider-boundary stop line evidence
later superseded by code-only retries

## Purpose

Define the exact first technical trial Bob can approve or reject. This packet is
deliberately narrower than the full Graphify Guided Trial because the first run
should prove basic behavior without touching repo instructions, hooks, docs, or
provider-backed extraction.

## Historical Decision Requested

Bob was asked to approve or reject a limited Graphify first run with these
boundaries:

- Install Graphify with `uv tool install graphifyy`.
- Create a temporary code/config corpus under `/tmp`.
- Run Graphify only against that temporary corpus.
- Disable Graphify query logging.
- Inspect only generated output metadata and the readable report.
- Do not install assistant integration.
- Do not create hooks.
- Do not write generated output into the repo.
- Do not commit generated output.

## Workflow Target

**Workflow:** Likely non-fit localized task.

**Task objective:** Determine whether Graphify adds useful orientation value for
a small, already-known code/config slice.

**Reason for first:** This tests when Graphify should be skipped. If Graphify
adds drag here, that supports the future check-or-explain policy and limits
first-run blast radius.

## Operation

1. Install the `graphifyy` package as a uv tool.
2. Build a temporary corpus from selected repo files.
3. Run `graphify .` inside the temporary corpus with query logging disabled.
4. Record output file list, size, and whether expected outputs exist.
5. Inspect `GRAPH_REPORT.md` only after confirming no unexpected repo writes or
   boundary violations.
6. Fill Workflow 1 scorecard in
   `docs/research/graphify-trial-workflows-and-scorecards.md`.

## Proposed Commands

These commands were not approved until Bob said so explicitly.

```bash
uv tool install graphifyy
```

```bash
mkdir -p /tmp/kendall-nxt-graphify-trial-1/scripts
```

```bash
cp package.json pnpm-workspace.yaml /tmp/kendall-nxt-graphify-trial-1/
```

```bash
cp scripts/codex-workspace.mjs scripts/test-codex-workspace.mjs /tmp/kendall-nxt-graphify-trial-1/scripts/
```

```bash
GRAPHIFY_QUERY_LOG_DISABLE=1 graphify .
```

The final command must run with working directory:

```text
/tmp/kendall-nxt-graphify-trial-1
```

## Corpus Included

Only these files:

- `package.json`
- `pnpm-workspace.yaml`
- `scripts/codex-workspace.mjs`
- `scripts/test-codex-workspace.mjs`

## Corpus Excluded

Everything else, including:

- `docs/`
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

The corpus contains code/config files only. If Graphify prompts for a provider,
tries to use a provider, reports missing provider credentials, or attempts
semantic extraction outside the code/config boundary, stop immediately.

## Query Logging Setting

Disable Graphify query logging:

```bash
GRAPHIFY_QUERY_LOG_DISABLE=1
```

Do not allow default retained query logs under `~/.cache/graphify-queries.log`
for this run.

## Expected Writes

Allowed writes if approved:

- uv tool install files outside the repo.
- `/tmp/kendall-nxt-graphify-trial-1/`
- `/tmp/kendall-nxt-graphify-trial-1/graphify-out/`

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

- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/graph.json`
- `graphify-out/graph.html`

If Graphify writes other files, record them before inspecting report content.

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
- The install or run command behaves differently than documented.

## Rollback And Cleanup Path

Cleanup is not part of this approval unless Bob also approves cleanup.

Candidate cleanup after evidence capture:

- Remove `/tmp/kendall-nxt-graphify-trial-1/`.
- Optionally uninstall the uv tool with `uv tool uninstall graphifyy` if Bob
  wants no retained tool install.

Do not run cleanup commands without separate confirmation if the trial produced
evidence Bob wants preserved.

## Evidence To Capture

Capture a concise evidence packet:

- `uv tool install graphifyy` result summary.
- `graphify` version or help output if available.
- temporary corpus file list.
- generated output file list.
- generated output sizes.
- whether expected outputs exist.
- whether any unexpected writes occurred.
- whether provider usage appeared.
- brief summary of `GRAPH_REPORT.md`.
- Workflow 1 scorecard verdict.

## Historical Recommendation

Historical approval condition: approve only if Bob is comfortable installing a
Python tool with network access and allowing local generated output under
`/tmp`.

The run was approved and attempted. It stopped at the provider-boundary stop
line before output generation. Do not use this packet as current approval for a
future run.

## Execution Evidence

The approved first run was attempted and blocked before output generation
because Graphify detected 1 docs/paper/image file requiring semantic extraction.

See `docs/research/graphify-first-run-evidence-2026-06-18.md`.
