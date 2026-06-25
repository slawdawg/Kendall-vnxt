# Alpha Daily-Use Runbook

This runbook defines the first repeatable Kendall_Nxt alpha loop for daily
operator testing. Alpha-ready means usable enough to exercise, observe, and
debug during normal work. It does not mean production autonomy or expanded
execution authority.

## Startup

Use the normal local dashboard and supervisor startup path for this repo. When
running browser verification, Playwright starts both services from
`playwright.config.ts`.

Useful checks:

```text
pnpm run test:dashboard-pipeline-fixtures
pnpm run build:dashboard
pnpm exec playwright test tests/e2e/dashboard.spec.ts --grep "opens fixture-backed pipeline cockpit without live execution framing"
uv run --directory services/supervisor pytest tests/integration/test_work_packets.py -q
```

If a command fails inside the sandbox because a tool needs local cache, temp, or
port binding access, rerun the exact same read-only verification command
outside the sandbox and record that boundary.

## Daily Alpha Loop

1. Open `/pipeline`.
2. Select a packet with source, memory, or blocked-state context. Good fixtures
   include stale research, Obsidian memory proposal, or corrupted aggregate
   states.
3. Inspect these drawer tabs:
   - `Sources`: confirm source refs, freshness, access state, and summary-only
     status.
   - `Evidence`: confirm retained evidence is metadata-only or fixture-only.
   - `Gates`: confirm there is no generic approve button and actions show
     authority, evidence, stop lines, destination, and rollback.
   - `Memory`: confirm Obsidian remains canonical and human-owned.
   - `Alpha`: confirm operation mode, decision state, blocked reasons,
     recovery options, backup, rollback, and blocked authority flags.
   - `Recovery`: confirm safe recovery options are visible and do not execute
     automatically.
4. For a passing alpha observation, record the packet id or fixture id and the
   visible evidence refs.
5. For a blocked observation, record the blocked reason, source refs, recovery
   option, and whether daily use can continue.
6. For a failure, create a bug evidence packet using the template below.

## Stop Lines

Stop and request explicit operator approval before any work that would:

- mutate canonical Obsidian notes;
- mutate source systems;
- promote LLM-Wiki to canonical memory;
- call a model/provider endpoint;
- launch Hermes, Docker, or another worker;
- call GitHub or perform delivery automation;
- use network egress beyond existing local dev service startup;
- read secrets or credentials;
- retain raw prompts, completions, reasoning traces, provider payloads,
  secrets, credentials, source dumps, or unnecessary source copies.

## Expected Alpha Evidence

The Alpha tab should show:

- authority family: `memory-writeback-and-source-mutation`;
- operation mode: `dry_run`, `read_only`, or `draft_preview`;
- decision state: `ready`, `blocked`, or `not_configured`;
- source refs and evidence refs;
- blocked reason codes when any source boundary prevents progress;
- recovery options;
- backup and rollback text;
- `metadata_only` retention;
- all mutation/provider/worker/GitHub/network flags blocked unless a later
  approved story changes that authority.

## Bug Evidence Packet

Use this structure when alpha daily use finds a bug:

```text
date:
operator:
packet_or_fixture_id:
screen_or_route: /pipeline
story_or_area:
expected_behavior:
actual_behavior:
source_refs:
evidence_refs:
blocked_reason:
recovery_attempted:
verification_command:
result:
daily_use_blocker: yes/no
severity: low/medium/high
safe_next_step:
retention_check:
```

Retention check must confirm the packet does not contain raw provider payloads,
secrets, credentials, source dumps, raw prompts, raw completions, or reasoning
traces.

## Blocking Criteria

Treat the bug as blocking alpha daily use when:

- `/pipeline` cannot open;
- the active packet drawer cannot show source/evidence/Alpha tabs;
- blocked source refs disappear instead of surfacing as blocked evidence;
- the UI implies canonical Obsidian mutation is allowed;
- the UI introduces a generic approve button;
- dashboard code makes hidden live calls outside approved supervisor status
  contracts;
- test evidence cannot be reproduced with the commands above.

Treat the bug as non-blocking but worth logging when:

- copy is unclear but authority and evidence remain visible;
- a fixture is missing a useful edge case;
- a panel needs better density or ordering but remains usable;
- a known unrelated e2e environment precondition is missing.

## Current Known Residuals

The full dashboard e2e suite may report unrelated failures in this environment:

- ambiguous `Source` label selectors in intake tests;
- missing `CODEX_WORKSPACE_STATE_ROOT` for routing fleet data;
- managed triage copy drift in gate audit expectations.

These do not block the alpha `/pipeline` loop when the targeted cockpit test
passes, but they should be tracked separately before broad beta testing.
