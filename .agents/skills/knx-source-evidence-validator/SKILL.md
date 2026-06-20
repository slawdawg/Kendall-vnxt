---
name: knx-source-evidence-validator
description: Validates KNX synthetic source/evidence fixture packs and metadata-only source packet examples, then writes local validation reports under approved KNX runtime storage.
---

# knx-source-evidence-validator

## Overview

This standalone optional pack validates KendallAI vNext synthetic source/evidence fixture packs and metadata-only source packet examples against the accepted source/evidence contract.

It is not part of the KNX governance core. It packages the dependency-free validator only.

## On Activation

If the user passes `setup`, `configure`, or `install`, load `./assets/module-setup.md` and complete standalone module registration before continuing.

Check whether `{project-root}/_bmad/config.yaml` contains a `ksev` section. If it does not, load `./assets/module-setup.md` and complete registration before normal validation.

Load available config from `{project-root}/_bmad/config.yaml` and `{project-root}/_bmad/config.user.yaml` at root level plus the `knx` and `ksev` sections. Use sensible defaults when optional `ksev` values are missing:

- Fixture pack: `{project-root}/.agents/skills/knx-source-evidence-validator/assets/fixtures/first-fixture-pack.json`
- Report directory: `{project-root}/_bmad/memory/knx/runtime/optional-source-evidence-validator/reports`
- Approved storage root: `knx_storage_root` from config, or `{project-root}/_bmad/memory/knx/runtime`

Read the source/evidence contract before interpreting results:

- `{project-root}/_bmad/memory/knx/source-evidence-contract.md`
- `{project-root}/_bmad/memory/knx/data-boundaries.md`
- `{project-root}/_bmad/memory/knx/execution-policy.md`

## Inputs

Use only local synthetic fixture packs, metadata-only source packet examples, and local governance records.

Supported arguments:

- `validate` or no action: validate the configured fixture pack and write reports.
- `--fixture-pack PATH`: validate a specific local fixture pack.
- `--source-packet-examples PATH`: validate metadata-only source packet examples instead of the synthetic fixture pack.
- `--output-dir PATH`: write reports to a specific local directory.
- `--storage-root PATH`: override the approved KNX runtime storage root for an explicit review or test run.
- `--no-write`: validate without writing reports.
- `test`: run the packaged validator tests.

## Workflow

1. Confirm the target fixture pack is synthetic and local, or the source packet examples are metadata-only and local.
2. Confirm report output stays under the approved KNX runtime storage root.
3. Run `python ./scripts/validate_source_evidence.py` with the selected arguments.
4. Treat `PASS` as clean validation, `CONCERNS` as review-needed, and `FAIL` as blocking.
5. Surface the JSON summary and the report paths when reports are written.
6. If tests are requested, run `python -m unittest discover -s ./tests -p test_validate_source_evidence.py`.

## Outputs

The validator writes, when `--no-write` is not used:

- JSON validation report.
- Markdown validation report.

Default output location:

- `{project-root}/_bmad/memory/knx/runtime/optional-source-evidence-validator/reports`

## Safety Rules

- Do not mutate source files.
- Do not copy source contents into source packet examples.
- Do not generate or materialize source inventory artifacts.
- Do not write reports outside the approved KNX runtime storage root.
- Do not call GitHub, remotes, webhooks, external providers, or remote CI.
- Do not use local model or GPU processing.
- Do not access credentials, tokens, customer systems, production systems, or account/security workflows.
- Do not package validators, source inventory evidence, runtime assistant behavior, or external integrations into the KNX governance core.

## Next Workflow

After a clean validation run, recommend `knx-safety-validation-review` for the optional source/evidence validator pack if packaging or behavior changed.
