# Core Service Boundaries

## Purpose

This document defines the initial Release 1 boundaries for core runtime services. The core owns stable product behavior. Modules extend the product through contracts and must not bypass core policy or memory boundaries.

## Core Services

### Persona Service

Owns:

- single chief-of-staff assistant identity
- assistant voice continuity
- cross-module response presentation

Must not own:

- module-specific business logic
- direct external integration logic

### Orchestration Service

Owns:

- module coordination
- routing between advisory, drafting, and internal action paths
- cross-module workflow composition

Must not own:

- raw module implementation details

### Trust and Policy Service

Owns:

- domain-based trust posture
- approval requirements
- blocked external action rules
- shadow-mode gating

Must not be bypassed by modules.

### Memory Service

Owns:

- core preference memory
- domain preference memory
- factual correction memory
- situational exception memory
- trust history

Must expose explicit APIs for read and write scope.

### Briefing Service

Owns:

- morning briefing orchestration
- weekend briefing orchestration
- briefing composition rules

Consumes module signals but remains core-owned.

### Inference Routing Service

Owns:

- shared inference selection
- local backend routing
- optional hosted escalation path selection

Modules request inference through this service instead of choosing providers directly.

### Outbound Privacy Gate

Owns:

- outbound hosted-policy enforcement
- sanitization and minimization
- outbound denial or approval logic

All hosted requests must flow through this boundary.

### Audit and Undo Service

Owns:

- shared action ledger
- internal action replay metadata
- undo support for reversible internal actions

### Module Manager

Owns:

- module discovery
- contract validation
- registration
- enable and disable state

### Update Manager

Owns:

- coordinated Release 1 bundle update flow
- trusted update metadata validation

### Main UI Shell

Owns:

- daily command center
- assistant chat shell
- approval presentation
- briefing display

### Admin and Status Shell

Owns:

- deep operational transparency
- module status
- queues, health, uptime, approvals, and observability surfaces

## Boundary Rules

- Modules may contribute signals, not replace core services.
- Modules must use the shared contract schema.
- Modules must use core trust, memory, inference, and privacy boundaries.
- Runtime-visible behaviors should remain product-centric, not builder-centric.
