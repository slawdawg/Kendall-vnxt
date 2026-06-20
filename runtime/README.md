# Runtime Monorepo Skeleton

This repository area contains the product runtime, installable modules, shared contracts, packaging assets, builder-side support assets, and tests for the Release 1 local-first assistant system.

## Layout

- `core/` - core runtime services and UI shell
- `modules/` - installable runtime capabilities
- `contracts/` - machine-readable contracts and schemas
- `tests/` - synthetic scenarios and validation packs
- `packaging/` - coordinated release and trusted update assets
- `builder/` - builder-side support assets that feed runtime packaging
- `docs/` - runtime-facing architecture and design documents

## Release 1 Intent

The initial runtime should support:

- core chief-of-staff persona
- Outlook triage module
- Scheduling protection module
- Tasks and reminders module
- core briefing orchestration

The runtime must remain private by default and useful in local-first mode without depending on hosted AI services.

## Current Scaffold Coverage

Implemented core scaffolds now include:

- module discovery, registration, and enable/disable state
- contract-scoped memory and data access boundaries
- briefing signal collection and core-owned briefing composition
- policy-gated action routing with audit logging
- local-default inference routing and outbound privacy gating
- runtime status snapshots for admin/status surfaces
- release-one module bootstrap for `outlook`, `scheduling`, and `tasks`
- typed release-one record models for email, calendar, task, reminder, and hold data

## Local Batch Timing

For durable batch timing that does not depend on shell timestamp rendering, use:

```bash
python runtime/tools/batch_timer.py start --label runtime-hardening --target-minutes 30
python runtime/tools/batch_timer.py status
python runtime/tools/batch_timer.py stop
```

The timer persists repo-local state in `runtime/.batch_timer_state.json`, uses `time.monotonic_ns()` for elapsed-time tracking, and falls back to wall-clock deltas only if the monotonic clock appears to have reset.
