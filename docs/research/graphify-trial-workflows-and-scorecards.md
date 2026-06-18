# Graphify Trial Workflows And Scorecards

Date: 2026-06-18
Status: historical workflow candidates; technical runs stopped and evidence preserved

## Purpose

Select concrete Kendall_Nxt workflow candidates for the Graphify Guided Trial
and define the scorecard format for each run.

This document did not approve installing Graphify, running Graphify, creating
`.graphifyignore`, writing generated outputs, or changing assistant behavior.
The trial evidence has since been collected and summarized in
`docs/research/graphify-current-evidence-decision-packet-2026-06-18.md` and
`docs/research/graphify-final-recommendation-2026-06-18.md`.

## Historical Trial Order Recommendation

The historical recommendation was to start with the likely non-fit localized
task. This gave Kendall_Nxt evidence about when Graphify should be skipped and
kept the first technical trial small.

Historical recommended order:

1. Likely non-fit localized task.
2. Code-navigation or BMAD story implementation.
3. Documentation or context update.
4. Governance or safety-boundary review.

## Workflow 1: Likely Non-Fit Localized Task

**Candidate task:** Review one narrow research/planning document for Graphify
trial readiness.

**Candidate files:**

- `docs/research/graphify-explainer-for-bob.md`
- `docs/research/graphify-source-behavior-packet.md`
- `docs/research/graphify-first-run-boundary.md`

**Why this is included:** Graphify may not help much when the relevant files are
already known and narrow. If Graphify adds extra steps without improving
understanding, that is useful evidence for the future check-or-explain policy.

**Expected value:** Possibly low.

**Success looks like:** Graphify either surfaces a real missed relationship
between the Graphify docs, or the scorecard clearly shows this task should skip
Graphify in final use.

## Workflow 2: Code-Navigation Or BMAD Story Implementation

**Candidate task:** Orient on a story implementation slice and identify the
story, related docs, nearby code/tests, and verification path.

**Candidate starting point:**

- `docs/stories/21-4-token-economy-measurement-readiness.md`

**Candidate related docs:**

- `docs/research/token-economy-measurement-readiness.md`
- `docs/research/token-economy-tool-evaluation.md`
- `docs/ai-context/index.md`

**Why this is included:** This resembles normal BMAD implementation
orientation. Graphify may help by mapping story, research guidance, and nearby
implementation or verification paths.

**Expected value:** Likely useful if Graphify can identify relationships faster
than the baseline.

**Success looks like:** Graphify reduces broad reads or wrong turns while still
requiring source confirmation before decisions.

## Workflow 3: Documentation Or Context Update

**Candidate task:** Orient on Linux install/fresh VM documentation and identify
which docs and evidence files are relevant to a focused update.

**Candidate starting points:**

- `docs/linux-install/index.md`
- `docs/linux-install/implementation-plan.md`
- `docs/linux-install/validation-matrix.md`
- `docs/linux-install/evidence/schema.md`

**Why this is included:** Documentation areas can have many cross-links and
evidence files. Graphify may help surface stale, duplicated, or missing
relationships.

**Expected value:** Possibly useful, but this may require Markdown semantic
extraction and therefore a separate provider-boundary decision.

**Success looks like:** Graphify identifies relevant docs and relationships
faster than the baseline without hiding stale or unsupported claims.

## Workflow 4: Governance Or Safety-Boundary Review

**Candidate task:** Orient on execution/provider authority boundaries and
identify which documents define stop lines, approval gates, and evidence
requirements.

**Candidate starting points:**

- `docs/architecture/kendall-vnxt-execution-authority-approval-checkpoints-2026-06-08.md`
- `docs/architecture/kendall-vnxt-execution-readiness-and-evidence-policy-2026-06-08.md`
- `docs/research/token-economy-measurement-readiness.md`
- `docs/goals/local-provider-execution-approval-packet-2026-06-13.md`
- `docs/goals/premium-execution-approval-packet-2026-06-13.md`

**Why this is included:** This is a high-risk relationship-mapping task.
Graphify may help find boundary documents, but any wrong or stale relationship
could create safety risk.

**Expected value:** Useful only if accurate and source-linked.

