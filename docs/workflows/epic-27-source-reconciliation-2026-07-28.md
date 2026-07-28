# Epic 27 source reconciliation — 2026-07-28

Status: source-owned evidence reconciliation; no new product, provider,
deployment, cleanup, or tracker authority

## Decision

This document records the evidence that can be used to reconcile the claimed
Epic 27 delivery surface. It is not a replacement PRD, epic tracker, story,
or completion declaration. It intentionally leaves Epic-level completion
**unproven**: no tracked Epic 27 PRD/story/status/acceptance-criteria record
currently connects the full Epic goal to measurable delivery evidence.

## Source hierarchy

1. Accepted source-owned product requirements define product scope and
   acceptance criteria. A PRD, architecture, epics, or status bundle is local
   planning input until its decisions are rewritten into that boundary.
2. A source-owned tracker can state planned and completed story status only
   when it identifies that same bundle and revision.
3. Exact GitHub PR head, merge, check, and review-thread data prove a bounded
   delivery event; they do not create product scope or infer unmet criteria.
4. This reconciliation document links only evidence proved by those sources.
   It does not modify ignored BMAD planning state or create a parallel tracker.

## Evidence matrix

| Item | Proven purpose and exact evidence | Reconciliation use | Limit |
| --- | --- | --- | --- |
| PR #687 | Explicitly titled **Epic-27 supervisor report envelope hardening batch**. Merged head `365a18c86f88899e7a9871a22c15aea7d9acf76e`, merge `6cf3132224fd7c6f6e8eead4c49e06f48fdce922`, base `dev`; 3 files, +111/-4; no review threads. | Contextual delivery evidence pending source-owned Epic mapping. | PR self-labeling and merge history cannot prove Epic scope or criteria. |
| #687 slice 1 | The PR body names **authoritative work-packet mutation response envelopes for POST routes** with contract-only response typing and unchanged mutation/authority behavior. | Measurable slice: the merged exact head carries this declared response-envelope scope. | No independently tracked Epic 27 acceptance criterion ties this slice to an Epic-level outcome. |
| #687 slice 2 | The PR body names **strict read-only delivery and cleanup report envelope route coverage**. | Measurable slice: the merged exact head carries the stated read-only route coverage. | It is not proof that cleanup was run or that all delivery lifecycle work is complete. |
| PR #728 | Merged dirty-lane-takeover hardening at head `d69e9b65eb86376c2de77de61f9e5fda9cf00cad`, merge `c2a09ccb841cf278d4636cb37926ab10e4984c2f`; checks are success or documented skips. | Contextual recovery evidence only. | Four post-merge review threads remain unresolved; no proven Epic 27 source linkage. |
| PR #729 | Merged zero-byte task-lock recovery at head `3bdd0ba61d55d914ec04e908183645e37bdf9085`, merge `66c435eb353e8a6fa184a726b4ea7acb5464cab0`; checks are success or documented skips. | Contextual recovery evidence only. | Five post-merge review threads remain unresolved; no proven Epic 27 source linkage. |
| PR #730 | Merged Story 36.5 manager tracker isolation at head `dffdd6b365ac2eb8b96e3a687d16e1b2431c464e`, merge `70111340ec7474fbbe3d59e0b3efc42ee338e501`; runner task is `20260727-repair-story-36-5-manager-tracker-isolation`. | Contextual recovery/delivery evidence only. | One post-merge review thread remains unresolved; explicitly Story 36.5, not proven Epic 27 scope. |
| PR #718 | Open reconcile-CLI safety fix at `f23e4a2743b3ebd3d85dc40c70e5d35c916434ba`, base `dev`, clean; checks success or documented skips; its one thread is resolved. | Audit-only: unrelated open work. | It must not be counted as Epic 27 delivery. |
| PR #723 | Open standing review-thread authority work at `d252b722b54832dede5d4f52af89049bfcdacd40`, base `dev`, dirty; checks success or documented skips; 30 unresolved threads (21 current, 9 outdated). | Audit-only: frozen unrelated work. | It must not be counted, reconciled, or changed by this decision. |

## Missing evidence

- The authoritative Epic 27 PRD/epic definition and revision that state its
  operator-visible goal, full story set, and measurable success criteria.
- A source tracker bound to that revision, with all Epic 27 stories and their
  current statuses.
- A criterion-by-criterion mapping from those tracked stories to exact merged
  heads and relevant verification evidence.
- Explicit disposition for open, stale, approval-gated, and held work; merged
  PR history alone cannot supply it.
- Review-thread disposition for #728, #729, and #730 if any later decision
  needs thread-clean delivery evidence.

## GitHub evidence snapshot

Observed 2026-07-28 UTC through GitHub PR metadata, check rollups, and
thread-aware GraphQL queries. The matrix records immutable PR heads/merges and
the bounded observed thread disposition; GitHub check and open-PR state remain
mutable and must be freshly queried before any delivery decision. Review-thread
identifiers observed: #718 `PRRT_kwDOSy366c6Tzj5w`; #723 has 30 unresolved
threads; #728 has 4, #729 has 5, and #730 has 1 unresolved post-merge thread.

## Exact next safe source decision

Do not dispatch a new lane or mark Epic 27 complete. First select and preserve
one authoritative Epic 27 source bundle, bind a tracker to its exact revision,
and produce a criterion-to-evidence reconciliation that classifies every
tracked item as merged, open, stale, approval-gated, or held. Only then may an
authorized owner decide whether the Epic is complete, whether review-thread
dispositions need separate work, or whether any source-backed work remains.

## Verification boundary

This document uses GitHub PR metadata, exact heads/merges, check rollups, and
review-thread state gathered on 2026-07-28. It makes no claim about live
provider execution, deployment, stakeholder acceptance, cleanup, or product
readiness.
