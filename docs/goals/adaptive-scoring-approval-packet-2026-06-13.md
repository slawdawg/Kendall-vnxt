# Adaptive Scoring Approval Packet

Date: 2026-06-13
Status: approval-required, non-executing packet
Authority family: `adaptive-scoring`
Operation candidate: one bounded decision-support scoring operation

## Purpose

This packet defines the safety envelope for a future adaptive-scoring operation. It does not compute, store, display, apply, or act on a score. It exists to make the next adaptive-scoring story precise enough that scoring cannot quietly become priority automation or authority approval.

## Current Evidence Baseline

| Evidence | Current state |
| --- | --- |
| Development runway safe slices | Story 3.54 provides read-only planning slices and authority-blocker navigation. |
| Development runway readiness checks | Story 3.59 provides per-slice readiness checks before implementation starts. |
| Story 11.3 next-lane packet | Identifies `adaptive-scoring` as blocked pending exact approval. |
| Deferred authority backlog map | Recommends adaptive scoring as low blast radius only if kept decision-only and metadata-only. |
| GitHub delivery lane | PR #103 and PR #109 delivery/cleanup evidence are merged; current repo delivery hygiene is clean. |

## Candidate Operation

One bounded decision-support scoring operation may be proposed later if Bob accepts exact approval.

Allowed shape:

- Score one explicit input set.
- Use deterministic local rules only unless Bob separately approves a provider-backed scoring operation.
- Retain metadata only: score version, input identifiers, input field names, score output, rationale labels, operator review decision, and rollback/removal evidence.
- Produce a recommendation artifact only.
- Require human review before any priority, authority, cleanup, launch, delivery, or execution state changes.

## Allowed Inputs

Future scoring may use only metadata from approved read-only planning surfaces:

- Candidate lane id.
- Story id or backlog lane id.
- Readiness status token.
- Missing gate count and labels.
- Verification coverage labels.
- Known stop-line labels.
- Blast-radius category.
- Rollback path presence.
- Required approval presence.

Disallowed inputs:

- Raw prompts.
- Raw completions.
- Provider payloads.
- Credentials.
- External session data.
- Secrets.
- Full source copies.
- Private environment dumps.
- User browser/session content.

## Formula Requirements

The first scoring implementation must use a deterministic named formula, not a model call.

Minimum formula requirements:

- Versioned formula id.
- Explicit weighted factors.
- Stable tie-breaking rule.
- Fixture inputs with expected outputs.
- Human-readable rationale labels.
- No hidden state.
- No network calls.
- No provider calls.

## Output Use Policy

Adaptive score output may be used only for decision support.

It must not:

- Automatically reorder sprint status.
- Automatically promote candidate work.
- Change authority state.
- Mark any lane ready, approved, executable, mergeable, or cleanup-eligible.
- Trigger worker launch, provider call, paid call, PR action, cleanup, or source mutation.
- Bypass failed checks.

## Required Approval Binding

Any future adaptive-scoring execution evidence must bind:

- Authority family: `adaptive-scoring`
- Operation: one bounded scoring operation
- Input set id and allowed input fields
- Formula id and version
- Output use: decision support only
- Retained evidence
- Operator
- Human review path
- Rollback/removal path
- Stop lines
- Expiry or review point

Arbitrary, ambiguous, stale, expired, mismatched, or underspecified approval IDs must be rejected.

## Rollback And Removal

If scoring evidence is stale, contradicted, or disapproved:

- Remove or mark scoring recommendation as superseded.
- Revert to deterministic review-only ordering.
- Preserve metadata-only evidence of why the score was not used.
- Do not mutate sprint status, priority, authority state, delivery state, cleanup state, or runtime state.

## Stop Lines

- Do not compute a score from this packet alone.
- Do not apply a score to priority or authority.
- Do not autopromote candidate work.
- Do not grant provider, premium, launch, delivery, cleanup, or worker authority.
- Do not call local or remote providers.
- Do not retain raw prompts, completions, provider payloads, secrets, credentials, or external sessions.
- Do not bypass failed checks.

## Exact Approval Template

`I approve the adaptive-scoring lane for one bounded scoring operation using inputs <inputs>, formula <formula-id-version>, output use <decision-support-only>, required evidence <required-evidence>, retained evidence <metadata-only-evidence>, rollback path <rollback>, stop lines <stop-lines>, and expiry/review point <expiry>.`

## Verification

- `pnpm.cmd run check:docs`

If a later story changes contracts, supervisor reports, dashboard rendering, drift checks, or tests, it must also run the smallest relevant check and then `pnpm.cmd run check` if runtime behavior changed.

