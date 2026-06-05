# Core Runtime

The core runtime owns the stable product spine:

- chief-of-staff persona
- orchestration
- trust and policy
- layered memory
- briefing orchestration
- shared inference routing
- outbound privacy gate
- audit and undo
- module manager
- update manager
- main UI shell
- admin and status shell

Modules extend the core runtime through explicit contracts. Modules must not bypass core policy, memory, or outbound privacy boundaries.

## Implemented Runtime Entry Points

- `KendallRuntime.bootstrap()` wires the core runtime scaffold
- `KendallRuntime.bootstrap_release_one()` adds first-pass `outlook`, `scheduling`, and `tasks` providers and action handlers
- `memory_for_module()` and `data_for_module()` expose contract-scoped access views instead of raw shared stores

## Module-Facing API

- briefing providers receive a typed `BriefingContext` and return `BriefingResult`
- action handlers receive a typed `ActionContext` and return `ActionResult`
- dispatched action payloads include a normalized `reference_id` plus module-specific detail fields
- release-one modules decode data records through typed models in `module_records.py` instead of reading raw payload dicts directly
- release-one module behavior is extracted into service facades in `module_services.py` and registered on the runtime through `module_service_registry.py`
- release-one bootstrap wiring is described declaratively through `module_manifest.py` and applied by `ReleaseOneConfigurer`
- `ModulePackage.install(...)` is now the reusable runtime-level path for installing future module bundles beyond Release 1
- installed module bundles are tracked in `module_package_registry.py`, and runtime status snapshots now expose package inventory alongside module inventory
- package inventory now distinguishes installed bundles from active bundles through package-level activate/deactivate state
