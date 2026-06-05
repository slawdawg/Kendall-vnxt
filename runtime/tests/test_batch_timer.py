from __future__ import annotations

import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from kendall_runtime.batch_timer import (
    BATCH_TIMER_STATE_PATH_ENV_VAR,
    default_state_path,
    main,
    restart_batch,
    start_batch,
    status,
    stop_batch,
    target_reached,
    wait_for_target,
)


class BatchTimerTests(unittest.TestCase):
    def _run_main(self, argv: list[str]) -> tuple[int, str]:
        output = io.StringIO()
        with redirect_stdout(output):
            exit_code = main(argv)
        return exit_code, output.getvalue()

    def test_start_status_and_stop_use_monotonic_elapsed_time(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_path = Path(temp_dir) / "batch.json"
            with patch("kendall_runtime.batch_timer.time.time_ns", return_value=1_000_000_000):
                with patch("kendall_runtime.batch_timer.time.monotonic_ns", return_value=5_000_000_000):
                    started = start_batch(label="runtime-hardening", target_minutes=30, state_path=state_path)

            self.assertEqual(started.label, "runtime-hardening")
            self.assertEqual(started.target_minutes, 30)
            self.assertEqual(started.timing_source, "monotonic")
            self.assertTrue(state_path.exists())

            with patch("kendall_runtime.batch_timer.time.monotonic_ns", return_value=35_000_000_000):
                current = status(state_path=state_path)

            self.assertAlmostEqual(current.elapsed_seconds, 30.0)
            self.assertAlmostEqual(current.remaining_seconds, 1_770.0)
            self.assertAlmostEqual(current.percent_of_target, 1.6666666666666667)
            self.assertEqual(current.timing_source, "monotonic")

            with patch("kendall_runtime.batch_timer.time.monotonic_ns", return_value=65_000_000_000):
                finished = stop_batch(state_path=state_path)

            self.assertAlmostEqual(finished.elapsed_seconds, 60.0)
            self.assertFalse(state_path.exists())

    def test_status_falls_back_to_wall_clock_after_monotonic_regression(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_path = Path(temp_dir) / "batch.json"
            state_path.write_text(
                json.dumps(
                    {
                        "label": "runtime-hardening",
                        "target_minutes": 30,
                        "started_at_utc": "2026-06-03T12:00:00+00:00",
                        "started_at_unix_ns": 10_000_000_000,
                        "started_at_monotonic_ns": 20_000_000_000,
                    }
                ),
                encoding="utf-8",
            )

            with patch("kendall_runtime.batch_timer.time.monotonic_ns", return_value=15_000_000_000):
                with patch("kendall_runtime.batch_timer.time.time_ns", return_value=25_000_000_000):
                    current = status(state_path=state_path)

            self.assertAlmostEqual(current.elapsed_seconds, 15.0)
            self.assertEqual(current.timing_source, "wall-clock-fallback")

    def test_cli_reset_and_duplicate_start_behavior(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_path = Path(temp_dir) / "batch.json"

            exit_code, _ = self._run_main(
                [
                    "--state-path",
                    str(state_path),
                    "start",
                    "--label",
                    "batch-1",
                    "--target-minutes",
                    "15",
                ]
            )
            self.assertEqual(exit_code, 0)
            self.assertTrue(state_path.exists())

            with self.assertRaises(RuntimeError):
                start_batch(label="batch-2", target_minutes=30, state_path=state_path)

            exit_code, _ = self._run_main(["--state-path", str(state_path), "reset"])
            self.assertEqual(exit_code, 0)
            self.assertFalse(state_path.exists())

    def test_restart_batch_replaces_existing_state(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_path = Path(temp_dir) / "batch.json"

            with patch("kendall_runtime.batch_timer.time.time_ns", return_value=1_000_000_000):
                with patch("kendall_runtime.batch_timer.time.monotonic_ns", return_value=5_000_000_000):
                    start_batch(label="batch-1", target_minutes=15, state_path=state_path)

            with patch("kendall_runtime.batch_timer.time.time_ns", return_value=2_000_000_000):
                with patch("kendall_runtime.batch_timer.time.monotonic_ns", return_value=10_000_000_000):
                    restarted = restart_batch(label="batch-2", target_minutes=30, state_path=state_path)

            self.assertEqual(restarted.label, "batch-2")
            self.assertEqual(restarted.target_minutes, 30)
            with patch("kendall_runtime.batch_timer.time.monotonic_ns", return_value=40_000_000_000):
                current = status(state_path=state_path)
            self.assertAlmostEqual(current.elapsed_seconds, 30.0)

    def test_cli_start_restart_replaces_existing_state(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_path = Path(temp_dir) / "batch.json"

            exit_code, _ = self._run_main(
                [
                    "--state-path",
                    str(state_path),
                    "start",
                    "--label",
                    "batch-1",
                    "--target-minutes",
                    "15",
                ]
            )
            self.assertEqual(exit_code, 0)

            exit_code, _ = self._run_main(
                [
                    "--state-path",
                    str(state_path),
                    "start",
                    "--label",
                    "runtime-hardening",
                    "--target-minutes",
                    "30",
                    "--restart",
                ]
            )
            self.assertEqual(exit_code, 0)

            current = status(state_path=state_path)
            self.assertEqual(current.label, "runtime-hardening")
            self.assertEqual(current.target_minutes, 30)

    def test_default_state_path_honors_environment_override(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_path = Path(temp_dir) / "batch.json"
            with patch.dict(os.environ, {BATCH_TIMER_STATE_PATH_ENV_VAR: str(state_path)}, clear=False):
                self.assertEqual(default_state_path(), state_path)
                exit_code, _ = self._run_main(["start", "--label", "runtime-hardening", "--target-minutes", "30"])
                self.assertEqual(exit_code, 0)
                self.assertTrue(state_path.exists())

    def test_batch_timer_types_reject_malformed_state(self) -> None:
        with self.assertRaises(ValueError):
            start_batch(label="", target_minutes=30, state_path=Path("unused"))
        with self.assertRaises(ValueError):
            start_batch(label="runtime", target_minutes=0, state_path=Path("unused"))
        with self.assertRaises(ValueError):
            wait_for_target(state_path=Path("unused"), poll_seconds=0)
        with self.assertRaises(ValueError):
            wait_for_target(state_path=Path("unused"), max_wait_seconds=-1)

        with self.assertRaises(ValueError):
            main  # keep linter calm
            from kendall_runtime.batch_timer import BatchTimerState, BatchTimerStatus
            BatchTimerState(
                label="",
                target_minutes=30,
                started_at_utc="2026-06-03T12:00:00+00:00",
                started_at_unix_ns=1,
                started_at_monotonic_ns=1,
            )
        with self.assertRaises(ValueError):
            from kendall_runtime.batch_timer import BatchTimerState
            BatchTimerState(
                label="runtime",
                target_minutes=-1,
                started_at_utc="2026-06-03T12:00:00+00:00",
                started_at_unix_ns=1,
                started_at_monotonic_ns=1,
            )
        with self.assertRaises(ValueError):
            from kendall_runtime.batch_timer import BatchTimerStatus
            BatchTimerStatus(
                label="runtime",
                target_minutes=30,
                started_at_utc="2026-06-03T12:00:00+00:00",
                elapsed_seconds=-1.0,
                remaining_seconds=0.0,
                percent_of_target=0.0,
                timing_source="monotonic",
                active=True,
            )

    def test_status_rejects_malformed_persisted_state(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_path = Path(temp_dir) / "batch.json"
            state_path.write_text(json.dumps(["bad"]), encoding="utf-8")
            with self.assertRaises(ValueError):
                status(state_path=state_path)

            state_path.write_text(
                json.dumps(
                    {
                        "label": "runtime-hardening",
                        "target_minutes": 0,
                        "started_at_utc": "2026-06-03T12:00:00+00:00",
                        "started_at_unix_ns": 1,
                        "started_at_monotonic_ns": 1,
                    }
                ),
                encoding="utf-8",
            )
            with self.assertRaises(ValueError):
                status(state_path=state_path)

    def test_target_reached_fails_before_target_and_succeeds_after_target(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_path = Path(temp_dir) / "batch.json"
            with patch("kendall_runtime.batch_timer.time.time_ns", return_value=1_000_000_000):
                with patch("kendall_runtime.batch_timer.time.monotonic_ns", return_value=5_000_000_000):
                    start_batch(label="runtime-hardening", target_minutes=1, state_path=state_path)

            with patch("kendall_runtime.batch_timer.time.monotonic_ns", return_value=34_000_000_000):
                with self.assertRaises(RuntimeError):
                    target_reached(state_path=state_path)

            with patch("kendall_runtime.batch_timer.time.monotonic_ns", return_value=65_000_000_000):
                reached = target_reached(state_path=state_path)
            self.assertEqual(reached.percent_of_target, 100.0)

    def test_wait_for_target_returns_immediately_when_target_already_reached(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_path = Path(temp_dir) / "batch.json"
            with patch("kendall_runtime.batch_timer.time.time_ns", return_value=1_000_000_000):
                with patch("kendall_runtime.batch_timer.time.monotonic_ns", return_value=5_000_000_000):
                    start_batch(label="runtime-hardening", target_minutes=1, state_path=state_path)

            with patch("kendall_runtime.batch_timer.time.monotonic_ns", return_value=65_000_000_000):
                with patch("kendall_runtime.batch_timer.time.sleep") as sleep_mock:
                    reached = wait_for_target(state_path=state_path, poll_seconds=5)

            self.assertEqual(reached.percent_of_target, 100.0)
            sleep_mock.assert_not_called()

    def test_wait_for_target_sleeps_until_target_is_reached(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_path = Path(temp_dir) / "batch.json"
            monotonic_values = iter(
                [
                    5_000_000_000,
                    5_000_000_000,
                    35_000_000_000,
                    65_000_000_000,
                ]
            )
            with patch("kendall_runtime.batch_timer.time.time_ns", return_value=1_000_000_000):
                with patch("kendall_runtime.batch_timer.time.monotonic_ns", side_effect=lambda: next(monotonic_values)):
                    start_batch(label="runtime-hardening", target_minutes=1, state_path=state_path)
                    slept: list[float] = []

                    def _sleep(seconds: float) -> None:
                        slept.append(seconds)

                    with patch("kendall_runtime.batch_timer.time.sleep", side_effect=_sleep):
                        reached = wait_for_target(state_path=state_path, poll_seconds=30)

            self.assertEqual(reached.percent_of_target, 100.0)
            self.assertEqual(slept, [30.0])

    def test_wait_for_target_times_out_when_max_wait_is_exhausted(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_path = Path(temp_dir) / "batch.json"
            monotonic_values = iter(
                [
                    5_000_000_000,
                    5_000_000_000,
                    10_000_000_000,
                    15_000_000_000,
                    20_000_000_000,
                ]
            )
            with patch("kendall_runtime.batch_timer.time.time_ns", return_value=1_000_000_000):
                with patch("kendall_runtime.batch_timer.time.monotonic_ns", side_effect=lambda: next(monotonic_values)):
                    start_batch(label="runtime-hardening", target_minutes=1, state_path=state_path)
                    with patch("kendall_runtime.batch_timer.time.sleep"):
                        with self.assertRaises(TimeoutError):
                            wait_for_target(
                                state_path=state_path,
                                poll_seconds=5,
                                max_wait_seconds=10,
                            )

    def test_cli_check_and_wait_enforce_target(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            state_path = Path(temp_dir) / "batch.json"
            with patch("kendall_runtime.batch_timer.time.time_ns", return_value=1_000_000_000):
                with patch("kendall_runtime.batch_timer.time.monotonic_ns", return_value=5_000_000_000):
                    start_batch(label="runtime-hardening", target_minutes=1, state_path=state_path)

            with patch("kendall_runtime.batch_timer.time.monotonic_ns", return_value=34_000_000_000):
                with self.assertRaises(RuntimeError):
                    self._run_main(["--state-path", str(state_path), "check"])

            monotonic_values = iter([35_000_000_000, 65_000_000_000])
            with patch("kendall_runtime.batch_timer.time.monotonic_ns", side_effect=lambda: next(monotonic_values)):
                with patch("kendall_runtime.batch_timer.time.sleep"):
                    exit_code, _ = self._run_main(
                        [
                            "--state-path",
                            str(state_path),
                            "wait",
                            "--poll-seconds",
                            "30",
                            "--max-wait-seconds",
                            "30",
                        ]
                    )
            self.assertEqual(exit_code, 0)
