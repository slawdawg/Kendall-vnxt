# Local Provider Execution Approval Packet

Date: 2026-06-13
Status: approval-required, non-executing packet
Authority family: `local-provider-execution`
Operation candidate: one bounded metadata-only Ollama provider operation

## Purpose

This packet refreshes the local-provider execution boundary after Story 4.4. It prepares a future exact approval for one bounded Ollama operation using the already-approved VM-to-host endpoint/model boundary. It does not call Ollama, discover models, expand provider support, mutate source, or retain raw provider content.

## Current Evidence Baseline

| Evidence | Current state |
| --- | --- |
| Story 4.4 | Done within approved VM-to-host Ollama endpoint/model boundary. |
| Approved endpoint | `http://192.168.1.128:11434/v1/chat/completions` |
| Approved model | `qwen3:14b` |
| Existing adapter | Implemented behind disabled defaults with endpoint/model gates. |
| Retention posture | Metadata-only; no raw prompt, completion, reasoning, or provider payload retention. |
| Broader provider expansion | Still deferred. LM Studio, vLLM, llama.cpp, remote providers, and premium providers remain out of scope. |

## Candidate Operation

One future local-provider operation may be proposed if Bob accepts exact approval.

Allowed shape:

- Provider: Ollama only.
- Endpoint: `http://192.168.1.128:11434/v1/chat/completions` only.
- Model: `qwen3:14b` only.
- Purpose: one bounded evidence explanation or decision-support response using approved prompt-source metadata.
- Timeout: retain Story 4.4 timeout/cancellation posture unless a later approval names a replacement.
- Retention: metadata-only event evidence and artifact references only.
- Rollback: disable local-provider and Ollama-specific gates.

## Required Input Policy

Allowed inputs:

- Approved prompt-source identifier.
- Work item or evidence id.
- Prompt template id.
- Redaction summary.
- Provider settings id.
- Endpoint/model id.

Disallowed inputs:

- Raw prompt retention in events.
- Raw completion retention in events.
- Raw reasoning-field retention.
- Raw provider payload retention.
- Credentials.
- External session data.
- Secrets.
- Arbitrary endpoint or model discovery.
- Source file copies outside explicit story scope.

## Required Approval Binding

Any future provider execution evidence must bind:

- Authority family: `local-provider-execution`
- Operation: one bounded Ollama provider operation
- Endpoint: `http://192.168.1.128:11434/v1/chat/completions`
- Model: `qwen3:14b`
- Prompt-source id
- Prompt template id
- Redaction policy
- Timeout/cancellation policy
- Retained evidence policy
- Operator
- Rollback path
- Stop lines
- Expiry or review point

Arbitrary, ambiguous, stale, expired, mismatched, or underspecified approval IDs must be rejected.

## Required Stop Lines

- Do not call this provider from this packet alone.
- Do not call any endpoint other than `http://192.168.1.128:11434/v1/chat/completions`.
- Do not use any model other than `qwen3:14b`.
- Do not discover endpoints or models.
- Do not retain raw prompt, completion, reasoning, or provider payload text in workflow events.
- Do not read credentials or external sessions.
- Do not expand to LM Studio, vLLM, llama.cpp, remote providers, or premium providers.
- Do not mutate source, launch processes, merge PRs, clean worktrees, or bypass failed checks.

## Rollback Path

If provider approval, endpoint/model binding, redaction, timeout, retention, or operator evidence is missing or stale:

- Keep provider execution disabled.
- Keep Ollama-specific execution disabled.
- Return to no-call fixture evidence.
- Preserve metadata-only rejected-attempt evidence naming the missing gate.

If a future approved operation fails:

- Preserve terminal-state metadata only.
- Do not retry automatically.
- Re-disable provider gates if rollback criteria are met.
- Regenerate the approval packet before any new attempt.

## Exact Approval Template

`I approve the local-provider-execution lane for one bounded Ollama provider operation using endpoint http://192.168.1.128:11434/v1/chat/completions, model qwen3:14b, prompt-source id <prompt-source-id>, prompt template id <prompt-template-id>, redaction policy <redaction-policy>, timeout/cancellation policy <timeout-cancellation-policy>, retained evidence <metadata-only-evidence>, operator <operator>, rollback path <rollback>, stop lines <stop-lines>, and expiry/review point <expiry>.`

## Verification

- `pnpm.cmd run check:docs`

If a later story changes provider contracts, supervisor service code, settings, dashboard rendering, drift checks, or tests, it must also run the smallest relevant provider fixture/policy check and full `pnpm.cmd run check` before merge.

