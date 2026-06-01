# KNX Synthetic Fixture Pack

Last updated: 2026-06-01

## Purpose

This folder is reserved for synthetic KNX source/evidence fixtures. It must not contain real source material.

## Required First Fixture Categories

- Minimal valid source packet.
- Minimal valid work trace.
- Minimal valid validation evidence.
- Minimal valid user-input-required item.
- Missing source negative fixture.
- External action request negative fixture.
- Low-confidence or unsupported inference negative fixture.
- Forbidden destination or data-boundary violation negative fixture.
- Source mutation requested without approval negative fixture.
- Source inventory stored outside approved storage negative fixture.

## Safety Rules

- Use synthetic content only.
- Do not include customer data, credentials, tokens, secrets, MFA content, account/security material, production data, source-system content, or private user content.
- Do not include instructions that trigger external sends, installs, account changes, source mutation, live runtime state creation, or destructive actions.
- Mark expected validation results as `PASS`, `CONCERNS`, `FAIL`, or `WAIVED`.
- Mark expected failed rules for every negative fixture.

## Current Status

Status: created

First fixture pack:

- `first-fixture-pack.json`

Coverage:

- Minimal valid source packet.
- Minimal valid work trace.
- Minimal valid validation evidence.
- Minimal valid user-input-required item.
- Missing source negative fixture.
- External action request negative fixture.
- Low-confidence or unsupported inference negative fixture.
- Forbidden destination or data-boundary violation negative fixture.
- Source mutation requested without approval negative fixture.
- Source inventory stored outside approved storage negative fixture.
- Standalone synthetic validation evidence examples for referenced negative validation evidence IDs.

The pack is for future validator and safety-review testing only. It does not approve real source intake, external sends, source mutation, live runtime state, or writes outside `_bmad/memory/knx/fixtures/synthetic`.

The approved KNX storage root for generated artifacts is `C:/Users/slaw_dawg/Kendall_Nxt/_bmad/memory/knx/runtime`, but fixture files themselves must remain synthetic and must stay in this synthetic fixture folder unless a later fixture packaging decision says otherwise.
