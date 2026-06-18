# Graphify Current Evidence Decision Packet

Date: 2026-06-18
Status: Bob approved stopping technical runs and preserving evidence

## Purpose

Summarize the Graphify Guided Trial evidence collected so far and recommend the
next decision before approving any wider corpus, provider-backed extraction, or
workflow integration.

## Current State

Graphify has been installed as a uv tool:

- Package: `graphifyy==0.8.41`
- CLI: `graphify`
- Additional executable installed: `graphify-mcp`

No assistant install, hooks, MCP serving, HTTP serving, provider-backed
extraction, or repo writes from Graphify have been performed.

Generated trial outputs live under `/tmp` only.

## Evidence Collected

### Source Behavior Packet

`docs/research/graphify-source-behavior-packet.md`

Key finding:

- Code-only AST extraction can run without a provider.
- Docs/PDF/images may trigger assistant/model-provider semantic extraction.
- Codex install behavior can write `AGENTS.md`, `.codex/hooks.json`, and
  `.agents/skills/graphify/`.

### Explainer And Trial Plan

Created:

- `docs/research/graphify-explainer-for-bob.md`
- `docs/research/graphify-guided-trial-plan.md`
- `docs/research/graphify-first-run-boundary.md`
- `docs/research/graphify-trial-workflows-and-scorecards.md`

### Workflow 1: Likely Non-Fit Localized Task

Evidence:

- `docs/research/graphify-first-run-evidence-2026-06-18.md`
- `docs/research/graphify-first-run-retry-evidence-2026-06-18.md`
- `docs/research/graphify-cluster-only-help-evidence-2026-06-18.md`
- `docs/research/graphify-cluster-only-evidence-2026-06-18.md`
- `docs/research/graphify-baseline-comparison-2026-06-18.md`

Result:

- Initial corpus accidentally triggered provider-boundary protection because
  Graphify classified one file as docs/paper/image content.
- Stricter `.mjs`-only retry succeeded.
- Graphify produced a report with 71 nodes, 179 edges, 7 communities, 100%
  extracted, 0 inferred, 0 ambiguous, and 0 token cost.
- Graphify helped identify central functions and structural relationships in
  `scripts/codex-workspace.mjs` and `scripts/test-codex-workspace.mjs`.
- Baseline source reading still gave more exact behavior detail.

Verdict:

- Safety boundary: pass.
- Understanding: partial pass.
- Usefulness: partial pass.
- Speed/token savings: inconclusive.
- Adoption: no.

### Workflow 2: Code-Navigation / BMAD Story Orientation

Evidence:

- `docs/research/graphify-workflow-2-approval-packet.md`
- `docs/research/graphify-workflow-2-evidence-2026-06-18.md`

Result:

- Code-only run on `scripts/check-token-economy.mjs` succeeded.
- Graphify produced 21 nodes, 21 edges, 2 communities, 100% extracted, 0
  inferred, 0 ambiguous, and 0 token cost.
- Graphify identified the helper read functions as central.
- Graphify did not surface the important semantic purpose of the script: it is
  a drift checker over docs, story requirements, text contracts, and
  token-economy guardrails.
- Baseline source reading was more useful for this one-file drift-check task.

Verdict:

- Safety boundary: pass.
- Understanding: partial pass.
- Usefulness: limited.
- Speed/token savings: fail for this workflow.
- Adoption: no.

### Workflow 3: Multi-File Code-Only Implementation Orientation

Evidence:

- `docs/research/graphify-workflow-3-approval-packet.md`
- `docs/research/graphify-workflow-3-evidence-2026-06-18.md`

Result:

- Code-only run on six dashboard E2E runner scripts succeeded.
- Graphify produced 25 nodes, 30 edges, 4 communities, 100% extracted, 0
  inferred, 0 ambiguous, and 0 token cost.
- Graphify correctly identified `runFocusedDashboardE2E()` as the central hub.
- Graphify identified lifecycle helper functions:
  `dashboardCommand()`, `dashboardArgs()`, `startProcess()`, `waitForUrl()`,
  and `waitForExit()`.
- Baseline source reading was still better for exact behavior, ports, env vars,
  process launch details, and platform branches.

Verdict:

- Safety boundary: pass.
- Understanding: pass for code-structure orientation.
- Usefulness: positive for multi-file code orientation.
- Speed/token savings: partial pass, directional only.
- Adoption: no.

## What Graphify Has Proven

