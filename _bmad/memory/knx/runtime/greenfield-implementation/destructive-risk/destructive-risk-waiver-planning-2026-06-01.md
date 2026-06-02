# KNX Destructive Risk Waiver Planning

Date: 2026-06-01

Status: local-only planning materialized

Decision record: `_bmad/memory/knx/decisions/destructive-risk-waiver-planning-gate-2026-06-01.md`

## Gate

Gate 11: destructive/data-loss actions or risk score `9` waivers.

User approval reopened this path for local planning only.

## Current Posture

- Destructive/data-loss actions are blocked.
- Risk score `9` waivers are not granted.
- No delete, move, overwrite, reset, cleanup, or purge action is approved.
- No source mutation outside already approved KNX paths is approved.
- No customer, production, credential, or account-security access is approved.
- No external send or provider call is approved.
- Planning artifacts remain local under approved KNX runtime storage.

## Blocked By Default

The following action classes require a later explicit approval before execution:

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

## Future Approval Checklist

Before any destructive/data-loss action is executed, a later approval must name:

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

Before any risk score `9` waiver is granted, a later approval must also name:

- reason a lower-risk alternative is insufficient,
- explicit user approval naming the waiver.

## Disabled By Default

The following remain blocked:

- delete, move, overwrite, reset, cleanup, or purge actions,
- destructive repository operations,
- destructive runtime storage operations,
- backup removal,
- history rewriting,
- risk score `9` waivers,
- source mutation outside already approved KNX paths,
- customer, production, credential, or account-security access,
- external sends or provider calls.

## Validation Evidence

Expected validation:

- JSON parse for `destructive-risk-waiver-planning-2026-06-01.json`.
- `git diff --check`.
- sensitive-pattern scan across changed files.
- local commit.

## Result

Gate 11 is satisfied only as a planning gate. No destructive action or risk score `9` waiver is approved.

