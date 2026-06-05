from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from .module_api import ActionContext, ActionResult
from .policy import ActionRequest


ActionHandler = Callable[[ActionContext], ActionResult]


def _require_non_empty_string(value: object, *, field_name: str) -> None:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{field_name} must be a non-empty string")


@dataclass(slots=True)
class ActionDispatchResult:
    handler_called: bool
    payload: dict[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not isinstance(self.handler_called, bool):
            raise ValueError("handler_called must be a boolean")
        if not isinstance(self.payload, dict):
            raise ValueError("payload must be a dict[str, str]")
        for key, value in self.payload.items():
            if not isinstance(key, str) or not key:
                raise ValueError("dispatch payload keys must be non-empty strings")
            if not isinstance(value, str):
                raise ValueError("dispatch payload values must be strings")
        self.payload = dict(self.payload)


@dataclass(slots=True)
class ActionDispatcher:
    handlers: dict[tuple[str, str], ActionHandler] = field(default_factory=dict)
    handler_owners: dict[tuple[str, str], str | None] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not isinstance(self.handlers, dict):
            raise ValueError("handlers must be a dict[tuple[str, str], ActionHandler]")
        if not isinstance(self.handler_owners, dict):
            raise ValueError("handler_owners must be a dict[tuple[str, str], str | None]")
        normalized_handlers: dict[tuple[str, str], ActionHandler] = {}
        for key, handler in self.handlers.items():
            if not isinstance(key, tuple) or len(key) != 2:
                raise ValueError("handler keys must be (module_id, action_type) tuples")
            module_id, action_type = key
            _require_non_empty_string(module_id, field_name="module_id")
            _require_non_empty_string(action_type, field_name="action_type")
            if not callable(handler):
                raise ValueError("handler must be callable")
            normalized_handlers[(module_id, action_type)] = handler
        normalized_owners: dict[tuple[str, str], str | None] = {}
        for key, owner_package_id in self.handler_owners.items():
            if key not in normalized_handlers:
                raise ValueError("handler owner keys must reference registered handlers")
            if owner_package_id is not None:
                _require_non_empty_string(owner_package_id, field_name="owner_package_id")
            normalized_owners[key] = owner_package_id
        self.handlers = dict(normalized_handlers)
        self.handler_owners = dict(normalized_owners)

    def _validate_internal_state(self) -> None:
        if not isinstance(self.handlers, dict):
            raise ValueError("handlers must be a dict[tuple[str, str], ActionHandler]")
        if not isinstance(self.handler_owners, dict):
            raise ValueError("handler_owners must be a dict[tuple[str, str], str | None]")
        for key, handler in self.handlers.items():
            if not isinstance(key, tuple) or len(key) != 2:
                raise ValueError("handler keys must be (module_id, action_type) tuples")
            module_id, action_type = key
            _require_non_empty_string(module_id, field_name="module_id")
            _require_non_empty_string(action_type, field_name="action_type")
            if not callable(handler):
                raise ValueError("handler must be callable")
        for key, owner_package_id in self.handler_owners.items():
            if key not in self.handlers:
                raise ValueError("handler owner keys must reference registered handlers")
            if owner_package_id is not None:
                _require_non_empty_string(owner_package_id, field_name="owner_package_id")

    def register_handler(
        self,
        module_id: str,
        action_type: str,
        handler: ActionHandler,
        *,
        owner_package_id: str | None = None,
    ) -> None:
        _require_non_empty_string(module_id, field_name="module_id")
        _require_non_empty_string(action_type, field_name="action_type")
        self._validate_internal_state()
        if not callable(handler):
            raise ValueError("handler must be callable")
        if owner_package_id is not None:
            _require_non_empty_string(owner_package_id, field_name="owner_package_id")
        if self.has_handler(module_id, action_type):
            raise ValueError(f"handler already registered for {module_id}:{action_type}")
        key = (module_id, action_type)
        self.handlers[key] = handler
        self.handler_owners[key] = owner_package_id

    def has_handler(self, module_id: str, action_type: str) -> bool:
        _require_non_empty_string(module_id, field_name="module_id")
        _require_non_empty_string(action_type, field_name="action_type")
        self._validate_internal_state()
        return (module_id, action_type) in self.handlers

    def owner_for(self, module_id: str, action_type: str) -> str | None:
        _require_non_empty_string(module_id, field_name="module_id")
        _require_non_empty_string(action_type, field_name="action_type")
        self._validate_internal_state()
        return self.handler_owners.get((module_id, action_type))

    def list_action_types(self, module_id: str) -> list[str]:
        _require_non_empty_string(module_id, field_name="module_id")
        self._validate_internal_state()
        return sorted(action_type for registered_module_id, action_type in self.handlers if registered_module_id == module_id)

    def unregister_handler(
        self,
        module_id: str,
        action_type: str,
        *,
        owner_package_id: str | None = None,
    ) -> None:
        _require_non_empty_string(module_id, field_name="module_id")
        _require_non_empty_string(action_type, field_name="action_type")
        self._validate_internal_state()
        if owner_package_id is not None:
            _require_non_empty_string(owner_package_id, field_name="owner_package_id")
        key = (module_id, action_type)
        if owner_package_id is not None and self.handler_owners.get(key) != owner_package_id:
            return
        self.handlers.pop(key, None)
        self.handler_owners.pop(key, None)

    def unregister_module(self, module_id: str, *, owner_package_id: str | None = None) -> None:
        _require_non_empty_string(module_id, field_name="module_id")
        self._validate_internal_state()
        if owner_package_id is not None:
            _require_non_empty_string(owner_package_id, field_name="owner_package_id")
        for key in [key for key in self.handlers if key[0] == module_id]:
            if owner_package_id is not None and self.handler_owners.get(key) != owner_package_id:
                continue
            del self.handlers[key]
            self.handler_owners.pop(key, None)

    def dispatch(self, context: ActionContext) -> ActionDispatchResult:
        if not isinstance(context, ActionContext):
            raise ValueError("context must be an ActionContext")
        self._validate_internal_state()
        request = context.request
        handler = self.handlers.get((request.module_id, request.action_type))
        if handler is None:
            return ActionDispatchResult(handler_called=False)
        result = handler(context)
        if not isinstance(result, ActionResult):
            raise ValueError("action handler must return an ActionResult")
        return ActionDispatchResult(handler_called=True, payload=result.as_payload())
