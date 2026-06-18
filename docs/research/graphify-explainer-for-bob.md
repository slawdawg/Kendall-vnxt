# Graphify Explainer For Bob

Date: 2026-06-18
Status: current explainer with completed-trial decision

## Short Version

Graphify is a tool that tries to turn a project folder into a relationship map.
Instead of an agent only searching files one at a time, Graphify can create a
graph that shows related files, concepts, code symbols, docs, and questions.

The reason Kendall_Nxt considered it is simple:

Can Graphify help Codex understand this repo faster and use less context?

The guided trial produced a bounded result: Graphify is promising for optional
strict code-only orientation, but it is not adoption-ready and should not be
installed into repo workflow, hooks, assistant configuration, or committed
generated artifacts.

## What A "Graph" Means Here

Think of a graph as a map of connected things.

- A **node** is a thing, such as a file, function, class, config, document,
  concept, or decision.
- An **edge** is a connection between two things, such as "this file explains
  that workflow" or "this function calls that function."
- A **query** is a question asked against the map, such as "what connects the
  supervisor to scheduled tasks?"

The value would be finding the right starting points faster than broad file
searches or repeated context loading.

## What Graphify Creates

Graphify's docs say the normal output folder is `graphify-out/`.

The main files are:

- `GRAPH_REPORT.md`: a readable report with highlights, key concepts,
  surprising connections, and suggested questions.
- `graph.json`: the full graph data that can be queried later.
- `graph.html`: a browser-viewable graph visualization.

For Kendall_Nxt, the readable report and query behavior are more important than
the visual graph. The graph should help orientation; it should not become source
truth.

## What Graphify Reads

Graphify can read many kinds of project content, including:

- Code files.
- Markdown and other docs.
- YAML, JSON, scripts, and config files.
- PDFs, images, office files, audio, video, URLs, and database schemas when
  optional features are used.

For Kendall_Nxt, the first trial should avoid broad optional features. It should
focus only on the smallest useful repo content.

## What Leaves The Machine

This is the most important safety point.

Graphify's docs say code extraction is local for a code-only corpus. That means
code can be analyzed with local parsing instead of an API call.

But docs, PDFs, and images are different. Graphify's docs say those can go
through the AI assistant or a configured model provider for semantic
extraction.

So the safe rule is:

Do not run Graphify against Kendall_Nxt until Bob approves the exact mode,
content scope, and provider boundary.

## What Graphify Might Change

Graphify is not just a report generator. It also has install commands that can
change assistant behavior.

For Codex, Graphify docs say install behavior may write:

- `AGENTS.md`
- `.codex/hooks.json`
- `.agents/skills/graphify/SKILL.md`
- Graphify sidecar/reference files

That means assistant installation is repo mutation. It should not happen during
source review or the first explainer step.

The completed approved work installed Graphify as a uv tool and ran bounded
temporary code-only trials under `/tmp`. It did not install assistant
integration, add hooks, serve MCP/HTTP, perform provider-backed extraction,
write repo files from Graphify, or commit generated graph output.

## Why It Might Help Kendall_Nxt

Graphify might help if it can:

- Point Codex to the right files faster.
- Reduce broad reads.
- Reduce repeated `rg` searches.
- Reduce token/context usage.
- Surface stale docs or hidden relationships.
- Help new agents understand repo boundaries faster.

The trial must prove this against the current Kendall_Nxt baseline:

1. Read `docs/ai-context/index.md`.
2. Use targeted `rg`.
3. Open narrow source files.
4. Preserve safety, approval, uncertainty, and verification signals.

Graphify must beat or complement good current behavior, not an imaginary weak
workflow.

## What It Must Not Do

Graphify must not:

- Become source truth.
- Override `AGENTS.md`, BMAD guidance, safety contracts, or authority ledgers.
- Hide provider calls or token cost.
- Automatically install hooks.
- Automatically edit repo instructions.
- Commit generated graph output before the trial proves it is useful.
- Make Bob approve something he cannot understand.

## Proposed Safe Trial Boundary

If Bob later approves another technical trial, the safest boundary remains:

- No assistant install.
- No hooks.
- No MCP serving.
- No HTTP serving.
- No committed `graphify-out/`.
- No provider-backed extraction unless explicitly approved.
- Query logging disabled or redirected.
- Run only on a deliberately chosen small corpus first.
- Treat all Graphify output as orientation evidence that still needs source
  confirmation.

## Current Decision

After the guided trial, Bob chose to stop technical Graphify runs for now and
preserve the evidence. The current durable recommendation is:

- do not adopt Graphify yet;
- keep it as a promising optional code-only orientation tool for future
  explicitly approved trials;
- do not install assistant integration, hooks, provider-backed extraction, or
  committed `graphify-out/`;
- treat Graphify output as orientation evidence only, with source files
  remaining authoritative.

## Glossary

- **Baseline:** The current normal way Codex orients in Kendall_Nxt:
  `docs/ai-context/index.md`, targeted `rg`, and narrow source reads.
- **Graph:** A map of connected repo concepts, files, and code relationships.
- **Node:** One item in the graph, such as a file, function, or concept.
- **Edge:** A connection between two nodes.
- **Query:** A question asked against the graph.
- **Freshness:** Whether the graph still matches the current repo state.
- **Scorecard:** A trial-only before/after note showing whether Graphify helped.
- **Check-or-explain:** A possible final rule where agents either check
  Graphify for relevant work or explain why they skipped it.

## Bottom Line

Graphify might be useful, but it has enough power to change workflow behavior
that Kendall_Nxt should not adopt it casually.

The right next move is not more technical running by default. Preserve the
current evidence, use the final recommendation as the decision record, and
require a new approval packet for any future Graphify command.
