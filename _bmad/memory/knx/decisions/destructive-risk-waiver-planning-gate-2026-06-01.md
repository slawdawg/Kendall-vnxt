# KNX Destructive Risk Waiver Planning Gate

Date: 2026-06-01

Status: accepted for local planning only

## Decision

Approve local-only planning for destructive/data-loss actions and risk score `9` waiver requirements.

Destructive/data-loss actions remain blocked by default.

No risk score `9` waiver is granted by this decision.

This approval authorizes only local governance records, local planning evidence, local validation evidence, and local commits under the already approved KNX memory/runtime boundary.

## Blocked Action Classes

The following action classes remain blocked unless a later explicit approval provides all required future fields:

- delete,
- recursive delete,
- move with overwrite or loss risk,
- overwrite,
- reset,
- cleanup,
- purge,
- irreversible transformation,
- backup removal,
- history rewriting,
- destructive repository operation,
- destructive runtime storage operation,
- any action requiring a risk score `9` waiver.

## Risk Score `9` Waiver Requirements

A future risk score `9` waiver must include:

- exact target,
- action type,
- blast radius,
- backup and recovery evidence,
- authority and approval basis,
- validation plan,
- stop condition,
- rollback plan,
- safety contract,
- reason a lower-risk alternative is insufficient,
- explicit user approval naming the waiver.

## Required Future Fields

Any later destructive/data-loss action approval must provide:

- exact target,
- action type,
- blast radius,
- backup and recovery plan,
- authority and approval basis,
- validation plan,
- stop condition,
- rollback plan,
- safety contract,
- dry-run or preview evidence when available,
- post-action verification plan.

## Explicit Exclusions

This decision does not approve:

- delete, move, overwrite, reset, cleanup, or purge actions,
- destructive repository operations,
- destructive runtime storage operations,
- backup removal,
- history rewriting,
- risk score `9` waivers,
- source mutation outside already approved KNX paths,
- customer, production, credential, or account-security access,
- external sends or provider calls.

## Validation

Validation for this gate is limited to:

- local documentation review,
- JSON parse validation,
- `git diff --check`,
- sensitive-pattern scan,
- local commit.

## Rationale

Destructive/data-loss actions and risk score `9` waivers can permanently remove evidence, damage recoverability, or bypass safety controls. Planning can proceed locally, but execution and waiver approval must remain blocked until exact targets, authority, recovery, rollback, validation, stop conditions, and safety controls are explicit.

