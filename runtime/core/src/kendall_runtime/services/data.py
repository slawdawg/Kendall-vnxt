from __future__ import annotations

from dataclasses import dataclass, field


def _require_non_empty_string(value: object, *, field_name: str) -> None:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{field_name} must be a non-empty string")


def _require_string_payload(payload: object) -> None:
    if not isinstance(payload, dict):
        raise ValueError("payload must be a dict[str, str]")
    for key, value in payload.items():
        if not isinstance(key, str) or not key:
            raise ValueError("payload keys must be non-empty strings")
        if not isinstance(value, str):
            raise ValueError("payload values must be strings")


@dataclass(slots=True)
class DataRecord:
    record_id: str
    payload: dict[str, str]
    source: str

    def __post_init__(self) -> None:
        _require_non_empty_string(self.record_id, field_name="record_id")
        _require_string_payload(self.payload)
        _require_non_empty_string(self.source, field_name="source")
        self.payload = dict(self.payload)

    def clone(self) -> "DataRecord":
        return DataRecord(record_id=self.record_id, payload=dict(self.payload), source=self.source)


@dataclass(slots=True)
class DataService:
    """Release 1 in-memory data boundary scaffold."""

    buckets: dict[str, dict[str, DataRecord]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not isinstance(self.buckets, dict):
            raise ValueError("buckets must be a dict[str, dict[str, DataRecord]]")
        normalized_buckets: dict[str, dict[str, DataRecord]] = {}
        for data_class, bucket in self.buckets.items():
            _require_non_empty_string(data_class, field_name="data_class")
            if not isinstance(bucket, dict):
                raise ValueError("data buckets must contain dict[str, DataRecord] values")
            normalized_bucket: dict[str, DataRecord] = {}
            for record_id, record in bucket.items():
                _require_non_empty_string(record_id, field_name="record_id")
                if not isinstance(record, DataRecord):
                    raise ValueError("data buckets must contain DataRecord instances")
                if record.record_id != record_id:
                    raise ValueError("data bucket key must match DataRecord.record_id")
                normalized_bucket[record_id] = record.clone()
            normalized_buckets[data_class] = normalized_bucket
        self.buckets = normalized_buckets

    def _validate_internal_state(self) -> None:
        if not isinstance(self.buckets, dict):
            raise ValueError("buckets must be a dict[str, dict[str, DataRecord]]")
        for data_class, bucket in self.buckets.items():
            _require_non_empty_string(data_class, field_name="data_class")
            if not isinstance(bucket, dict):
                raise ValueError("data buckets must contain dict[str, DataRecord] values")
            for record_id, record in bucket.items():
                _require_non_empty_string(record_id, field_name="record_id")
                if not isinstance(record, DataRecord):
                    raise ValueError("data buckets must contain DataRecord instances")
                if record.record_id != record_id:
                    raise ValueError("data bucket key must match DataRecord.record_id")

    def put(self, data_class: str, record_id: str, payload: dict[str, str], source: str) -> DataRecord:
        _require_non_empty_string(data_class, field_name="data_class")
        _require_non_empty_string(record_id, field_name="record_id")
        _require_non_empty_string(source, field_name="source")
        _require_string_payload(payload)
        self._validate_internal_state()
        bucket = self.buckets.setdefault(data_class, {})
        record = DataRecord(record_id=record_id, payload=dict(payload), source=source)
        bucket[record_id] = record
        return record.clone()

    def get(self, data_class: str, record_id: str) -> DataRecord | None:
        _require_non_empty_string(data_class, field_name="data_class")
        _require_non_empty_string(record_id, field_name="record_id")
        self._validate_internal_state()
        record = self.buckets.get(data_class, {}).get(record_id)
        if record is None:
            return None
        return record.clone()

    def list(self, data_class: str) -> list[DataRecord]:
        _require_non_empty_string(data_class, field_name="data_class")
        self._validate_internal_state()
        return [record.clone() for record in self.buckets.get(data_class, {}).values()]

    def delete(self, data_class: str, record_id: str) -> bool:
        _require_non_empty_string(data_class, field_name="data_class")
        _require_non_empty_string(record_id, field_name="record_id")
        self._validate_internal_state()
        bucket = self.buckets.get(data_class, {})
        return bucket.pop(record_id, None) is not None
