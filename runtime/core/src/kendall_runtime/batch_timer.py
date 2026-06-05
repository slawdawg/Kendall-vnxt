from __future__ import annotations

import argparse
import json
import os
import time
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path


BATCH_TIMER_STATE_PATH_ENV_VAR = "KENDALL_BATCH_TIMER_STATE_PATH"


@dataclass(frozen=True)
class BatchTimerState:
    label: str
    target_minutes: int
    started_at_utc: str
    started_at_unix_ns: int
    started_at_monotonic_ns: int

    def __post_init__(self) -> None:
        if not isinstance(self.label, str) or not self.label.strip():
            raise ValueError("label must be a non-empty string")
        if not isinstance(self.target_minutes, int) or self.target_minutes <= 0:
            raise ValueError("target_minutes must be a positive integer")
        if not isinstance(self.started_at_utc, str) or not self.started_at_utc:
            raise ValueError("started_at_utc must be a non-empty string")
        for field_name in ("started_at_unix_ns", "started_at_monotonic_ns"):
            value = getattr(self, field_name)
            if not isinstance(value, int) or value < 0:
                raise ValueError(f"{field_name} must be a non-negative integer")

    @classmethod
    def start(cls, *, label: str, target_minutes: int) -> "BatchTimerState":
        return cls(
            label=label.strip(),
            target_minutes=target_minutes,
            started_at_utc=datetime.now(UTC).isoformat(),
            started_at_unix_ns=time.time_ns(),
            started_at_monotonic_ns=time.monotonic_ns(),
        )


@dataclass(frozen=True)
class BatchTimerStatus:
    label: str
    target_minutes: int
    started_at_utc: str
    elapsed_seconds: float
    remaining_seconds: float
    percent_of_target: float
    timing_source: str
    active: bool

    def __post_init__(self) -> None:
        if not isinstance(self.label, str) or not self.label.strip():
            raise ValueError("label must be a non-empty string")
        if not isinstance(self.target_minutes, int) or self.target_minutes <= 0:
            raise ValueError("target_minutes must be a positive integer")
        if not isinstance(self.started_at_utc, str) or not self.started_at_utc:
            raise ValueError("started_at_utc must be a non-empty string")
        for field_name in ("elapsed_seconds", "remaining_seconds", "percent_of_target"):
            value = getattr(self, field_name)
            if not isinstance(value, (int, float)) or value < 0:
                raise ValueError(f"{field_name} must be a non-negative number")
        if not isinstance(self.timing_source, str) or not self.timing_source:
            raise ValueError("timing_source must be a non-empty string")
        if not isinstance(self.active, bool):
            raise ValueError("active must be a boolean")


def runtime_root() -> Path:
    return Path(__file__).resolve().parents[3]


def default_state_path() -> Path:
    overridden_path = os.environ.get(BATCH_TIMER_STATE_PATH_ENV_VAR)
    if overridden_path:
        return Path(overridden_path).expanduser()
    return runtime_root() / ".batch_timer_state.json"


