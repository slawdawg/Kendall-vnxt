# KNX Access Security Workflows Planning Gate

Date: 2026-06-01

Status: accepted for local planning only

## Decision

Approve local-only planning for possible future customer, production, credential, or account-security workflows.

Customer access, production access, credential handling, and account-security workflows remain blocked by default.

This approval authorizes only local governance records, local planning evidence, local validation evidence, and local commits under the already approved KNX memory/runtime boundary.

## Blocked Workflow Classes

The following workflow classes remain blocked unless a later explicit approval provides all required future fields:

- customer system access,
- production system access,
- customer or production data handling,
- credential handling,
- token, key, secret, or password work,
- auth, MFA, session, or account-security changes,
- permission or role changes,
- security-sensitive troubleshooting,
- external account integration.

## Approved Scope

- Define customer, production, credential, and account-security workflows as blocked by default.
- Define required future approval fields.
- Create local checklist and evidence artifacts under `_bmad/memory/knx/runtime/greenfield-implementation/access-security/`.
- Record the gate outcome in KNX memory, backlog, handoff, daily log, and greenfield hard-gate plan.

## Required Future Fields

Any later access/security workflow approval must provide:

- exact system or account,
- data class,
- access method,
- authority and authorization basis,
- audit and logging plan,
- rollback and recovery plan,
- validation plan,
- safety contract,
- time boundary,
- destination and sharing boundary,
- credential handling policy,
- emergency stop condition.

## Explicit Exclusions

This decision does not approve:

- customer access,
- production access,
- customer or production data processing,
- credential handling,
- token, key, secret, password, auth, MFA, session, permission, or role changes,
- account/security changes,
- external sends or provider calls,
- runtime assistant behavior,
- source mutation outside already approved KNX paths.

## Validation

Validation for this gate is limited to:

- local documentation review,
- JSON parse validation,
- `git diff --check`,
- sensitive-pattern scan,
- local commit.

## Rationale

Customer, production, credential, and account-security workflows are high-risk because they can affect privacy, security, availability, legal obligations, and account integrity. Planning can proceed locally, but execution must remain blocked until exact systems, authority, access method, auditability, rollback, validation, and safety controls are explicit.

