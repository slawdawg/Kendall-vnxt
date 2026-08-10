"""Fail-closed inspection gate; worker activation requires a scanner contract."""

from supervisor.config.settings import Settings


def require_inspection_activation(settings: Settings) -> None:
    if error := settings.memory_inbox_inspection_configuration_error():
        raise ValueError(error)
