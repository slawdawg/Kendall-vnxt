# Premium Execution Approval Packet

Date: 2026-06-13
Status: approval-required, non-executing packet
Authority family: `premium-execution`
Operation candidate: one bounded paid-provider operation

## Purpose

This packet defines what must be approved before Kendall_Nxt may perform any paid or premium provider operation. It extends the existing premium approval request artifact posture from Story 1.18 without enabling premium execution, reading credentials, calling providers, or incurring cost.

## Current Evidence Baseline

| Evidence | Current state |
| --- | --- |
| Story 1.18 | Done; premium approval request artifacts exist and keep execution disallowed. |
| Existing endpoint posture | Premium approval artifact generation is deterministic and non-mutating by default. |
| Premium execution | Blocked pending exact approval. |
| Credential/session access | Not approved. |
| Cost-incurring calls | Not approved. |

## Candidate Operation

One future premium operation may be proposed if Bob accepts exact approval.

Allowed shape:

- One named provider/account boundary.
- One named operation and task purpose.
- Explicit cost ceiling.
- Explicit data classification.
- Metadata-only retained evidence unless a separate retention approval grants more.
- Human audit record.
- Abort and rollback path.

## Required Approval Binding

Any future premium execution evidence must bind:

- Authority family: `premium-execution`
- Operation: one bounded paid-provider operation
- Provider/account boundary
- Cost ceiling
- Data classification
- Prompt-source id or input-set id
- Redaction policy
- Retained evidence policy
- Audit evidence
- Operator
- Abort policy
- Rollback path
- Stop lines
- Expiry or review point

Arbitrary, ambiguous, stale, expired, mismatched, or underspecified approval IDs must be rejected.

## Data And Retention Policy

Default retained evidence:

- Approval packet id.
- Provider id and account boundary label.
- Cost ceiling and consumed-cost metadata.
- Request metadata.
- Redaction summary.
- Response metadata only.
- Audit record id.
- Rollback/global-disable evidence.

Default prohibited retention:

- Raw prompts.
- Raw completions.
- Provider payloads.
- Secrets.
- Credentials.
- External session contents.
- Billing credentials.
- Full source copies.

## Budget Stop Lines

- Do not execute without a cost ceiling.
- Do not execute if cost tracking is missing or ambiguous.
- Stop before exceeding the approved ceiling.
- Do not retry automatically after a paid-call failure.
- Do not use another provider/account when the approved provider/account is unavailable.

## Required Stop Lines

- Do not make paid provider calls from this packet alone.
- Do not read credentials or external sessions.
- Do not retain raw prompt/completion/provider payload text.
- Do not expand local-provider approval into premium-provider approval.
- Do not mutate source, launch processes, merge PRs, clean worktrees, or bypass failed checks.
- Do not treat a premium approval request artifact as execution approval.

## Rollback Path

If provider/account, budget, data policy, audit evidence, retained evidence, operator, or rollback evidence is missing or stale:

- Keep premium execution disabled.
- Return to approval-request artifacts only.
- Preserve metadata-only rejected-attempt evidence naming the missing gate.

If a future approved paid operation fails:

- Preserve terminal-state metadata only.
- Do not retry automatically.
- Keep premium execution disabled until a refreshed approval packet exists.

## Exact Approval Template

`I approve the premium-execution lane for one bounded paid-provider operation using provider/account <provider-account>, operation <operation>, cost ceiling <cost-ceiling>, data classification <data-classification>, prompt-source or input-set id <input-id>, redaction policy <redaction-policy>, retained evidence <metadata-only-evidence>, audit evidence <audit-evidence>, operator <operator>, abort policy <abort-policy>, rollback path <rollback>, stop lines <stop-lines>, and expiry/review point <expiry>.`

## Verification

- `pnpm.cmd run check:docs`

If a later story changes premium execution contracts, supervisor service code, settings, dashboard rendering, drift checks, or tests, it must also run the smallest relevant premium approval/execution check and full `pnpm.cmd run check` before merge.

