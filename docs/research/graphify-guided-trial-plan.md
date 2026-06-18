# Graphify Guided Trial Plan

Date: 2026-06-18
Status: completed guided trial plan; technical runs stopped and evidence preserved

## Purpose

Define a Bob-readable, evidence-first trial for deciding whether Graphify should
become part of Kendall_Nxt's normal orientation workflow.

This plan did not adopt Graphify. It created a controlled path to understand
what Graphify does, verify current tool behavior from primary sources, compare
Graphify-assisted work against Kendall_Nxt's current baseline, and decide
whether any later implementation is justified.

Current result: the guided trial is complete enough for a durable decision.
Bob approved stopping technical Graphify runs and preserving evidence. The
current recommendation is recorded in
`docs/research/graphify-final-recommendation-2026-06-18.md`.

## Plain-English Starting Point

Graphify is being considered as a codebase relationship map for AI coding work.
The hoped-for value is that it may help Codex find related files, concepts,
decisions, and boundaries faster than reading folders one at a time.

That is a hypothesis, not a conclusion. Before Kendall_Nxt treats Graphify as a
best practice, Bob should be able to understand:

- What Graphify reads.
- What Graphify creates.
- Whether anything leaves the machine.
- Whether it changes repo instructions, skills, hooks, or generated artifacts.
- What it helps Codex find faster.
- What it gets wrong, misses, or makes confusing.
- How to turn it off or roll it back.

## Source Verification Gate

Before any install, wrapper, generated artifact, or trial run, collect primary
source evidence for Graphify's current behavior:

- Official project site or repository.
- Package name, install command, and CLI command.
- Documented inputs and outputs.
- Whether analysis is local-only or can call external providers.
- Whether it writes files such as reports, graph JSON, HTML, skills, hooks, or
  assistant instructions.
- Recommended best practices from Graphify's own documentation.
- License and maintenance status.

Unverified claims from the brainstorming session must remain labeled as
candidate assumptions until this source packet exists.

## Current Baseline

Graphify must be compared against Kendall_Nxt's current competent orientation
workflow:

1. Read the smallest relevant guidance from `docs/ai-context/index.md`.
2. Use targeted `rg` searches.
3. Open narrow source files only when needed.
4. Preserve safety, approval, verification, uncertainty, and Bob steering
   signals.

Graphify should not be compared against an unstructured or intentionally weak
baseline.

## Historical Trial Scope

The guided trial was designed to test four workflow types:

| Workflow | Why it is included | Expected Graphify fit |
| --- | --- | --- |
| Code-navigation or BMAD story implementation | Tests whether Graphify helps find stories, tests, contracts, and nearby code faster. | Likely useful |
| Documentation or context update | Tests whether Graphify surfaces related docs and stale links. | Possibly useful |
| Governance or safety-boundary review | Tests whether Graphify can assist without overriding authority, safety, or source/evidence boundaries. | High risk, useful if accurate |
| Likely non-fit localized task | Tests whether Graphify adds unnecessary drag when the task is already narrow. | Possibly not useful |

## Out Of Scope During Trial

The trial does not approve:

- Automatic hooks.
- Provider-backed refresh.
- Paid usage.
- Credential, session, prompt, completion, reasoning trace, provider payload, or
  secret inspection.
- Committed generated graph outputs.
- Automatic edits to `AGENTS.md`, `.agents/`, `.codex/`, BMAD artifacts, or
  workflow instructions.
- GitHub mutation, cleanup, merge, or branch deletion.
- Treating Graphify output as source truth.
- A final adoption policy.

Any scope expansion requires a separate explicit approval.

## Historical Trial Method

For each workflow, the plan was to run or reconstruct two comparable paths:

1. **Baseline path:** Use `docs/ai-context/index.md`, targeted `rg`, and narrow
   source reads.
2. **Graphify-assisted path:** Use Graphify orientation first, then confirm any
   important claim against source files.

The Graphify-assisted path could win only if it improved understanding, speed,
or token/context use without reducing decision quality or hiding authority
boundaries.

## Trial-Only Scorecard

Use this packet for each workflow. It is trial evidence, not permanent ceremony.

