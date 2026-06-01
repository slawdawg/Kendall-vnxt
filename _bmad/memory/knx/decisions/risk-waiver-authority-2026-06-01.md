# Risk Waiver Authority Decision - KNX

Last updated: 2026-06-01

## Decision Status

Status: accepted

Decision: risk score `9` waivers require explicit user approval and a durable decision record. KNX workflows may recommend a waiver request, but may not self-approve it.

## Rule

Risk score `9` is blocking by default.

A waiver for risk score `9` requires:

- explicit user approval for the named waiver,
- a durable decision record under `_bmad/memory/knx/decisions/`,
- rationale,
- exact scope,
- approval basis,
- expiration or review condition,
- linked source/evidence references,
- linked validation evidence,
- residual risk statement.

## Not Authorized

The following may not approve risk score `9` waivers by default:

- KNX workflows acting autonomously,
- generated validators,
- optional packs,
- local Git commits,
- GitHub/remotes,
- external providers,
- local model/GPU outputs.

## Hard Stops

Do not waive risk score `9` for:

- credentials, tokens, MFA, or account/security material,
- customer/production system access,
- external sends of ambiguous or sensitive material,
- destructive or ambiguous data-loss operations,
- source mutation without a named mutation decision and rollback plan.

These require a separate boundary decision before a waiver can even be considered.

## Rationale

Risk score `9` represents a blocking condition. User approval and durable evidence are required so the system cannot silently downgrade hard stops.

## Decision Sources

- `_bmad/memory/knx/source-evidence-contract.md`
- `_bmad/memory/knx/data-boundaries.md`
- `_bmad/memory/knx/execution-policy.md`
- User instruction to continue recommended decisions on 2026-06-01.
