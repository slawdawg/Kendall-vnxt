"""Timezone-safe comparisons for persisted Memory Inbox retention deadlines."""

from datetime import datetime, timezone


def as_utc(value: datetime) -> datetime:
    """Treat naive database values as UTC; every Inbox deadline is persisted in UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def retention_expired(deadline: datetime, *, now: datetime | None = None) -> bool:
    return as_utc(deadline) <= (now or datetime.now(timezone.utc))
