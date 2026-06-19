---
date: 2026-06-19
status: decision research
topic: BMAD workflow compression
input_documents:
  - docs/handoffs/codex-handoff-2026-06-19-non-orchestrator-backlog.md
  - docs/research/non-orchestrator-backlog-decision-matrix-2026-06-19.md
  - docs/ai-context/index.md
  - AGENTS.md
---

# BMAD Workflow Compression Decision Packet

## Executive Summary

BMAD workflow compression should reduce ceremony for small, low-risk changes
without weakening Kendall_Nxt's safety, authority, evidence, or delivery
guardrails.

Recommended decision:

1. Keep full BMAD flow for product behavior, governance, architecture,
   cross-boundary implementation, execution authority, and user-facing workflow
   changes.
2. Allow story-only or focused-check paths for narrow implementation,
   documentation, test, and local workflow improvements.
3. Allow no-formal-artifact changes only when the change is small, local,
   reversible, low-risk, and covered by existing context.
4. Require explicit approval packets for authority-sensitive operations
   regardless of artifact size.

This packet is research input, not a governance rule change by itself. If Bob
wants these thresholds to become binding policy, promote them into a mini-PRD
or update the repo governance docs through the appropriate BMAD workflow.

## Compression Goal

Compression should make the common path shorter:

```text
small safe change -> focused context -> targeted edit -> targeted verification -> concise evidence
```

It should not create a shortcut around:

- execution/provider/worker authority;
- GitHub delivery and merge gates;
- cleanup and deletion;
- source/evidence retention rules;
- secrets or credential handling;
- product behavior decisions;
- architecture decisions;
- safety validation.

## Proposed Thresholds

| Change Type | Minimum Artifact | Required Evidence | Notes |
| --- | --- | --- | --- |
| Tiny docs typo, link fix, or narrow wording correction | No formal BMAD artifact | Diff and final status | Existing doc context must be enough. |
| Narrow docs addition or local workflow note | Focused research/check packet or direct commit summary | Source links and status | Use a packet when it preserves a reusable decision. |
| Narrow test hardening or implementation bug fix | Story-only or direct focused change | Targeted test or reason test was not run | Use story when behavior or acceptance criteria matter. |
| User-facing feature or Dev Console workflow | PRD or mini-PRD, then epics/stories | Acceptance criteria and verification plan | Do not compress into ad hoc implementation. |
| Cross-package/API contract change | Architecture note or story with architecture references | Contract tests or focused integration evidence | Expand context before coding. |
| Governance/policy change | Mini-PRD or decision packet promoted to policy | Review evidence and explicit approval | Compression rules themselves belong here. |
| Runtime evidence redesign | PRD | Evidence model and retention decisions | High-risk; do not shortcut. |
| Provider calls, workers, paid usage, secrets, cleanup, deletion, merge | Approval packet plus existing workflow | Authority, scope, stop lines, result evidence | Artifact size does not reduce approval need. |

## No-Formal-Artifact Path

Allowed when all are true:

- scope is one small file or a tightly related local set;
- no product behavior changes;
- no governance policy changes;
- no authority-sensitive operations;
- no new external dependency;
- no provider, paid, credential, worker, cleanup, deletion, merge, or retention
  action;
- existing context and tests are enough to verify the result;
- the final answer names the files changed and verification performed.

Examples:

- fix a broken internal markdown link;
- add a missing command note to an existing runbook;
- adjust a narrow test expectation after reading the implementation;
- commit a handoff file in a local-only lane when Bob explicitly approves.

## Story-Only Path

Use story-only work when the change has acceptance criteria but does not require
new product strategy, architecture, or governance decisions.

Examples:

- split a slow test group after profiling proves the bottleneck;
- add a CLI flag to an existing local script;
- add a dashboard status row using an existing API contract;
- harden a verification script around a known Windows quoting issue.

Story-only work should still preserve:

- acceptance criteria;
- implementation notes;
- targeted verification;
- final evidence.

## Mini-PRD Path

Use a mini-PRD when the work changes what Bob sees, decides, or relies on, but
the scope is still smaller than a full product area.

Examples:

- Developer Readiness Dashboard;
- PR Policy And Lane Governance;
- BMAD Workflow Compression if thresholds become formal policy;
- local one-command experience if it changes bootstrap/install behavior.

Mini-PRD output should be concise: problem, users, scope, non-goals,
acceptance criteria, risks, and verification expectations.

## Full PRD Path

Use full PRD treatment when the work affects product behavior across multiple
systems or creates durable governance obligations.

Examples:

- Runtime Evidence Quality redesign;
- Next Product Value Lane;
- approval-gate product workflows;
- candidate/active work lifecycle changes;
- execution readiness or orchestration behavior.

## Review And Evidence Rules

Compression can reduce front-loaded ceremony, but not final accountability.

Every code or workflow change still needs:

- clear scope;
- current-state inspection;
- targeted verification or a reason verification was not possible;
- no unrelated cleanup;
- no hidden mutation;
- final status.

For implemented code changes, route review requests through `bmad-code-review`
first. Use specialized review lenses only when the bundled review leaves a
specific gap.

## Decision Recommendation

Adopt the thresholds experimentally for research/brainstorming and small local
workflow lanes. Do not make them binding repo policy until Bob approves a
mini-PRD or governance update.

The immediate safe improvement is to add examples to future handoffs and
research packets:

```text
Suggested artifact level: none | story-only | mini-PRD | full PRD
Authority gates: none | approval packet required
Verification expectation: targeted | broad | deferred with reason
```

That gives future agents a compression decision without hiding safety-critical
requirements.
