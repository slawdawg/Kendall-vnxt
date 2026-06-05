from __future__ import annotations

from dataclasses import dataclass

from .module_manager import ModuleManager
from .services.memory import MemoryEntry, MemoryService


def _require_non_empty_string(value: object, *, field_name: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{field_name} must be a non-empty string")
    return value


def _normalize_memory_class(name: str) -> str:
    _require_non_empty_string(name, field_name="memory_class")
    return name.replace("-", "_")


@dataclass(slots=True)
class ScopedMemoryView:
    module_id: str
    readable_classes: frozenset[str]
    writable_classes: frozenset[str]
    memory_service: MemoryService

    def __post_init__(self) -> None:
        if not isinstance(self.module_id, str) or not self.module_id:
            raise ValueError("scoped memory view must declare a module_id")
        if not isinstance(self.readable_classes, frozenset):
            raise ValueError("scoped memory view readable_classes must be a frozenset")
        if not isinstance(self.writable_classes, frozenset):
            raise ValueError("scoped memory view writable_classes must be a frozenset")
        if any(not isinstance(name, str) or not name for name in self.readable_classes):
            raise ValueError("scoped memory view readable_classes must contain non-empty strings")
        if any(not isinstance(name, str) or not name for name in self.writable_classes):
            raise ValueError("scoped memory view writable_classes must contain non-empty strings")
        if not isinstance(self.memory_service, MemoryService):
            raise ValueError("scoped memory view memory_service must be a MemoryService")
        self.readable_classes = frozenset(self.readable_classes)
        self.writable_classes = frozenset(self.writable_classes)

    def clone(self) -> "ScopedMemoryView":
        return ScopedMemoryView(
            module_id=self.module_id,
            readable_classes=frozenset(self.readable_classes),
            writable_classes=frozenset(self.writable_classes),
            memory_service=self.memory_service,
        )

    def get(self, memory_class: str, key: str) -> MemoryEntry | None:
        normalized = _normalize_memory_class(memory_class)
        _require_non_empty_string(key, field_name="key")
        self._require_read_access(normalized)
        return self.memory_service.get(normalized, key)

    def put(self, memory_class: str, key: str, value: str, source: str) -> MemoryEntry:
        normalized = _normalize_memory_class(memory_class)
        _require_non_empty_string(key, field_name="key")
        _require_non_empty_string(source, field_name="source")
        self._require_write_access(normalized)
        return self.memory_service.put(normalized, key, value, source)

    def delete(self, memory_class: str, key: str) -> bool:
        normalized = _normalize_memory_class(memory_class)
        _require_non_empty_string(key, field_name="key")
        self._require_write_access(normalized)
        return self.memory_service.delete(normalized, key)

    def _require_read_access(self, memory_class: str) -> None:
        if memory_class not in self.readable_classes:
            raise PermissionError(f"module {self.module_id} cannot read memory class: {memory_class}")

    def _require_write_access(self, memory_class: str) -> None:
        if memory_class not in self.writable_classes:
            raise PermissionError(f"module {self.module_id} cannot write memory class: {memory_class}")


@dataclass(slots=True)
class MemoryScopeManager:
    module_manager: ModuleManager
    memory_service: MemoryService

    def __post_init__(self) -> None:
        if not isinstance(self.module_manager, ModuleManager):
            raise ValueError("memory scope manager module_manager must be a ModuleManager")
        if not isinstance(self.memory_service, MemoryService):
            raise ValueError("memory scope manager memory_service must be a MemoryService")

    def for_module(self, module_id: str) -> ScopedMemoryView:
        _require_non_empty_string(module_id, field_name="module_id")
        registered = self.module_manager.get_module(module_id)
        memory_contract = registered.contract.memory
        readable = frozenset(_normalize_memory_class(name) for name in memory_contract.get("readable_memory_classes", []))
        writable = frozenset(_normalize_memory_class(name) for name in memory_contract.get("writable_memory_classes", []))
        return ScopedMemoryView(
            module_id=module_id,
            readable_classes=readable,
            writable_classes=writable,
            memory_service=self.memory_service,
        )
