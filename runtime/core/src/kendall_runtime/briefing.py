from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime


PRIORITY_ORDER = {
    "critical": 0,
    "high": 1,
    "normal": 2,
    "low": 3,
}
VALID_PRIORITIES = frozenset(PRIORITY_ORDER)


@dataclass(slots=True)
class BriefingSignal:
    module_id: str
    summary: str
    priority: str = "normal"
    category: str = "general"
    details: dict[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not isinstance(self.priority, str) or self.priority not in VALID_PRIORITIES:
            joined = ", ".join(sorted(VALID_PRIORITIES))
            raise ValueError(f"unknown briefing priority {self.priority!r}; expected one of: {joined}")
        if not isinstance(self.module_id, str) or not self.module_id:
            raise ValueError("briefing signal must declare a module_id")
        if not isinstance(self.summary, str) or not self.summary:
            raise ValueError("briefing signal must include a summary")
        if not isinstance(self.category, str) or not self.category:
            raise ValueError("briefing signal must include a category")
        if not isinstance(self.details, dict):
            raise ValueError("briefing signal details must be a dict")
        for key, value in self.details.items():
            if not isinstance(key, str) or not key:
                raise ValueError("briefing signal detail keys must be non-empty strings")
            if not isinstance(value, str):
                raise ValueError("briefing signal detail values must be strings")
        self.details = dict(self.details)

    def clone(self) -> "BriefingSignal":
        return BriefingSignal(
            module_id=self.module_id,
            summary=self.summary,
            priority=self.priority,
            category=self.category,
            details=dict(self.details),
        )


@dataclass(slots=True)
class BriefingPacket:
    briefing_type: str
    generated_at: str
    headline: str
    items: list[BriefingSignal]
    participating_modules: list[str]

    def __post_init__(self) -> None:
        if not isinstance(self.briefing_type, str) or not self.briefing_type:
            raise ValueError("briefing packet must declare a briefing_type")
        if not isinstance(self.generated_at, str) or not self.generated_at:
            raise ValueError("briefing packet must declare generated_at")
        if not isinstance(self.headline, str) or not self.headline:
            raise ValueError("briefing packet must include a headline")
        if not isinstance(self.items, list):
            raise ValueError("briefing packet items must be a list")
        if not isinstance(self.participating_modules, list):
            raise ValueError("briefing packet participating_modules must be a list")
        if any(not isinstance(item, BriefingSignal) for item in self.items):
            raise ValueError("briefing packet items must contain BriefingSignal instances")
        if any(not isinstance(module_id, str) or not module_id for module_id in self.participating_modules):
            raise ValueError("briefing packet participating_modules must contain non-empty strings")
        self.items = [item.clone() for item in self.items]
        self.participating_modules = list(self.participating_modules)

    def clone(self) -> "BriefingPacket":
        return BriefingPacket(
            briefing_type=self.briefing_type,
            generated_at=self.generated_at,
            headline=self.headline,
            items=[item.clone() for item in self.items],
            participating_modules=list(self.participating_modules),
        )


@dataclass(slots=True)
class BriefingService:
    """Compose core-owned briefings from module-provided signals."""

    def compose(self, briefing_type: str, signals: list[BriefingSignal], *, max_items: int = 8) -> BriefingPacket:
        if not isinstance(briefing_type, str) or not briefing_type:
            raise ValueError("briefing_type must be a non-empty string")
        if not isinstance(signals, list):
            raise ValueError("signals must be a list[BriefingSignal]")
        if any(not isinstance(signal, BriefingSignal) for signal in signals):
            raise ValueError("signals must contain BriefingSignal instances")
        if not isinstance(max_items, int) or max_items < 0:
            raise ValueError("max_items must be a non-negative integer")
        ordered = sorted(
            signals,
            key=lambda signal: (
                PRIORITY_ORDER.get(signal.priority, PRIORITY_ORDER["normal"]),
                signal.module_id,
                signal.summary,
            ),
        )
        selected = ordered[:max_items]
        modules = sorted({signal.module_id for signal in selected})
        headline = self._build_headline(briefing_type, selected)
        return BriefingPacket(
            briefing_type=briefing_type,
            generated_at=datetime.now(UTC).isoformat(),
            headline=headline,
            items=[signal.clone() for signal in selected],
            participating_modules=list(modules),
        ).clone()

    def _build_headline(self, briefing_type: str, items: list[BriefingSignal]) -> str:
        if not isinstance(briefing_type, str) or not briefing_type:
            raise ValueError("briefing_type must be a non-empty string")
        if not isinstance(items, list):
            raise ValueError("items must be a list[BriefingSignal]")
        if any(not isinstance(item, BriefingSignal) for item in items):
            raise ValueError("items must contain BriefingSignal instances")
        if not items:
            return f"{briefing_type.title()} briefing is clear."

        critical_count = sum(1 for item in items if item.priority == "critical")
        high_count = sum(1 for item in items if item.priority == "high")
        if critical_count:
            return f"{briefing_type.title()} briefing includes {critical_count} critical item(s)."
        if high_count:
            return f"{briefing_type.title()} briefing includes {high_count} high-priority item(s)."
        return f"{briefing_type.title()} briefing includes {len(items)} item(s)."
