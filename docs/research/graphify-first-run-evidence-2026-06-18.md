# Graphify First-Run Evidence

Date: 2026-06-18
Status: historical first-run evidence; provider-boundary stop line triggered
and later superseded by code-only retries

## Approval Scope

Bob approved the bounded first run described in
`docs/research/graphify-first-run-approval-packet.md`.

Approved scope:

- Install `graphifyy` with `uv tool install graphifyy`.
- Create temp corpus under `/tmp/kendall-nxt-graphify-trial-1`.
- Copy only:
  - `package.json`
  - `pnpm-workspace.yaml`
  - `scripts/codex-workspace.mjs`
  - `scripts/test-codex-workspace.mjs`
- Run Graphify only inside `/tmp/kendall-nxt-graphify-trial-1`.
- Disable query logging with `GRAPHIFY_QUERY_LOG_DISABLE=1`.
- Allow generated output only under `/tmp/kendall-nxt-graphify-trial-1/graphify-out/`.
- No repo writes from Graphify.
- No assistant install.
- No hooks.
- No provider-backed extraction.
- No MCP or HTTP serving.
- No committed output.

## Commands Run

```bash
uv tool install graphifyy
```

Result:

- Installed `graphifyy==0.8.41`.
- Installed executables: `graphify`, `graphify-mcp`.

```bash
mkdir -p /tmp/kendall-nxt-graphify-trial-1/scripts
```

```bash
cp package.json pnpm-workspace.yaml /tmp/kendall-nxt-graphify-trial-1/
```

```bash
cp scripts/codex-workspace.mjs scripts/test-codex-workspace.mjs /tmp/kendall-nxt-graphify-trial-1/scripts/
```

Corpus confirmed:

```text
package.json
pnpm-workspace.yaml
scripts/codex-workspace.mjs
scripts/test-codex-workspace.mjs
```

```bash
graphify --version
```

Result:

```text
graphify 0.8.41
```

```bash
GRAPHIFY_QUERY_LOG_DISABLE=1 graphify .
```

Working directory:

```text
/tmp/kendall-nxt-graphify-trial-1
```

Result:

```text
error: no LLM API key found (1 doc/paper/image file(s) need semantic extraction). Set GEMINI_API_KEY or GOOGLE_API_KEY (gemini), MOONSHOT_API_KEY (kimi), ANTHROPIC_API_KEY (claude), OPENAI_API_KEY (openai), DEEPSEEK_API_KEY (deepseek), or pass --backend. A code-only corpus needs no key.
[graphify extract] scanning /tmp/kendall-nxt-graphify-trial-1
[graphify extract] found 3 code, 1 docs, 0 papers, 0 images
```

## Output Check

Files present after the blocked run:

```text
package.json 5652 bytes
pnpm-workspace.yaml 230 bytes
scripts/codex-workspace.mjs 38051 bytes
scripts/test-codex-workspace.mjs 5401 bytes
```

No `graphify-out/` directory was created.

No unexpected temp output files were observed.

No repo file writes from Graphify were observed.

## Stop Line Triggered

The provider boundary stop line triggered. Graphify classified one file in the
approved corpus as docs/paper/image content requiring semantic extraction and
refused to continue without an LLM API key.

The likely cause is `pnpm-workspace.yaml` or another non-code/config file being
classified as a docs-like file by Graphify.

## Scorecard

```text
Graphify Guided Trial Scorecard

Workflow:
- Likely non-fit localized task.

Task objective:
- Determine whether Graphify adds useful orientation value for a small,
  already-known code/config slice.

Baseline Path:
- Not executed in this run. This was the technical first-run boundary check.

Graphify-Assisted Path:
- Installed graphifyy==0.8.41.
- Built approved temp corpus.
- Ran `GRAPHIFY_QUERY_LOG_DISABLE=1 graphify .` in the temp corpus.
- Graphify stopped before output because the corpus included 1 docs/paper/image
  file requiring semantic extraction.

Comparison:
- Graphify did not produce orientation output.
- Graphify correctly exposed provider-backed extraction instead of silently
  continuing.
- The first-run boundary worked: provider use was blocked before any generated
  output was created.

Bob-Readable Decision Card:
- What Graphify did: scanned the temp corpus, classified 3 files as code and 1
  as docs, then refused to continue without an LLM API key.
- What changed compared with baseline: no orientation comparison was possible
  yet.
- What risk this controls or introduces: the provider boundary worked, but the
  proposed corpus was not truly code-only.
- Evidence observed: Graphify error reported 1 docs/paper/image file needing
  semantic extraction and no output was written.
- Could Bob explain what Graphify contributed? yes: it showed that corpus
  classification matters and that a non-code file can force provider-backed
  behavior.
- Recommendation: retry with a stricter code-only corpus, or stop the technical
  trial.
- Stop or rollback line: do not retry with changed corpus or provider-backed
  extraction without explicit Bob approval.

Verdict:
- Inconclusive for usefulness.
- Pass for safety boundary detection.
- Fail for first corpus design.
```

## Next Options

1. Retry with a stricter code-only corpus, excluding `package.json` and
   `pnpm-workspace.yaml` if needed.
2. Approve provider-backed semantic extraction for selected docs.
3. Stop the technical trial and keep Graphify as planning-only research.

Historical recommended next step: retry only after Bob approves a revised
corpus.

Current note: this recommendation was later superseded by approved code-only
retry and workflow evidence. The current durable decision is
`docs/research/graphify-final-recommendation-2026-06-18.md`.
