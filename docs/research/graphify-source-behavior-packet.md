# Graphify Source Behavior Packet

Date: 2026-06-18
Status: source behavior packet

## Purpose

Capture primary-source facts about Graphify before Kendall_Nxt installs, runs,
or adopts it. This packet supports the Graphify Guided Trial plan and blocks
implementation until Bob explicitly approves any install or file-writing step.

## Sources Checked

- PyPI project page: `https://pypi.org/project/graphifyy/`
- PyPI JSON metadata: `https://pypi.org/pypi/graphifyy/json`
- GitHub repository: `https://github.com/safishamsi/graphify`
- GitHub license file: `https://github.com/safishamsi/graphify/blob/v8/LICENSE`

## Package And Install Facts

| Item | Verified behavior |
| --- | --- |
| Package name | `graphifyy` on PyPI |
| CLI command | `graphify` |
| Latest release seen | `0.8.41`, released 2026-06-17 |
| Python requirement | Python 3.10+ |
| Recommended install | `uv tool install graphifyy` |
| Alternatives | `pipx install graphifyy`, `pip install graphifyy` |
| License | MIT License, copyright 2026 Safi Shamsi |
| Repository | `safishamsi/graphify` on GitHub |

## What Graphify Claims To Do

Graphify presents itself as an AI coding assistant skill that maps project
content into a queryable knowledge graph. It advertises support for Codex and
other coding assistants.

The documented assistant command builds a graph for a folder:

```bash
/graphify .
```

For PowerShell or terminal use, the docs say to use:

```bash
graphify .
```

The docs also say Codex uses `$graphify` instead of `/graphify` inside the
assistant.

## Main Outputs

Primary docs describe a default `graphify-out/` output folder with:

| Output | Purpose |
| --- | --- |
| `graph.html` | Browser-viewable graph visualization |
| `GRAPH_REPORT.md` | Human-readable highlights, concepts, connections, and suggested questions |
| `graph.json` | Full graph used for later queries |

Other commands can produce additional outputs, such as call-flow HTML, wiki
output, SVG, GraphML, Neo4j/FalkorDB export files, and MCP serving behavior.

## Inputs And File Types

Graphify documents support for:

- Code files across many tree-sitter grammars.
- Salesforce Apex.
- Terraform and HCL with the relevant extra.
- MCP config files.
- Docs such as Markdown, text, RST, YAML, HTML, and MDX.
- Office files with the `office` extra.
- Google Workspace shortcuts with the `google` extra plus Google Workspace CLI
  authentication.
- PDFs.
- Images.
- Video, audio, YouTube, and URLs with the `video` extra.
- SQL schema and PostgreSQL introspection with optional extras or flags.

For Kendall_Nxt, the important immediate scope is code, Markdown docs, YAML,
JSON, scripts, PowerShell, TypeScript/JavaScript, Python, and repository config
files. Media, Google Workspace, live database introspection, URL fetching, PR
triage, and remote serving should remain out of scope unless separately
approved.

## Local Versus Provider Behavior

The primary docs draw a clear boundary:

- Code extraction is documented as local AST extraction through tree-sitter and
  does not require an API key for a code-only corpus.
- Video/audio transcription is documented as local through faster-whisper.
- Docs, PDFs, and images are documented as going through the AI assistant's
  model API for semantic extraction when using the assistant skill.
- Headless `graphify extract` can use provider backends such as Gemini, Kimi,
  Claude, OpenAI, DeepSeek, Azure, Bedrock, Ollama, or Claude CLI depending on
  configured keys or backend flags.
- Provider auto-detection is documented for headless extraction based on
  available API keys.

**Kendall_Nxt implication:** a code-only trial may be local-only, but a normal
Kendall_Nxt trial that includes Markdown docs may trigger model/provider usage
unless the run mode, backend, and corpus are explicitly controlled. Do not run
Graphify against the repo until Bob approves the exact mode and provider
boundary.

## Assistant Install And Mutation Behavior

Graphify provides assistant install commands. The documented Codex-related
behaviors matter for Kendall_Nxt:

- `graphify install --project --platform codex` is documented as project-scoped
  installation.
- Project-scoped installs can write files under the current directory, including
  examples such as `.agents/skills/graphify/SKILL.md` and a `references/`
  sidecar.
- Codex-specific always-on install is documented as writing to `AGENTS.md`.
- The docs also state Codex install adds a PreToolUse hook in
  `.codex/hooks.json` before Bash tool calls.
- Uninstall commands exist, including `graphify uninstall`,
  `graphify uninstall --purge`, and
  `graphify uninstall --project --platform codex`.

**Kendall_Nxt implication:** assistant installation is repo mutation and must
not be run during source review. Any future project-scoped install requires a
preview or controlled sandbox, explicit Bob approval, and a rollback plan.

