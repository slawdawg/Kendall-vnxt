from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
import json

from .services.trust import VALID_POSTURES


class ContractValidationError(ValueError):
    """Raised when a module contract fails local validation."""


VALID_RELEASE_CHANNELS = frozenset({"dev", "preview", "stable"})
VALID_SCOPES_OF_AGENCY = frozenset({"advisory", "drafting", "internal-action", "external-action", "mixed"})


def _require_keys(payload: dict, path: str, keys: list[str]) -> None:
    missing = [key for key in keys if key not in payload]
    if missing:
        joined = ", ".join(missing)
        raise ContractValidationError(f"{path} missing required keys: {joined}")


def _validate_enum(value: object, *, path: str, valid_values: frozenset[str]) -> None:
    if not isinstance(value, str) or value not in valid_values:
        joined = ", ".join(sorted(valid_values))
        raise ContractValidationError(f"{path} must be one of: {joined}")


def _validate_string_list(value: object, *, path: str) -> None:
    if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
        raise ContractValidationError(f"{path} must be a list of strings")


def _validate_string_dict(value: object, *, path: str) -> None:
    if not isinstance(value, dict):
        raise ContractValidationError(f"{path} must be an object")


def _validate_boolean(value: object, *, path: str) -> None:
    if not isinstance(value, bool):
        raise ContractValidationError(f"{path} must be a boolean")