Graphify has proven:

- It can run locally on strict code-only JavaScript corpora without provider
  prompts.
- It can generate source-linked graph JSON and a `GRAPH_REPORT.md` without LLM
  labeling when `cluster-only --no-label --no-viz` is used.
- It exposes extracted/inferred/ambiguous confidence categories.
- It can identify central functions and structural relationships.
- It is most useful so far on multi-file code areas with a shared runner or
  lifecycle function.
- The provider boundary matters; non-code files can trigger API-key/provider
  requirements.

## What Graphify Has Not Proven

Graphify has not proven:

- Speed savings in normal Kendall_Nxt work.
- Token savings after setup overhead.
- Value on documentation-heavy workflows.
- Value on story/doc semantics without provider-backed extraction.
- Savings large enough to justify required or check-or-explain workflow policy.
- Safe assistant integration.
- Safe hooks.
- Safe committed generated outputs.
- A reason to adopt a check-or-explain policy yet.

## Current Recommendation

Do not adopt Graphify yet.

Do not install assistant integration.

Do not add hooks.

Do not commit `graphify-out/`.

Do not include docs or Markdown in Graphify extraction unless Bob explicitly
approves a provider-boundary packet.

Graphify is currently a promising **optional, code-only orientation aid** for
multi-file implementation slices. It is not ready to become a required
workflow, a check-or-explain policy, a docs graph, or a committed repo
artifact.

## Next Decision Options

### Option 1: Stop Technical Runs And Preserve Evidence

Stop running Graphify for now and preserve the evidence as the first guided
trial result.

Pros:

- Avoids unnecessary tool churn.
- Current evidence is enough to state where Graphify helps and where it does
  not.
- Keeps provider-backed documentation extraction out of scope.

Cons:

- Leaves larger codebase and docs-heavy value unresolved.

### Option 2: Continue With A Larger Multi-File Code-Only Trial

Run another no-provider Graphify trial on a broader implementation area where
code structure matters more than Markdown semantics.

Candidate areas:

- A supervisor/dashboard implementation slice.
- A workspace lifecycle code slice larger than two files.
- A test runner plus related implementation files.

Pros:

- Preserves local-only/no-provider boundary.
- Tests Graphify where structural mapping is more likely to help.
- Avoids doc/provider risk.

Cons:

- Still may not evaluate Kendall_Nxt's docs-heavy planning workflows.
- May only prove code-structure usefulness, not full repo-orientation value.

### Option 3: Approve A Doc-Inclusive Provider-Boundary Packet

Run Graphify on selected Markdown docs with an explicit backend/provider
boundary.

Pros:

- Tests the area where Graphify may help Kendall_Nxt most: story/doc/context
  relationships.
- Could evaluate real orientation value across planning artifacts.

Cons:

- Requires provider/API policy decision.
- May send selected docs to a model provider.
- Needs stricter retention, logging, and approval evidence.

## Recommended Next Step

Choose Option 1 next: stop technical runs and preserve evidence.

Reason: Workflow 3 gave Graphify a fairer code-only test and produced a
positive but bounded result. The trial has enough evidence to avoid premature
adoption while preserving a clear next path: larger code-only trial if Bob wants
more code evidence, or a separate provider-boundary packet if Bob wants to test
docs/story semantics.

## Bob Decision

Bob approved stopping technical Graphify runs for now and preserving the
evidence.

Decision implications:

- No further Graphify commands should run without a new approval packet.
- No assistant install, hooks, MCP, HTTP serving, provider-backed extraction, or
  repo integration is approved.
- No `graphify-out/` output should be committed.
- Existing trial evidence should remain available for future review.
- Cleanup of `/tmp` trial output or uninstalling the uv tool requires a
  separate explicit cleanup approval.

## Final Recommendation Record

The current durable recommendation is recorded in
`docs/research/graphify-final-recommendation-2026-06-18.md`.

Summary:

- Do not adopt Graphify yet.
- Keep Graphify as a promising optional code-orientation tool for future
  explicitly approved trials.
- Do not install assistant integration, hooks, committed outputs, or required
  workflow policy.
- Do not run doc/Markdown extraction without a separate provider-boundary
  approval.

## Approval Needed For Any Next Run

Before the next run, create a new approval packet with:

- Exact corpus.
- Exact commands.
- Expected writes.
- Query logging setting.
- Provider boundary.
- Stop lines.
- Rollback/cleanup plan.
