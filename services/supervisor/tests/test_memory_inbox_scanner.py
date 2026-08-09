import os
import signal

import pytest

from supervisor.application import memory_inbox_scanner
from supervisor.application.memory_inbox_scanner import ScannerOutcome, interpret_scanner_exit, scan_private_quarantine
from supervisor.config.settings import Settings


def test_scanner_exit_contract_is_fail_closed_for_timeouts_and_unknown_results() -> None:
    assert interpret_scanner_exit(return_code=0).outcome is ScannerOutcome.SAFE
    assert interpret_scanner_exit(return_code=1).outcome is ScannerOutcome.UNSAFE
    assert interpret_scanner_exit(return_code=2).outcome is ScannerOutcome.UNAVAILABLE
    assert interpret_scanner_exit(return_code=None, timed_out=True).reason_code == "scanner_timeout"


def test_inspection_activation_requires_an_owner_controlled_scanner(tmp_path) -> None:
    private_store = tmp_path / "private-store"
    private_store.mkdir(mode=0o700)
    scanner = tmp_path / "scanner"
    scanner.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    os.chmod(scanner, 0o700)
    settings = Settings(
        SUPERVISOR_MEMORY_INBOX_CONTENT_STORE_ROOT=str(private_store),
        SUPERVISOR_MEMORY_INBOX_RETENTION_HOURS=24,
        SUPERVISOR_MEMORY_INBOX_INSPECTION_ENABLED=True,
        SUPERVISOR_MEMORY_INBOX_SCANNER_PATH=str(scanner),
    )

    assert settings.memory_inbox_inspection_configuration_error() is None
    os.chmod(scanner, 0o722)
    assert settings.memory_inbox_inspection_configuration_error() == "inspection_scanner_not_owner_controlled"


@pytest.mark.asyncio
async def test_scanner_timeout_kills_the_whole_new_process_group(monkeypatch, tmp_path) -> None:
    class TimedOutProcess:
        pid = 941

        def __init__(self) -> None:
            self.wait_count = 0

        async def wait(self) -> int:
            self.wait_count += 1
            if self.wait_count == 1:
                raise TimeoutError
            return -signal.SIGKILL

    process = TimedOutProcess()
    launch_options: dict[str, object] = {}
    killed: list[tuple[int, signal.Signals]] = []

    async def fake_launch(*args, **kwargs):
        launch_options.update(kwargs)
        return process

    monkeypatch.setattr(memory_inbox_scanner.asyncio, "create_subprocess_exec", fake_launch)
    monkeypatch.setattr(memory_inbox_scanner.os, "killpg", lambda pid, sig: killed.append((pid, sig)))

    result = await scan_private_quarantine(scanner_path="/owner/scanner", object_path=tmp_path / "private", timeout_seconds=1)

    assert result.outcome is ScannerOutcome.UNAVAILABLE
    assert killed == [(941, signal.SIGKILL)]
    assert launch_options["start_new_session"] is True