def _clone_nested(value: object) -> object:
    if isinstance(value, dict):
        return {key: _clone_nested(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_clone_nested(item) for item in value]
    return value


@dataclass(slots=True)
class ModuleIdentity:
    module_id: str
    display_name: str
    version: str
    publisher: str
    description: str = ""
    release_channel: str = "dev"

    def __post_init__(self) -> None:
        for field_name in ("module_id", "display_name", "version", "publisher"):
            value = getattr(self, field_name)
            if not isinstance(value, str) or not value:
                raise ValueError(f"{field_name} must be a non-empty string")
        if not isinstance(self.description, str):
            raise ValueError("description must be a string")
        _validate_enum(self.release_channel, path="identity.release_channel", valid_values=VALID_RELEASE_CHANNELS)

    def clone(self) -> "ModuleIdentity":
        return ModuleIdentity(
            module_id=self.module_id,
            display_name=self.display_name,
            version=self.version,
            publisher=self.publisher,
            description=self.description,
            release_channel=self.release_channel,
        )


@dataclass(slots=True)
class ModuleCapability:
    purpose: str
    scope_of_agency: str
    installed_capability_label: str = ""
    internal_agents: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not isinstance(self.purpose, str) or not self.purpose:
            raise ValueError("purpose must be a non-empty string")
        _validate_enum(
            self.scope_of_agency,
            path="capability.scope_of_agency",
            valid_values=VALID_SCOPES_OF_AGENCY,
        )
        if not isinstance(self.installed_capability_label, str):
            raise ValueError("installed_capability_label must be a string")
        if not isinstance(self.internal_agents, list) or any(
            not isinstance(agent, str) or not agent for agent in self.internal_agents
        ):
            raise ValueError("internal_agents must be a list of non-empty strings")
        self.internal_agents = list(self.internal_agents)

    def clone(self) -> "ModuleCapability":
        return ModuleCapability(
            purpose=self.purpose,
            scope_of_agency=self.scope_of_agency,
            installed_capability_label=self.installed_capability_label,
            internal_agents=list(self.internal_agents),
        )


@dataclass(slots=True)
class ModuleContract:
    identity: ModuleIdentity
    capability: ModuleCapability
    data_access: dict
    actions: dict
    trust: dict
    memory: dict
    privacy: dict
    observability: dict
    dependencies: dict
    installation: dict
    source_path: Path

    def __post_init__(self) -> None:
        if not isinstance(self.identity, ModuleIdentity):
            raise ValueError("identity must be a ModuleIdentity")
        if not isinstance(self.capability, ModuleCapability):
            raise ValueError("capability must be a ModuleCapability")
        for field_name in (
            "data_access",
            "actions",
            "trust",
            "memory",
            "privacy",
            "observability",
            "dependencies",
            "installation",
        ):
            value = getattr(self, field_name)
            if not isinstance(value, dict):
                raise ValueError(f"{field_name} must be an object")
        if not isinstance(self.source_path, Path):
            raise ValueError("source_path must be a pathlib.Path")
        self.data_access = _clone_nested(self.data_access)
        self.actions = _clone_nested(self.actions)
        self.trust = _clone_nested(self.trust)
        self.memory = _clone_nested(self.memory)
        self.privacy = _clone_nested(self.privacy)
        self.observability = _clone_nested(self.observability)
        self.dependencies = _clone_nested(self.dependencies)
        self.installation = _clone_nested(self.installation)

    def clone(self) -> "ModuleContract":
        return ModuleContract(
            identity=self.identity.clone(),
            capability=self.capability.clone(),
            data_access=_clone_nested(self.data_access),
            actions=_clone_nested(self.actions),
            trust=_clone_nested(self.trust),
            memory=_clone_nested(self.memory),
            privacy=_clone_nested(self.privacy),
            observability=_clone_nested(self.observability),
            dependencies=_clone_nested(self.dependencies),
            installation=_clone_nested(self.installation),
            source_path=self.source_path,
        )

    @classmethod
    def from_path(cls, path: Path) -> "ModuleContract":
        payload = json.loads(path.read_text(encoding="utf-8"))
        return cls.from_dict(payload, source_path=path)

    @classmethod
    def from_dict(cls, payload: dict, source_path: Path) -> "ModuleContract":
        top_level = [
            "identity",
            "capability",
            "data_access",
            "actions",
            "trust",
            "memory",
            "privacy",
            "observability",
            "dependencies",
            "installation",
        ]
        _require_keys(payload, "contract", top_level)

        identity_payload = payload["identity"]
        capability_payload = payload["capability"]
        data_access_payload = payload["data_access"]
        actions_payload = payload["actions"]
        trust_payload = payload["trust"]
        memory_payload = payload["memory"]
        privacy_payload = payload["privacy"]
        observability_payload = payload["observability"]
        dependencies_payload = payload["dependencies"]
        installation_payload = payload["installation"]
        _require_keys(identity_payload, "identity", ["module_id", "display_name", "version", "publisher"])
        _require_keys(capability_payload, "capability", ["purpose", "scope_of_agency"])
        _require_keys(trust_payload, "trust", ["initial_posture"])
        _require_keys(privacy_payload, "privacy", ["local_only_by_default"])
        for key, section in (
            ("data_access", data_access_payload),
            ("actions", actions_payload),
            ("trust", trust_payload),
            ("memory", memory_payload),
            ("privacy", privacy_payload),
            ("observability", observability_payload),
            ("dependencies", dependencies_payload),
            ("installation", installation_payload),
        ):
            _validate_string_dict(section, path=key)

        if "release_channel" in identity_payload:
            _validate_enum(
                identity_payload["release_channel"],
                path="identity.release_channel",
                valid_values=VALID_RELEASE_CHANNELS,
            )
        _validate_enum(
            capability_payload["scope_of_agency"],
            path="capability.scope_of_agency",
            valid_values=VALID_SCOPES_OF_AGENCY,
        )
        _validate_enum(
            trust_payload["initial_posture"],
            path="trust.initial_posture",
            valid_values=VALID_POSTURES,
        )
        if "supported_autonomy_levels" in trust_payload:
            _validate_string_list(trust_payload["supported_autonomy_levels"], path="trust.supported_autonomy_levels")
            for index, posture in enumerate(trust_payload["supported_autonomy_levels"]):
                _validate_enum(
                    posture,
                    path=f"trust.supported_autonomy_levels[{index}]",
                    valid_values=VALID_POSTURES,
                )
            if trust_payload["supported_autonomy_levels"] and trust_payload["initial_posture"] not in trust_payload["supported_autonomy_levels"]:
                raise ContractValidationError(
                    "trust.initial_posture must be included in trust.supported_autonomy_levels when support levels are declared"
                )
        for key in ("approval_required_for", "blocked_in_release_1"):
            if key in trust_payload:
                _validate_string_list(trust_payload[key], path=f"trust.{key}")
        for key in ("readable_data_classes", "writable_data_classes", "forbidden_data_classes"):
            if key in data_access_payload:
                _validate_string_list(data_access_payload[key], path=f"data_access.{key}")
        for key in (
            "advisory_outputs",
            "drafting_outputs",
            "internal_actions",
            "external_actions",
            "forbidden_actions",
        ):
            if key in actions_payload:
                _validate_string_list(actions_payload[key], path=f"actions.{key}")
        self_module_id = identity_payload["module_id"]
        declared_action_groups = {
            "advisory_outputs": set(actions_payload.get("advisory_outputs", [])),
            "drafting_outputs": set(actions_payload.get("drafting_outputs", [])),
            "internal_actions": set(actions_payload.get("internal_actions", [])),
            "external_actions": set(actions_payload.get("external_actions", [])),
        }
        group_names = list(declared_action_groups)
        for index, group_name in enumerate(group_names):
            current_actions = declared_action_groups[group_name]
            for other_name in group_names[index + 1 :]:
                overlap = sorted(current_actions & declared_action_groups[other_name])
                if overlap:
                    raise ContractValidationError(
                        f"actions.{group_name} overlaps actions.{other_name}: {', '.join(overlap)}"
                    )
        forbidden_actions = set(actions_payload.get("forbidden_actions", []))
        declared_actions = set().union(*declared_action_groups.values()) if declared_action_groups else set()
        overlap = sorted(forbidden_actions & declared_actions)
        if overlap:
            raise ContractValidationError(
                f"actions.forbidden_actions overlaps declared actions: {', '.join(overlap)}"
            )
        for key in ("readable_memory_classes", "writable_memory_classes", "accepted_correction_types"):
            if key in memory_payload:
                _validate_string_list(memory_payload[key], path=f"memory.{key}")
        if "shared_preference_propagation" in memory_payload:
            _validate_boolean(
                memory_payload["shared_preference_propagation"],
                path="memory.shared_preference_propagation",
            )
        _validate_boolean(privacy_payload["local_only_by_default"], path="privacy.local_only_by_default")
        for key in ("hosted_eligible_data_classes", "forbidden_outbound_contexts"):
            if key in privacy_payload:
                _validate_string_list(privacy_payload[key], path=f"privacy.{key}")
        if "sanitization_required" in privacy_payload:
            _validate_boolean(privacy_payload["sanitization_required"], path="privacy.sanitization_required")
        for key in ("status_events", "audit_event_types", "metrics"):
            if key in observability_payload:
                _validate_string_list(observability_payload[key], path=f"observability.{key}")
        for key in ("required_core_capabilities", "required_modules", "optional_modules"):
            if key in dependencies_payload:
                _validate_string_list(dependencies_payload[key], path=f"dependencies.{key}")
        if self_module_id in set(dependencies_payload.get("required_modules", [])):
            raise ContractValidationError("dependencies.required_modules cannot include the module itself")
        dependency_overlap = sorted(
            set(dependencies_payload.get("required_modules", [])) & set(dependencies_payload.get("optional_modules", []))
        )
        if dependency_overlap:
            raise ContractValidationError(
                f"dependencies.required_modules overlaps dependencies.optional_modules: {', '.join(dependency_overlap)}"
            )
        for key in ("setup_steps", "migrations", "compatible_core_versions"):
            if key in installation_payload:
                _validate_string_list(installation_payload[key], path=f"installation.{key}")
        if "restart_required" in installation_payload:
            _validate_boolean(installation_payload["restart_required"], path="installation.restart_required")

        return cls(
            identity=ModuleIdentity(**identity_payload),
            capability=ModuleCapability(**capability_payload),
            data_access=payload["data_access"],
            actions=payload["actions"],
            trust=payload["trust"],
            memory=payload["memory"],
            privacy=payload["privacy"],
            observability=payload["observability"],
            dependencies=payload["dependencies"],
            installation=payload["installation"],
            source_path=source_path,
        )