**Success looks like:** Graphify helps discover relevant authority boundaries
without claiming authority or obscuring required approvals.

## Scorecard Template

Use one copy per workflow.

```text
Graphify Guided Trial Scorecard

Workflow:
Task objective:
Date:
Agent:

Baseline Path
- Starting sources:
- Context loaded:
- Repo searches run:
- Files opened:
- Time to first useful context:
- Total time:
- Estimated token/context usage:
- Baseline result:
- Baseline uncertainty or wrong turns:

Graphify-Assisted Path
- Graphify command or mode:
- Corpus included:
- Corpus excluded:
- Provider boundary:
- Query logging setting:
- Expected writes:
- Actual writes:
- Graphify outputs inspected:
- Source confirmation performed:
- Time to first useful context:
- Total time:
- Estimated token/context usage:
- Graphify result:
- Graphify uncertainty or wrong turns:

Comparison
- What Graphify helped find:
- What Graphify missed:
- What Graphify made confusing:
- Wrong or unsupported Graphify claims:
- Files/searches reduced:
- Files/searches added:
- Speed impact:
- Token/context impact:
- Decision quality impact:
- Safety or governance issues:

Bob-Readable Decision Card
- What Graphify did:
- What changed compared with baseline:
- What risk this controls or introduces:
- Evidence observed:
- Could Bob explain what Graphify contributed? yes/no
- Recommendation: reject / retry later / optional use / limited workflow use / check-or-explain adoption
- Stop or rollback line:

Verdict: pass / fail / inconclusive
Notes:
```

## Historical Approval Packet Template

This was the approval packet template before any install or run.

```text
Graphify First-Run Approval Packet

Operation:
Command proposed:
Working directory:
Corpus included:
Corpus excluded:
Provider boundary:
Query logging setting:
Expected writes:
Explicitly blocked behaviors:
Stop line:
Rollback/cleanup path:
Scorecard file or section:
```

## Historical First Approval Packet Draft

This draft was historical planning material only. Do not use it for future
Graphify runs; future runs need a new approval packet scoped to `/tmp` output
and the current final recommendation.

```text
Graphify First-Run Approval Packet

Operation:
- Install Graphify only if needed, then run a small local code/config-oriented trial for the likely non-fit localized task.

Command proposed:
- Not final. Must be confirmed after install docs and local tool help are available.

Working directory:
- Historical draft only. Future runs must not use repo root as the Graphify
  working directory without a new explicit approval.

Corpus included:
- Candidate Graphify research docs only if provider boundary is explicitly approved, or a narrower code/config-only substitute if no provider-backed extraction is approved.

Corpus excluded:
- Dependencies, generated files, BMAD output, local workspace state, credentials, sessions, provider payloads, media, office files, URLs, docs outside the approved corpus, and generated graph output.

Provider boundary:
- No provider-backed extraction unless Bob explicitly approves it.

Query logging setting:
- Disable query logging with `GRAPHIFY_QUERY_LOG_DISABLE=1` unless a local evidence log is explicitly approved.

Expected writes:
- Historical draft only. Future runs must keep generated output under an
  explicitly approved `/tmp` path unless a new approval says otherwise.
- No committed generated output.

Explicitly blocked behaviors:
- Assistant install, Codex install, hooks, MCP serving, HTTP serving, committed `graphify-out/`, provider-backed extraction, GitHub mutation, cleanup, and edits to `AGENTS.md`, `.codex/`, or `.agents/`.

Stop line:
- Stop on any unexpected write, provider prompt, install side effect, hook creation, credential/session access, or command behavior outside the approved packet.

Rollback/cleanup path:
- Delete generated local trial output after evidence capture if Bob approves cleanup.
- Do not run uninstall commands unless an install step was approved and performed.

Scorecard file or section:
- Use this document's scorecard template under Workflow 1.
```

## Current Next Work

Do not continue these workflow candidates without a new approval packet.

Bob approved stopping technical Graphify runs and preserving evidence. The
current recommendation is to keep Graphify optional for future explicitly
approved, strict code-only trials and not adopt any repo integration or
check-or-explain policy yet.
