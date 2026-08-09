"""Fail-closed adapter for an explicitly configured private quarantine scanner."""

import asyncio
from dataclasses import dataclass
from enum import StrEnum
import os
from pathlib import Path
import signal


class ScannerOutcome(StrEnum):
    SAFE = "safe"
    UNSAFE = "unsafe"
    UNAVAILABLE = "unavailable"


@dataclass(frozen=True)
class ScannerResult:
    outcome: ScannerOutcome
    reason_code: str


def interpret_scanner_exit(*, return_code: int | None, timed_out: bool = False) -> ScannerResult:
    """Interpret the narrow scanner contract without exposing process output.

    The configured executable receives one validated quarantine path as its sole
    argument and must return 0 for safe, 1 for unsafe, and any other result for
    an unavailable/failed scan.  Its stdout and stderr are intentionally never
    persisted or returned because they can contain protected content.
    """

    if timed_out:
        return ScannerResult(ScannerOutcome.UNAVAILABLE, "scanner_timeout")
    if return_code == 0:
        return ScannerResult(ScannerOutcome.SAFE, "scanner_clean")
    if return_code == 1:
        return ScannerResult(ScannerOutcome.UNSAFE, "scanner_detected_unsafe")
    return ScannerResult(ScannerOutcome.UNAVAILABLE, "scanner_failed")


async def scan_private_quarantine(*, scanner_path: str, object_path: Path, timeout_seconds: int) -> ScannerResult:
    """Run the configured scanner with no shell, stdin, output retention, or fallback."""

    process = await asyncio.create_subprocess_exec(
        scanner_path,
        str(object_path),
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
        start_new_session=True,
    )
    try:
        return_code = await asyncio.wait_for(process.wait(), timeout=timeout_seconds)
    except TimeoutError:
        # The scanner owns a new session.  Kill its entire process group rather
        # than only the launcher: a forked child must never keep reading private
        # quarantine bytes after the bounded lease has timed out.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        await process.wait()
        return interpret_scanner_exit(return_code=None, timed_out=True)
    return interpret_scanner_exit(return_code=return_code)
