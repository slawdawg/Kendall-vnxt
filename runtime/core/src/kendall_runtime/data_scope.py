from __future__ import annotations

from dataclasses import dataclass

from .module_manager import ModuleManager
from .services.data import DataRecord, DataService


def _require_non_empty_string(value: object, *, field_name: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{field_name} must be a non-empty string")
    return value


@dataclass(slots=True)
class ScopedDataView:
    module_id: str
    readable_classes: frozenset[str]
    writable_classes: frozenset[str]
    data_service: DataService

    def __post_init__(self) -> None:
        if not isinstance(self.module_id, str) or not self.module_id:
            raise ValueError("scoped data view must declare a module_id")
        if not isinstance(self.readable_classes, frozenset):
            raise ValueError("scoped data view readable_classes must be a frozenset")
        if not isinstance(self.writable_classes, frozenset):
            raise ValueError("scoped data view writable_classes must be a frozenset")
        if any(not isinstance(name, str) or not name for name in self.readable_classes):
            raise ValueError("scoped data view readable_classes must contain non-empty strings")
        if any(not isinstance(name, str) or not name for name in self.writable_classes):
            raise ValueError("scoped data view writable_classes must contain non-empty strings")
        if not isinstance(self.data_service, DataService):
            raise ValueError("scoped data view data_service must be a DataService")
        self.readable_classes = frozenset(self.readable_classes)
        self.writable_classes = frozenset(self.writable_classes)

    def clone(self) -> "ScopedDataView":
        return ScopedDataView(
            module_id=self.module_id,
            readable_classes=frozenset(self.readable_classes),
            writable_classes=frozenset(self.writable_classes),
            data_service=self.data_service,
        )

    def get(self, data_class: str, record_id: str) -> DataRecord | None:
        _require_non_empty_string(data_class, field_name="data_class")
        _require_non_empty_string(record_id, field_name="record_id")
        self._require_read_access(data_class)
        return self.data_service.get(data_class, record_id)

    def list(self, data_class: str) -> list[DataRecord]:
        _require_non_empty_string(data_class, field_name="data_class")
        self._require_read_access(data_class)
        return self.data_service.list(data_class)

    def put(self, data_class: str, record_id: str, payload: dict[str, str], source: str) -> DataRecord:
        _require_non_empty_string(data_class, field_name="data_class")
        _require_non_empty_string(record_id, field_name="record_id")
        _require_non_empty_string(source, field_name="source")
        self._require_write_access(data_class)
        return self.data_service.put(data_class, record_id, payload, source)

    def delete(self, data_class: str, record_id: str) -> bool:
        _require_non_empty_string(data_class, field_name="data_class")
        _require_non_empty_string(record_id, field_name="record_id")
        self._require_write_access(data_class)
        return self.data_service.delete(data_class, record_id)

    def _require_read_access(self, data_class: str) -> None:
        if data_class not in self.readable_classes:
            raise PermissionError(f"module {self.module_id} cannot read data class: {data_class}")

    def _require_write_access(self, data_class: str) -> None:
        if data_class not in self.writable_classes:
            raise PermissionError(f"module {self.module_id} cannot write data class: {data_class}")


@dataclass(slots=True)
class DataScopeManager:
    module_manager: ModuleManager
    data_service: DataService

    def __post_init__(self) -> None:
        if not isinstance(self.module_manager, ModuleManager):
            raise ValueError("data scope manager module_manager must be a ModuleManager")
        if not isinstance(self.data_service, DataService):
            raise ValueError("data scope manager data_service must be a DataService")

    def for_module(self, module_id: str) -> ScopedDataView:
        _require_non_empty_string(module_id, field_name="module_id")
        registered = self.module_manager.get_module(module_id)
        data_access = registered.contract.data_access
        readable = frozenset(data_access.get("readable_data_classes", []))
        writable = frozenset(data_access.get("writable_data_classes", []))
        return ScopedDataView(
            module_id=module_id,
            readable_classes=readable,
            writable_classes=writable,
            data_service=self.data_service,
        )