def _read_state(state_path: Path) -> BatchTimerState:
    payload = json.loads(state_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("timer state must be a JSON object")
    return BatchTimerState(**payload)


def _write_state(state: BatchTimerState, state_path: Path) -> None:
    state_path.write_text(json.dumps(asdict(state), indent=2), encoding="utf-8")


def _elapsed_seconds(state: BatchTimerState) -> tuple[float, str]:
    current_monotonic_ns = time.monotonic_ns()
    if current_monotonic_ns >= state.started_at_monotonic_ns:
        elapsed = (current_monotonic_ns - state.started_at_monotonic_ns) / 1_000_000_000
        return elapsed, "monotonic"

    current_unix_ns = time.time_ns()
    elapsed = max(0.0, (current_unix_ns - state.started_at_unix_ns) / 1_000_000_000)
    return elapsed, "wall-clock-fallback"


def start_batch(
    *,
    label: str = "default",
    target_minutes: int = 30,
    state_path: Path | None = None,
    overwrite: bool = False,
) -> BatchTimerStatus:
    if not isinstance(label, str) or not label.strip():
        raise ValueError("label must be a non-empty string")
    if not isinstance(target_minutes, int) or target_minutes <= 0:
        raise ValueError("target_minutes must be a positive integer")

    timer_path = state_path or default_state_path()
    if timer_path.exists() and not overwrite:
        raise RuntimeError(f"batch timer already active: {timer_path}")

    state = BatchTimerState.start(label=label.strip(), target_minutes=target_minutes)
    _write_state(state, timer_path)
    return status(state_path=timer_path)


def restart_batch(
    *,
    label: str = "default",
    target_minutes: int = 30,
    state_path: Path | None = None,
) -> BatchTimerStatus:
    return start_batch(
        label=label,
        target_minutes=target_minutes,
        state_path=state_path,
        overwrite=True,
    )


def status(*, state_path: Path | None = None) -> BatchTimerStatus:
    timer_path = state_path or default_state_path()
    if not timer_path.exists():
        raise RuntimeError(f"batch timer not active: {timer_path}")

    state = _read_state(timer_path)
    elapsed_seconds, timing_source = _elapsed_seconds(state)
    target_seconds = state.target_minutes * 60
    remaining_seconds = max(0.0, target_seconds - elapsed_seconds)
    percent_of_target = min(100.0, (elapsed_seconds / target_seconds) * 100.0)
    return BatchTimerStatus(
        label=state.label,
        target_minutes=state.target_minutes,
        started_at_utc=state.started_at_utc,
        elapsed_seconds=elapsed_seconds,
        remaining_seconds=remaining_seconds,
        percent_of_target=percent_of_target,
        timing_source=timing_source,
        active=True,
    )


def stop_batch(*, state_path: Path | None = None) -> BatchTimerStatus:
    timer_path = state_path or default_state_path()
    current = status(state_path=timer_path)
    timer_path.unlink()
    return current


def target_reached(*, state_path: Path | None = None) -> BatchTimerStatus:
    current = status(state_path=state_path)
    if current.remaining_seconds > 0:
        raise RuntimeError(
            f"batch target not yet reached: {round(current.remaining_seconds, 3)}s remaining"
        )
    return current


def wait_for_target(
    *,
    state_path: Path | None = None,
    poll_seconds: float = 15.0,
    max_wait_seconds: float | None = None,
) -> BatchTimerStatus:
    if not isinstance(poll_seconds, (int, float)) or poll_seconds <= 0:
        raise ValueError("poll_seconds must be a positive number")
    if max_wait_seconds is not None and (
        not isinstance(max_wait_seconds, (int, float)) or max_wait_seconds < 0
    ):
        raise ValueError("max_wait_seconds must be a non-negative number or None")

    waited_seconds = 0.0
    current = status(state_path=state_path)
    while current.remaining_seconds > 0:
        if max_wait_seconds is not None and waited_seconds >= max_wait_seconds:
            raise TimeoutError(
                f"batch target not reached within max_wait_seconds={max_wait_seconds}"
            )
        sleep_seconds = min(current.remaining_seconds, float(poll_seconds))
        if max_wait_seconds is not None:
            sleep_seconds = min(sleep_seconds, max(0.0, max_wait_seconds - waited_seconds))
        if sleep_seconds <= 0:
            raise TimeoutError(
                f"batch target not reached within max_wait_seconds={max_wait_seconds}"
            )
        time.sleep(sleep_seconds)
        waited_seconds += sleep_seconds
        current = status(state_path=state_path)
    return current


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Track runtime batch elapsed time locally.")
    parser.add_argument(
        "--state-path",
        type=Path,
        default=default_state_path(),
        help="Path to the persisted timer state file.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    start_parser = subparsers.add_parser("start", help="Start a new batch timer.")
    start_parser.add_argument("--label", default="default")
    start_parser.add_argument("--target-minutes", type=int, default=30)
    start_parser.add_argument("--overwrite", action="store_true")
    start_parser.add_argument(
        "--restart",
        action="store_true",
        help="Replace any existing timer state with a fresh batch start.",
    )

    subparsers.add_parser("status", help="Show the current batch timer status.")
    check_parser = subparsers.add_parser("check", help="Fail if the current batch has not reached its target.")
    check_parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress status output on success.",
    )
    wait_parser = subparsers.add_parser("wait", help="Block until the current batch reaches its target.")
    wait_parser.add_argument("--poll-seconds", type=float, default=15.0)
    wait_parser.add_argument("--max-wait-seconds", type=float)
    subparsers.add_parser("stop", help="Stop the current batch timer and show final status.")
    subparsers.add_parser("reset", help="Delete any existing timer state without reporting status.")
    return parser


def _status_payload(current: BatchTimerStatus) -> dict[str, object]:
    return {
        "active": current.active,
        "label": current.label,
        "target_minutes": current.target_minutes,
        "started_at_utc": current.started_at_utc,
        "elapsed_seconds": round(current.elapsed_seconds, 3),
        "remaining_seconds": round(current.remaining_seconds, 3),
        "percent_of_target": round(current.percent_of_target, 2),
        "timing_source": current.timing_source,
    }


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.command == "start":
        current = (
            restart_batch(
                label=args.label,
                target_minutes=args.target_minutes,
                state_path=args.state_path,
            )
            if args.restart
            else start_batch(
                label=args.label,
                target_minutes=args.target_minutes,
                state_path=args.state_path,
                overwrite=args.overwrite,
            )
        )
        print(json.dumps(_status_payload(current), indent=2))
        return 0

    if args.command == "status":
        current = status(state_path=args.state_path)
        print(json.dumps(_status_payload(current), indent=2))
        return 0

    if args.command == "check":
        current = target_reached(state_path=args.state_path)
        if not args.quiet:
            print(json.dumps(_status_payload(current), indent=2))
        return 0

    if args.command == "wait":
        current = wait_for_target(
            state_path=args.state_path,
            poll_seconds=args.poll_seconds,
            max_wait_seconds=args.max_wait_seconds,
        )
        print(json.dumps(_status_payload(current), indent=2))
        return 0

    if args.command == "stop":
        current = stop_batch(state_path=args.state_path)
        print(json.dumps(_status_payload(current), indent=2))
        return 0

    if args.command == "reset":
        if args.state_path.exists():
            args.state_path.unlink()
        print(json.dumps({"active": False, "state_path": str(args.state_path)}, indent=2))
        return 0

    parser.error(f"unknown command: {args.command}")
    return 2
