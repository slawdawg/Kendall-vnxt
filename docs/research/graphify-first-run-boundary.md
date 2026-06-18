# Graphify First-Run Boundary Proposal

Date: 2026-06-18
Status: draft proposal, not approved for execution

## Purpose

Define the narrowest safe first technical trial for Graphify in Kendall_Nxt.

This document does not approve installing Graphify, running Graphify, creating
`.graphifyignore`, writing `graphify-out/`, installing hooks, or changing
assistant behavior. It is the proposal Bob should review before any execution
approval.

## Recommended First Run

Start with a deliberately small, code/config-focused run that avoids docs and
provider-backed semantic extraction if Graphify supports a useful code-only
mode.

Recommended first boundary:

- Install only after explicit Bob approval.
- Run only after explicit Bob approval.
- No `graphify install`.
- No `graphify codex install`.
- No project-scoped assistant install.
- No hooks.
- No MCP serving.
- No HTTP serving.
- No committed `graphify-out/`.
- No provider-backed extraction.
- No URL, media, office, Google Workspace, PR triage, database, or remote
  integration features.
- Disable or redirect query logging for the trial.
- Treat output as orientation evidence only.

## Why This Boundary

The source behavior packet found two important safety facts:

1. Graphify documents code extraction as local for a code-only corpus.
2. Graphify documents docs, PDFs, and images as using the AI assistant or a
   configured model provider for semantic extraction.

Kendall_Nxt has many important Markdown docs, but including docs in the first
technical run could cross into provider-backed behavior. The safer first
question is:

Can Graphify provide any useful orientation from code and config only?

If yes, Kendall_Nxt can evaluate that output before deciding whether a later
doc-inclusive run is worth a separate provider-boundary approval.

## Candidate Corpus

The first run should use a small, intentionally selected corpus instead of the
whole repo.

Candidate include set:

- Source code directories for one workflow slice.
- Relevant package or service config files.
- Scripts directly involved in that workflow.
- Tests for the same workflow slice.

Candidate exclude set:

- Markdown docs.
- BMAD output.
- Local workspace state.
- Generated files.
- Dependency folders.
- Build artifacts.
- Secrets, credentials, sessions, provider payloads, logs, and caches.

The exact corpus should be selected only after choosing the first scorecard
workflow.

## Candidate `.graphifyignore` For Review

Do not create this file yet. This is a candidate to review before any run.

```gitignore
# Dependencies and package-manager caches
node_modules/
.pnpm-store/
.npm/
.yarn/
.uv/
.venv/
venv/
__pycache__/

# Build and generated output
dist/
build/
coverage/
.next/
.turbo/
*.tsbuildinfo
*.generated.*

# Local Codex/BMAD/runtime state
_bmad-output/
.codex-workspaces/
graphify-out/
.graphify/
.cache/
tmp/
temp/

# Git and tool internals
.git/
.gitignore
.graphifyignore

# Secrets, credentials, sessions, and provider payloads
.env
.env.*
*.pem
*.key
*.p12
*.pfx
*secret*
*secrets*
*credential*
*credentials*
*token*
*session*
*provider-payload*
*reasoning-trace*

# Large or non-code content deferred from first run
*.pdf
*.png
*.jpg
*.jpeg
*.webp
*.gif
*.mp3
*.mp4
*.mov
*.wav
*.docx
*.xlsx
*.gdoc
*.gsheet
*.gslides

# Markdown/docs are excluded for the first code-only boundary.
# A later doc-inclusive trial needs separate provider-boundary approval.
*.md
*.mdx
docs/
```

## Query Logging Boundary

Graphify documents default query logging under `~/.cache/graphify-queries.log`.

Recommended first-run setting:

```bash
GRAPHIFY_QUERY_LOG_DISABLE=1
```

If a debug log is needed, redirect it to an approved local trial evidence path
instead of the default user cache path.

## Output Boundary

Generated outputs should be local-only and excluded from source control during
the first run.

Preferred first-run output handling:

- Allow `graphify-out/` only if Bob approves the run.
- Do not stage or commit `graphify-out/`.
- Review only summary characteristics first: file list, size, runtime, whether
  expected outputs exist, and whether unexpected files were written.
- Inspect `GRAPH_REPORT.md` only after confirming the run stayed inside the
  approved boundary.

## First Scorecard Candidate

Recommended first workflow type:

**Likely non-fit localized task**

Reason: start with a small task where Graphify may not help. If Graphify adds
drag on a tiny localized task, that is useful evidence. It also limits blast
radius before trying orientation-heavy workflows.

Alternative first workflow:

**Code-navigation or BMAD story implementation**

Reason: likely to show value if Graphify works, but it may require broader repo
context and therefore has a larger scope.

## Approval Packet Before Execution

Before any install or run, present Bob with:

```text
Graphify First-Run Approval Packet
- Operation:
- Command proposed:
- Corpus included:
- Corpus excluded:
- Provider boundary:
- Query logging setting:
- Expected writes:
- Explicitly blocked behaviors:
- Stop line:
- Rollback/cleanup path:
```

## Stop Lines

Stop and ask Bob before:

- Installing `graphifyy`.
- Creating `.graphifyignore`.
- Running any `graphify` command.
- Allowing docs, PDFs, images, office files, URLs, media, PR triage, database
  introspection, MCP, HTTP serving, or provider-backed extraction.
- Running `graphify install`, `graphify codex install`, or `graphify hook
  install`.
- Staging or committing generated output.

## Recommendation

Do not run Graphify yet.

Next, pick the first scorecard workflow and convert this proposal into a
specific approval packet with exact command, corpus, expected writes, and
rollback path.
