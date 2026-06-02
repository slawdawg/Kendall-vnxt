# KNX Local Model GPU Processing Planning Gate

Date: 2026-06-01

Status: accepted for local planning only

## Decision

Approve local-only planning for possible future local model/GPU processing.

Local model/GPU processing remains disabled.

This approval authorizes only local governance records, local planning evidence, local validation evidence, and local commits under the already approved KNX memory/runtime boundary.

## Allowed Future Processing Classes

Future planning may describe these candidate local-only processing classes, but may not execute them without a later explicit approval:

- synthetic fixture analysis,
- metadata-only source packet classification,
- governance artifact summarization,
- validation report summarization,
- local policy or safety-check assistance,
- deterministic pre/post-processing around approved local evidence.

## Approved Scope

- Define allowed future local model/GPU processing classes.
- Keep model/GPU processing disabled until a later explicit approval names exact hardware, model/runtime, source classes, storage, execution context, resource limits, rollback, validation, and safety contract.
- Create local checklist and evidence artifacts under `_bmad/memory/knx/runtime/greenfield-implementation/local-model-gpu/`.
- Record the gate outcome in KNX memory, backlog, handoff, daily log, and greenfield hard-gate plan.

## Required Future Fields

Any later local model/GPU processing approval must provide:

- hardware target,
- model/runtime identity,
- model source and license posture,
- source classes,
- storage location and retention policy,
- execution context and permissions,
- cost/resource limits,
- input/output boundaries,
- rollback and disable plan,
- validation plan,
- safety contract,
- logging and evidence requirements.

## Explicit Exclusions

This decision does not approve:

- model installation,
- GPU or runtime configuration,
- inference,
- embeddings,
- model downloads,
- package installation,
- source, customer, or production processing,
- external providers,
- credential or account access,
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

Local model/GPU processing can affect source boundaries, resource use, model licensing, output provenance, and safety validation. Planning can proceed locally, but implementation must remain gated until exact hardware, runtime, inputs, outputs, storage, safety controls, rollback, and validation are explicit.

