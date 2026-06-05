from __future__ import annotations

from dataclasses import dataclass, field


MEMORY_CLASSES = (
    "core_preference",
    "domain_preference",
    "factual_correction",
    "situational_exception",
    "trust_history",
)


def _require_non_empty_string(value: object, *, field_name: str) -> None:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{field_name} must be a non-empty string")


@dataclass(slots=True)
class MemoryEntry:
    key: str
    value: str
    source: str

    def __post_init__(self) -> None:
        _require_non_empty_string(self.key, field_name="key")
        if not isinstance(self.value, str):
            raise ValueError("value must be a string")
        _require_non_empty_string(self.source, field_name="source")

    def clone(self) -> "MemoryEntry":
        return MemoryEntry(key=self.key, value=self.value, source=self.source)


@dataclass(slots=True)
class MemoryService:
    """Release 1 layered memory scaffold."""

    buckets: dict[str, dict[str, MemoryEntry]] = field(
        default_factory=lambda: {memory_class: {} for memory_class in MEMORY_CLASSES}
    )

    def __post_init__(self) -> None:
        if not isinstance(self.buckets, dict):
            raise ValueError("buckets must be a dict[str, dict[str, MemoryEntry]]")
        normalized_buckets: dict[str, dict[str, MemoryEntry]] = {
            memory_class: {} for memory_class in MEMORY_CLASSES
        }
        for memory_class, bucket in self.buckets.items():
            _require_non_empty_string(memory_class, field_name="memory_class")
            if memory_class not in normalized_buckets:
                raise ValueError(f"unknown memory class: {memory_class}")
            if not isinstance(bucket, dict):
                raise ValueError("memory buckets must contain dict[str, MemoryEntry] values")
            normalized_bucket: dict[str, MemoryEntry] = {}
            for key, entry in bucket.items():
                _require_non_empty_string(key, field_name="key")
                if not isinstance(entry, MemoryEntry):
                    raise ValueError("memory buckets must contain MemoryEntry instances")
                if entry.key != key:
                    raise ValueError("memory bucket key must match MemoryEntry.key")
                normalized_bucket[key] = entry.clone()
            normalized_buckets[memory_class] = normalized_bucket
        self.buckets = normalized_buckets

    def _validate_internal_state(self) -> None:
        if not isinstance(self.buckets, dict):
            raise ValueError("buckets must be a dict[str, dict[str, MemoryEntry]]")
        for memory_class, bucket in self.buckets.items():
            _require_non_empty_string(memory_class, field_name="memory_class")
            if memory_class not in MEMORY_CLASSES:
                raise ValueError(f"unknown memory class: {memory_class}")
            if not isinstance(bucket, dict):
                raise ValueError("memory buckets must contain dict[str, MemoryEntry] values")
            for key, entry in bucket.items():
                _require_non_empty_string(key, field_name="key")
                if not isinstance(entry, MemoryEntry):
                    raise ValueError("memory buckets must contain MemoryEntry instances")
                if entry.key != key:
                    raise ValueError("memory bucket key must match MemoryEntry.key")

    def put(self, memory_class: str, key: str, value: str, source: str) -> MemoryEntry:
        _require_non_empty_string(memory_class, field_name="memory_class")
        self._validate_internal_state()
        if memory_class not in self.buckets:
            raise KeyError(f"unknown memory class: {memory_class}")
        _require_non_empty_string(key, field_name="key")
        _require_non_empty_string(source, field_name="source")
        if not isinstance(value, str):
            raise ValueError("value must be a string")
        entry = MemoryEntry(key=key, value=value, source=source)
        self.buckets[memory_class][key] = entry
        return entry.clone()

    def get(self, memory_class: str, key: str) -> MemoryEntry | None:
        _require_non_empty_string(memory_class, field_name="memory_class")
        self._validate_internal_state()
        if memory_class not in self.buckets:
            raise KeyError(f"unknown memory class: {memory_class}")
        _require_non_empty_string(key, field_name="key")
        entry = self.buckets[memory_class].get(key)
        if entry is None:
            return None
        return entry.clone()

    def delete(self, memory_class: str, key: str) -> bool:
        _require_non_empty_string(memory_class, field_name="memory_class")
        self._validate_internal_state()
        if memory_class not in self.buckets:
            raise KeyError(f"unknown memory class: {memory_class}")
        _require_non_empty_string(key, field_name="key")
        return self.buckets[memory_class].pop(key, None) is not None

    def entry_count(self) -> int:
        self._validate_internal_state()
        return sum(len(bucket) for bucket in self.buckets.values())

    def entry_count_by_class(self) -> dict[str, int]:
        self._validate_internal_state()
        return {memory_class: len(bucket) for memory_class, bucket in sorted(self.buckets.items())}
