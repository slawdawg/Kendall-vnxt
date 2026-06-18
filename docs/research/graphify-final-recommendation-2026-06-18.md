# Graphify Final Recommendation

Date: 2026-06-18
Status: current recommendation

## Decision

Do not adopt Graphify into Kendall_Nxt yet.

Keep Graphify as a promising optional code-orientation tool for future
explicitly approved trials.

## Findings

Graphify has shown value for multi-file code orientation when the corpus is
strictly code-only and tightly bounded.

The strongest positive evidence came from Workflow 3:

- Corpus: six dashboard E2E runner `.mjs` files.
- Graphify identified `runFocusedDashboardE2E()` as the central hub.
- Graphify surfaced related lifecycle helpers:
  `dashboardCommand()`, `dashboardArgs()`, `startProcess()`, `waitForUrl()`,
  and `waitForExit()`.
- Output was 100% `EXTRACTED`, 0% `INFERRED`, 0% `AMBIGUOUS`.
- Report showed 0 input and 0 output token cost.
- No provider prompt appeared.
- No repo writes were observed.

Graphify was weaker where the important meaning lived in docs or text
contracts rather than code structure.

The strongest negative/limited evidence came from Workflow 2:

- Corpus: `scripts/check-token-economy.mjs`.
- Graphify identified file-reading helpers as central.
- It did not surface the script's real semantic purpose: verifying docs,
  story requirements, required text contracts, and token-economy guardrails.
- Baseline source reading was more useful for that workflow.

The safety boundary is real and important:

- Strict code-only corpora can run locally without provider use.
- Non-code files can trigger provider/API-key requirements.
- Graphify docs indicate docs, PDFs, and images may use assistant/model
  semantic extraction.
- Graphify assistant install behavior can mutate repo or user configuration,
  including `AGENTS.md`, `.codex/hooks.json`, and `.agents/skills/graphify/`.

## Recommendation

Do not:

- Bake Graphify into `AGENTS.md`.
- Install Graphify assistant integration.
- Install Graphify hooks.
- Commit `graphify-out/`.
- Make Graphify required.
- Adopt a check-or-explain policy yet.
- Run Graphify over docs/Markdown without a separate provider-boundary
  approval.

Allow, with explicit approval:

- Future strict code-only Graphify trials for multi-file implementation areas.
- Temporary `/tmp` output only.
- Query logging disabled.
- `cluster-only --no-label --no-viz` when a readable report is needed without
  LLM community naming.

Treat Graphify output as orientation evidence only. Source files remain the
authority for implementation, safety, policy, and verification decisions.

## Current Disposition

Graphify is promising but not adoption-ready.

It may become useful as an optional code-orientation aid after more evidence,
especially for multi-file implementation areas. It is not ready to become a
Kendall_Nxt workflow policy or durable repo integration.

## Evidence References

- `docs/research/graphify-source-behavior-packet.md`
- `docs/research/graphify-baseline-comparison-2026-06-18.md`
- `docs/research/graphify-workflow-2-evidence-2026-06-18.md`
- `docs/research/graphify-workflow-3-evidence-2026-06-18.md`
- `docs/research/graphify-current-evidence-decision-packet-2026-06-18.md`