```text
Graphify Guided Trial Scorecard
- Workflow type:
- Task objective:
- Baseline method used:
- Graphify-assisted method used:
- Files and sources read:
- Repo searches run:
- Time to first useful context:
- Total time:
- Estimated token/context usage:
- What Graphify helped find:
- What Graphify missed or made confusing:
- Wrong or unsupported Graphify claims:
- Safety or governance issues:
- Bob-readable explanation:
- Could Bob explain what Graphify contributed? yes/no
- Verdict: pass / fail / inconclusive
- Notes:
```

## Pass/Fail Gates

Graphify must pass all relevant gates before any adoption recommendation.

| Gate | Pass condition | Fail condition |
| --- | --- | --- |
| Understanding | Bob can explain what Graphify added beyond the baseline in plain language. | Graphify output looks impressive but remains opaque. |
| Speed/token | Graphify shows meaningful savings on repeated relevant workflows. A 20-30% directional improvement is a candidate threshold, not a hard rule. | Savings are cosmetic, unmeasured, or offset by extra workflow drag. |
| Decision quality | Graphify preserves or improves correctness and source discovery. | It causes missed context, wrong ownership assumptions, or unsupported conclusions. |
| Freshness | Outputs expose source paths, timestamp or commit context where relevant, and uncertainty. | Stale graph output becomes hidden context. |
| Authority | Graphify suggests, summarizes, and routes only. | It authorizes mutation, provider calls, cleanup, GitHub actions, or policy exceptions. |

## Decision Cards

Each workflow result should end with a short Bob-readable decision card:

```text
Decision Card
- What Graphify did:
- What changed compared with baseline:
- What risk this controls or introduces:
- Evidence observed:
- Recommendation: reject / retry later / optional use / limited workflow use / check-or-explain adoption
- Stop or rollback line:
```

## Historical Final Decision Options

The original plan considered these possible outcomes after scorecard review:

- **Reject:** Graphify does not improve understanding, speed, or token use
  enough to justify adoption.
- **Retry later:** Graphify may be useful, but current evidence, maturity, or
  source clarity is insufficient.
- **Optional use:** Agents may consult Graphify, but it is not expected.
- **Limited workflow use:** Graphify is expected for specific orientation-heavy
  workflows only.
- **Check-or-explain adoption:** For Graphify-relevant workflows, agents check
  Graphify or briefly explain why they skipped it.

## Historical Candidate Final Policy If Trial Passes

If the evidence had supported adoption, the preferred policy candidate was:

For Graphify-relevant workflows, agents must either check Graphify for
orientation or briefly explain why they skipped it.

The trial evidence did not support adopting this policy. Graphify remains
optional for future explicitly approved code-only trials.

## Current Next Work

Do not run additional Graphify commands from this plan. The current durable
decision is:

- do not adopt Graphify yet;
- keep it optional for future explicit code-only trials;
- do not install assistant integration, hooks, MCP, HTTP serving, provider-backed
  extraction, or committed `graphify-out/`;
- use `docs/research/graphify-final-recommendation-2026-06-18.md` and
  `docs/research/graphify-current-evidence-decision-packet-2026-06-18.md` as
  the current decision records.

Any future technical run needs a new approval packet.

## References

- `_bmad-output/brainstorming/brainstorming-session-2026-06-17-233602.md`
- `docs/ai-context/index.md`
- `docs/research/graphify-explainer-for-bob.md`
- `docs/research/graphify-cluster-only-help-evidence-2026-06-18.md`
- `docs/research/graphify-cluster-only-evidence-2026-06-18.md`
- `docs/research/graphify-baseline-comparison-2026-06-18.md`
- `docs/research/graphify-current-evidence-decision-packet-2026-06-18.md`
- `docs/research/graphify-final-recommendation-2026-06-18.md`
- `docs/research/graphify-cleanup-approval-packet-2026-06-18.md`
- `docs/research/graphify-first-run-evidence-2026-06-18.md`
- `docs/research/graphify-first-run-retry-evidence-2026-06-18.md`
- `docs/research/graphify-first-run-boundary.md`
- `docs/research/graphify-first-run-approval-packet.md`
- `docs/research/graphify-source-behavior-packet.md`
- `docs/research/graphify-trial-workflows-and-scorecards.md`
- `docs/research/graphify-workflow-2-approval-packet.md`
- `docs/research/graphify-workflow-2-evidence-2026-06-18.md`
- `docs/research/graphify-workflow-3-approval-packet.md`
- `docs/research/graphify-workflow-3-evidence-2026-06-18.md`
- `docs/research/token-economy-tool-evaluation.md`
- `docs/research/token-economy-measurement-readiness.md`
