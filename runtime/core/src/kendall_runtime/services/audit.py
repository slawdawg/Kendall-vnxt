from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, UTC


def _require_non_empty_string(value: object, *, field_name: str) -> None:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{field_name} must be a non-empty string")


def _validate_details(details: object) -> None:
    if not isinstance(details, dict):
        raise ValueError("details must be a dict[str, str]")
    for key, value in details.items():
        if not isinstance(key, str) or not key:
            raise ValueError("audit detail keys must be non-empty strings")
        if not isinstance(value, str):
            raise ValueError("audit detail values must be strings")


@dataclass(slots=True)
class AuditRecord:
    timestamp: str
    actor: str
    action_type: str
    target: str
    details: dict[str, str]
    reversible: bool = False

    def __post_init__(self) -> None:
        _require_non_empty_string(self.timestamp, field_name="timestamp")
        _require_non_empty_string(self.actor, field_name="actor")
        _require_non_empty_string(self.action_type, field_name="action_type")
        _require_non_empty_string(self.target, field_name="target")
        _validate_details(self.details)
        if not isinstance(self.reversible, bool):
            raise ValueError("reversible must be a boolean")
        self.details = dict(self.details)

    def clone(self) -> "AuditRecord":
        return AuditRecord(
            timestamp=self.timestamp,
            actor=self.actor,
            action_type=self.action_type,
            target=self.target,
            details=dict(self.details),
            reversible=self.reversible,
        )


@dataclass(slots=True)
class AuditService:
    """Release 1 audit and undo scaffold."""

    records: list[AuditRecord] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not isinstance(self.records, list):
            raise ValueError("records must be a list[AuditRecord]")
        if any(not isinstance(record, AuditRecord) for record in self.records):
            raise ValueError("records must contain AuditRecord instances")
        self.records = [record.clone() for record in self.records]

    def _validated_records(self) -> list[AuditRecord]:
        if not isinstance(self.records, list):
            raise ValueError("records must be a list[AuditRecord]")
        if any(not isinstance(record, AuditRecord) for record in self.records):
            raise ValueError("records must contain AuditRecord instances")
        return self.records

    def append(
        self,
        *,
        actor: str,
        action_type: str,
        target: str,
        details: dict[str, str] | None = None,
        reversible: bool = False,
    ) -> AuditRecord:
        _require_non_empty_string(actor, field_name="actor")
        _require_non_empty_string(action_type, field_name="action_type")
        _require_non_empty_string(target, field_name="target")
        if details is not None:
            _validate_details(details)
        if not isinstance(reversible, bool):
            raise ValueError("reversible must be a boolean")
        self._validated_records()
        record = AuditRecord(
            timestamp=datetime.now(UTC).isoformat(),
            actor=actor,
            action_type=action_type,
            target=target,
            details=dict(details or {}),
            reversible=reversible,
        )
        self.records.append(record)
        return record.clone()

    def reversible_records(self) -> list[AuditRecord]:
        return [record.clone() for record in self._validated_records() if record.reversible]

    def list_records(self) -> list[AuditRecord]:
        return [record.clone() for record in self._validated_records()]
