import asyncio
import os

from supervisor.application.memory_inbox_scanner import ScannerOutcome, scan_private_quarantine, interpret_scanner_exit
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
    extractor = tmp_path / "extractor"
    extractor.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    os.chmod(extractor, 0o700)
    settings = Settings(
        SUPERVISOR_MEMORY_INBOX_CONTENT_STORE_ROOT=str(private_store),
        SUPERVISOR_MEMORY_INBOX_RETENTION_HOURS=24,
        SUPERVISOR_MEMORY_INBOX_INSPECTION_ENABLED=True,
        SUPERVISOR_MEMORY_INBOX_SCANNER_PATH=str(scanner),
        SUPERVISOR_MEMORY_INBOX_EXTRACTOR_PATH=str(extractor),
    )

    assert settings.memory_inbox_inspection_configuration_error() is None
    os.chmod(scanner, 0o722)
    assert settings.memory_inbox_inspection_configuration_error() == "inspection_scanner_not_owner_controlled"


def test_timeout_terminates_the_scanner_process_group(tmp_path) -> None:
    scanner = tmp_path / "scanner"
    scanner.write_text("#!/bin/sh\nsleep 10\n", encoding="utf-8")
    os.chmod(scanner, 0o700)
    object_path = tmp_path / "object"
    object_path.write_bytes(b"%PDF-1.7")

    result = asyncio.run(scan_private_quarantine(
        scanner_path=str(scanner), object_path=object_path, timeout_seconds=1,
    ))

    assert result.reason_code == "scanner_timeout"
