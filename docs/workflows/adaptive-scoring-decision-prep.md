# Adaptive Scoring Decision Preparation

Date: 2026-06-21
Status: decision-preparation package, no execution authority granted

## Purpose

This package lets the operator review whether Kendall_Nxt should later request
exact approval for adaptive scoring. It is a source-owned decision surface, not
a scoring implementation.

The package answers one question:

```text
Is adaptive scoring worth a future exact approval packet?
```

It does not compute, store, display, apply, or act on adaptive scores.

## Research Anchors

Primary sources reviewed for this package:

- NIST AI Risk Management Framework 1.0:
  `https://www.nist.gov/itl/ai-risk-management-framework`
- NIST AI RMF Knowledge Base:
  `https://airc.nist.gov/airmf-resources/airmf/`
- OECD AI Principles:
  `https://oecd.ai/en/ai-principles`
- ISO/IEC 42001:2023 overview:
  `https://www.iso.org/standard/42001`

Accessed: 2026-06-21.

Decision-prep requirements drawn from that research:

- NIST AI RMF and AIRC: use governance before scoring behavior and map the
  intended use, affected decisions, lifecycle actors, measurement plan, and
  management response before approval.
- OECD AI Principles: require transparent, explainable, accountable, robust,
  secure, safe, and human-centered review evidence before AI-derived
  recommendations can influence decisions.
- ISO/IEC 42001: preserve management-system traceability, review ownership,
  rollback, and continual improvement controls.
- Kendall_Nxt policy: keep the current lane metadata-only until a future exact
  approval says otherwise.

## Current Authority

Authority family: `adaptive-scoring`

Current status: `decision_only_no_authority_granted`

Allowed in this package:

- describe candidate scoring inputs as metadata-only signals;
- describe excluded inputs and forbidden retention;
- define future approval packet fields;
- add source-owned documentation, static checks, and read-only report language;
- use party-mode review as planning evidence without retaining raw prompts or
  treating agent discussion as approval.

Not allowed in this package:

- compute an adaptive score;
- persist an adaptive score;
- display a score, rank, recommendation score, or confidence score;
- let a score affect priority, routing, delivery, cleanup, authority, merge, or
  verification behavior;
- call local or remote providers;
- launch workers or subscription-agent processes;
- read credentials, sessions, prompts, completions, provider payloads, or raw
  source copies as scoring input;
- bypass failed checks.

## Candidate Metadata Signals

Future scoring, if separately approved, may only consider metadata classes that
are already safe to expose in read-only reports:

- verification status class, such as passed, failed, skipped, or blocked;
- authority family and approval state;
- report/catalog presence;
- work-item lifecycle state;
- age and staleness metadata;
- review state metadata;
- explicit operator-supplied labels only as context, not as a self-reinforcing
  priority input unless a future approval packet handles amplification risk;
- retained evidence references, not evidence payloads.

Excluded inputs:

- raw prompts, completions, reasoning traces, and provider payloads;
- secrets, tokens, credentials, sessions, browser profiles, SSH keys, and cloud
  credentials;
- copied source content beyond file path, commit, branch, and report metadata;
- customer, account, production, or external-system data;
- hidden worker outputs or background process output.

## Future Approval Packet Requirements

A future adaptive scoring approval packet must name:

- authority family: `adaptive-scoring`;
- exact operation, such as metadata-only dry-run scoring;
- intended use statement and affected decision surfaces;
- lifecycle actors, named reviewer ownership, named operator ownership, and
  escalation owner for reviewer/operator conflicts;
- target report, API, or workflow surface;
- approved input metadata fields;
- prohibited inputs;
- output fields and whether they may be displayed, including display-only
  report or dashboard surfaces;
- whether scores are advisory-only or may affect any downstream state;
- retained evidence and redaction policy;
- measurement plan, calibration method, failure thresholds, and management
  response owner;
- fake/local fixture set and negative test cases;
- fairness, transparency, and explainability review path;
- monitoring cadence, drift response, and continual improvement cadence,
  criteria, owner, and resulting action path;
- operator appeal or override handling and escalation path;
- verification commands;
- rollback path;
- stop lines;
- expiry or review point;

If any field is missing, stale, ambiguous, or contradicted by current repo or
GitHub state, the lane remains blocked.

If reviewer ownership, operator ownership, management response ownership, or
appeal escalation conflicts are unresolved, the lane remains blocked.

## Acceptance Criteria

- The package remains source-owned and clean-install safe.
- The package distinguishes decision preparation from scoring execution.
- The active verification chain includes `pnpm run check:adaptive-scoring`.
- Static checks fail if executable adaptive scoring markers appear in runtime
  source without a future approval package.
- Runbooks and verification readiness reports surface the new check.
- The authority matrix continues to say adaptive scoring is blocked pending
  explicit approval.

## Stop Lines

- Do not run adaptive scoring.
- Do not compute or persist adaptive scores.
- Do not let scores change work priority, routing, delivery, cleanup,
  authority, merge, or verification behavior.
- Do not call providers, launch processes, mutate source by workers, read
  credentials, or bypass failed checks.
- Do not treat this package, party-mode review, research, CI success, or generic
  continuation language as approval.
