from __future__ import annotations

from dataclasses import dataclass, field

from .briefing import BriefingSignal
from .data_scope import ScopedDataView
from .memory_scope import ScopedMemoryView
from .policy import ActionRequest


@dataclass(slots=True)
class BriefingContext:
    module_id: str
    briefing_type: str
    data: ScopedDataView
    memory: ScopedMemoryView

    def __post_init__(self) -> None:
        if not isinstance(self.module_id, str) or not self.module_id:
            raise ValueError("briefing context must declare a module_id")
        if not isinstance(self.briefing_type, str) or not self.briefing_type:
            raise ValueError("briefing context must declare a briefing_type")
        if not isinstance(self.data, ScopedDataView):
            raise ValueError("briefing context data must be a ScopedDataView")
        if not isinstance(self.memory, ScopedMemoryView):
            raise ValueError("briefing context memory must be a ScopedMemoryView")
        if self.data.module_id != self.module_id:
            raise ValueError(
                f"briefing context module_id {self.module_id} does not match data scope module_id {self.data.module_id}"
            )
        if self.memory.module_id != self.module_id:
            raise ValueError(
                f"briefing context module_id {self.module_id} does not match memory scope module_id {self.memory.module_id}"
            )
        self.data = self.data.clone()
        self.memory = self.memory.clone()


@dataclass(slots=True)
class ActionContext:
    module_id: str
    request: ActionRequest
    data: ScopedDataView
    memory: ScopedMemoryView

    def __post_init__(self) -> None:
        if not isinstance(self.module_id, str) or not self.module_id:
            raise ValueError("action context must declare a module_id")
        if not isinstance(self.request, ActionRequest):
            raise ValueError("action context request must be an ActionRequest")
        if not isinstance(self.data, ScopedDataView):
            raise ValueError("action context data must be a ScopedDataView")
        if not isinstance(self.memory, ScopedMemoryView):
            raise ValueError("action context memory must be a ScopedMemoryView")
        if self.request.module_id != self.module_id:
            raise ValueError(
                f"action context module_id {self.module_id} does not match request module_id {self.request.module_id}"
            )
        if self.data.module_id != self.module_id:
            raise ValueError(
                f"action context module_id {self.module_id} does not match data scope module_id {self.data.module_id}"
            )
        if self.memory.module_id != self.module_id:
            raise ValueError(
                f"action context module_id {self.module_id} does not match memory scope module_id {self.memory.module_id}"
            )
        self.data = self.data.clone()
        self.memory = self.memory.clone()
        self.request = self.request.clone()


@dataclass(slots=True)
class ActionResult:
    status: str
    reference_id: str
    details: dict[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not isinstance(self.status, str) or not self.status:
            raise ValueError("action result must declare a status")
        if not isinstance(self.reference_id, str) or not self.reference_id:
            raise ValueError("action result must declare a reference_id")
        if not isinstance(self.details, dict):
            raise ValueError("action result details must be a dict[str, str]")
        for key, value in self.details.items():
            if not isinstance(key, str) or not key:
                raise ValueError("action result detail keys must be non-empty strings")
            if key in {"status", "reference_id"}:
                raise ValueError(f"action result detail key {key!r} is reserved")
            if not isinstance(value, str):
                raise ValueError("action result detail values must be strings")
        self.details = dict(self.details)

    def as_payload(self) -> dict[str, str]:
        payload = {"status": self.status, "reference_id": self.reference_id}
        payload.update(self.details)
        return dict(payload)


@dataclass(slots=True)
class BriefingResult:
    signals: list[BriefingSignal]

    def __post_init__(self) -> None:
        if not isinstance(self.signals, list):
            raise ValueError("briefing result signals must be a list")
        for signal in self.signals:
            if not isinstance(signal, BriefingSignal):
                raise ValueError("briefing result signals must contain BriefingSignal instances")
        self.signals = [signal.clone() for signal in self.signals]

    def clone(self) -> "BriefingResult":
        return BriefingResult(signals=[signal.clone() for signal in self.signals])
