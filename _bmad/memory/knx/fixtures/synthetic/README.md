# KNX Synthetic Fixture Pack

Last updated: 2026-05-31

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

The pack is for future validator and safety-review testing only. It does not approve real source intake, external sends, source mutation, live runtime state, or writes outside `_bmad/memory/knx/fixtures/synthetic`.
