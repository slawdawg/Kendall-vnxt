import pytest

from supervisor.application.memory_inbox_inspection import require_inspection_activation
from supervisor.config.settings import Settings


def test_unapproved_inspection_gate_is_content_free_and_fail_closed() -> None:
    with pytest.raises(ValueError, match="inspection_unconfigured"):
        require_inspection_activation(Settings(SUPERVISOR_MEMORY_INBOX_INSPECTION_ENABLED=False))


def test_enabled_flag_does_not_create_an_unleased_reader_or_worker() -> None:
    with pytest.raises(ValueError, match="private_store_or_retention_unconfigured"):
        require_inspection_activation(Settings(SUPERVISOR_MEMORY_INBOX_INSPECTION_ENABLED=True))
