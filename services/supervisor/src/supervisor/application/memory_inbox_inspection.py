"""Fail-closed inspection gate; no reader, extractor, worker, or retry exists here."""

from supervisor.config.settings import Settings


def require_inspection_activation(settings: Settings) -> None:
    if not settings.memory_inbox_inspection_enabled:
        raise ValueError("inspection_unavailable")
    # Story 1.9 owns the leased inspection implementation. This guard avoids
    # treating an activation flag as permission to read quarantine bytes.
    raise ValueError("inspection_worker_unavailable")