## Hooks, Refresh, And Team Setup

Graphify documents:

- `graphify hook install` for post-commit/post-checkout hooks.
- Auto-rebuild after each commit for AST-only refresh.
- Git merge-driver behavior for `graph.json`.
- A team setup recommendation to commit `graphify-out/`.
- Suggested local-only ignore handling for `graphify-out/cost.json` and
  optional cache treatment.

**Kendall_Nxt implication:** these are Graphify recommendations, not
Kendall_Nxt decisions. During the guided trial, generated outputs should stay
local-only, hooks should remain disabled, and committed `graphify-out/` should
be deferred.

## Querying And Serving

Graphify documents direct query commands:

```bash
graphify query "show the auth flow"
graphify path "A" "B"
graphify explain "SomeConcept"
```

It also documents MCP serving over stdio or HTTP. HTTP serving can bind beyond
localhost and supports an API key option.

**Kendall_Nxt implication:** CLI queries against a local graph may be a useful
trial mechanism. MCP serving and HTTP exposure should remain out of scope for
the first guided trial.

## Logging And Privacy Notes

The docs state:

- No telemetry, usage tracking, or analytics.
- Query commands and MCP `query_graph` calls log JSON Lines records to
  `~/.cache/graphify-queries.log` by default.
- Full subgraph responses are not logged by default.
- Query logging can be disabled with `GRAPHIFY_QUERY_LOG_DISABLE=1` or pointed
  at `/dev/null`.

**Kendall_Nxt implication:** even local query logs are retained outside the repo
by default. A trial run should either disable query logging or explicitly record
that local query logs are allowed for the trial.

## Documented Best Practices To Evaluate, Not Adopt Yet

Graphify's own docs recommend or support several practices that Kendall_Nxt
should evaluate rather than import automatically:

- Project-scoped assistant install.
- Always-on assistant guidance.
- Query-first orientation.
- `.graphifyignore`.
- Committing `graphify-out/` for team use.
- Installing hooks for refresh and graph merge behavior.
- Serving graph data through MCP.
- Using `GRAPH_REPORT.md` for broad architecture review.

## Initial Safety Classification

| Behavior | Initial classification | Reason |
| --- | --- | --- |
| Reading code files for AST extraction | Candidate low risk | Documented local-only for code-only corpus, but still needs controlled run evidence. |
| Reading Markdown/docs | Gated | Docs may go through model API during semantic extraction. |
| Creating `graphify-out/` | Gated local write | Generated output should stay local-only during trial. |
| Installing Codex guidance | Blocked until explicit approval | May write `AGENTS.md`, `.codex/hooks.json`, and `.agents/skills`. |
| Installing hooks | Blocked until explicit approval | Changes git behavior and can run automatically. |
| Committing `graphify-out/` | Blocked until trial evidence | Could create stale generated truth and repo noise. |
| MCP stdio serving | Defer | Not needed for first source understanding. |
| HTTP serving | Blocked | Can expose graph data outside localhost if configured. |
| Provider-backed extraction | Blocked until explicit approval | May send repo docs or other content to external services. |
| Query logging | Gated | Local retained logs exist by default. |

## Recommended First Trial Boundary

The safest first technical trial, if Bob approves later, should be:

1. No assistant install.
2. No hooks.
3. No MCP serving.
4. No HTTP serving.
5. No committed `graphify-out/`.
6. No provider-backed extraction unless explicitly approved.
7. Query logging disabled or redirected.
8. Run only against a deliberately chosen small corpus first.
9. Treat all outputs as orientation evidence requiring source confirmation.

## Open Questions Before Any Run

- Can a useful Kendall_Nxt first pass be restricted to code/config files only,
  avoiding Markdown docs and provider-backed semantic extraction?
- If Markdown docs are needed for real value, which backend is acceptable:
  assistant session, explicit provider, local Ollama, or no run yet?
- Where should generated output live during the trial if not committed?
- Should `.graphifyignore` be drafted before the first run to exclude secrets,
  generated files, local state, large outputs, and ignored directories?
- Should query logging be disabled for the trial by default?
- What four concrete Kendall_Nxt workflows will be used for the scorecards?

## Stop Lines

Stop and ask Bob before:

- Installing `graphifyy`.
- Running `graphify` against the repository.
- Running `graphify install`, `graphify codex install`, or any project-scoped
  assistant install command.
- Installing hooks.
- Running any provider-backed extraction.
- Serving graph data over MCP or HTTP.
- Committing generated outputs.
- Reading credentials, sessions, raw provider payloads, prompt/completion logs,
  reasoning traces, or secrets.

## Next Work

1. Create a one-page Bob-readable Graphify explainer from this packet.
2. Review `docs/research/graphify-first-run-boundary.md`.
3. Ask Bob whether to approve installation and a limited local trial.
