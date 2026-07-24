"""Task-specific, metadata-safe delegated review adapter port.

The coordinator only accepts immutable review metadata plus a separately
materialized, path-scoped transient diff.  It has no generic prompt, command,
endpoint, browser, credential, or source-mutation interface.
"""

from __future__ import annotations

import hashlib
import asyncio
import json
import os
import shutil
import tempfile
import re
from pathlib import PurePosixPath
from dataclasses import dataclass, field
from pathlib import Path
from threading import Event
from typing import Any, Awaitable, Callable, Protocol, runtime_checkable

from supervisor.domain.bounded_provider_transport import BoundedProviderTransport
from supervisor.domain.review_route import validate_normalized_finding


APPROVED_OLLAMA_ENDPOINT_REF = "ollama-endpoint:192.168.1.128:11434/v1/chat/completions"
APPROVED_OLLAMA_MODEL_REF = "ollama-model:qwen3-14b"
_FALLBACK_ELIGIBLE = frozenset({"unavailable", "vetoed", "scope_rejected", "empty", "timed_out", "cancelled", "failed", "rate_limited"})
_FORBIDDEN_PATH_SEGMENT = frozenset({".git"})
_FORBIDDEN_PATH_WORD = ("secret", "credential", "token", "password", "key")
MAX_MATERIALIZED_FILE_BYTES = 256 * 1024
MAX_MATERIALIZED_TOTAL_BYTES = 1024 * 1024
_RECEIPT_FIELDS = frozenset({
    "status", "code", "modelId", "endpointFamily", "finishReason",
    "responseCharacterCount", "reasoningCharacterCount", "completionTokens",
    "promptTokens", "totalTokens", "redactionApplied", "rawPayloadRetained",
    "timeoutState", "cancellationState",
})
BMAD_GOVERNED_RUNNER_ADAPTER_ID = "bmad-governed-runner/v1"
_SAFE_RUNNER_ID = re.compile(r"^[A-Za-z][A-Za-z0-9._:-]{1,180}$")
_SAFE_OUTCOME_CODE = re.compile(r"^[a-z][a-z0-9_]{0,80}$")
_RECEIPT_MODEL_IDS = frozenset({"qwen3:14b", BMAD_GOVERNED_RUNNER_ADAPTER_ID})
_RECEIPT_ENDPOINT_FAMILIES = frozenset({"approved_vm_to_host_ollama_openai_compatible", "governed_bmad_local"})
_RECEIPT_FINISH_REASONS = frozenset({"stop", "length", "content_filter"})
_RECEIPT_TIMEOUT_STATES = frozenset({"not_timed_out", "completed_before_total_timeout", "total_timeout_elapsed"})
_RECEIPT_CANCELLATION_STATES = frozenset({"not_cancelled", "cancel_requested_before_send", "cancel_requested_request_abort_recorded"})


@dataclass(frozen=True)
class TransientReviewScopeValidation:
    ok: bool
    code: str
    files: tuple[dict[str, str], ...] = ()


@dataclass(frozen=True)
class ReviewAdapterOutcome:
    status: str
    code: str
    findings: tuple[dict[str, str], ...] = ()
    receipt: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class ReviewFallbackOutcome:
    state: str
    code: str
    route_id: str | None
    findings: tuple[dict[str, str], ...]
    receipts: tuple[dict[str, object], ...]
    next_safe_action: str
    raw_payload_retained: bool = False


class DelegatedReviewAdapterPort(Protocol):
    async def execute(
        self,
        *,
        immutable_review: dict[str, str],
        materialized: tuple[dict[str, str], ...],
        route_id: str,
        ollama_exact_gate: dict[str, object] | None,
        bmad_local_gate: dict[str, object] | None = None,
        cancellation_event: Event | None = None,
    ) -> ReviewAdapterOutcome: ...


ReviewBeforeRoute = Callable[[str], Awaitable[ReviewAdapterOutcome | None]]
ReviewAfterRoute = Callable[[str, ReviewAdapterOutcome], Awaitable[ReviewAdapterOutcome]]
TransientReviewMaterializer = Callable[[], Awaitable[list[dict[str, str]]]]


class DurableReviewLifecyclePort(Protocol):
    """Supervisor-owned durable attempt lifecycle around each provider route."""

    async def reserve_and_claim(self, route_id: str) -> None: ...

    async def revalidate(self, route_id: str, phase: str) -> str | None: ...

    async def finalize(self, route_id: str, outcome: ReviewAdapterOutcome) -> None: ...


ClaudeProcessRunner = Callable[[tuple[str, ...], str], Awaitable[tuple[str, str]]]


@runtime_checkable
class BmadBoundedExecutionHandle(Protocol):
    """Supervisor-owned control surface for one registered BMAD review run.

    A governed runner must return this handle before the adapter starts waiting
    for its outcome.  That gives the adapter a concrete, bounded way to stop
    and reap a local child when durable cancellation or the adapter timeout
    wins the race.  Returning only an awaitable outcome is unsafe: cancelling
    the awaiting task does not prove that the underlying child exited.
    """

    async def wait(self) -> ReviewAdapterOutcome: ...

    async def cancel(self) -> None: ...

    async def terminate(self) -> None: ...

    async def kill_and_wait(self) -> None: ...


BmadBoundedReviewRunner = Callable[[dict[str, str], tuple[dict[str, str], ...]], BmadBoundedExecutionHandle]


class ClaudeReadonlyReviewAdapter:
    """Concrete fixed-shape Claude CLI adapter for an isolated transient scope."""

    _ARGV_PREFIX = ("claude", "-p")
    _ALLOWED_TOOLS = "Read,Grep"
    _TIMEOUT_SECONDS = 120

    def __init__(self, *, process_runner: ClaudeProcessRunner | None = None) -> None:
        self._process_runner = process_runner or self._run_process

    async def execute(
        self,
        *,
        immutable_review: dict[str, str],
        materialized: tuple[dict[str, str], ...],
        route_id: str,
        ollama_exact_gate: dict[str, object] | None,
        cancellation_event: Event | None = None,
    ) -> ReviewAdapterOutcome:
        if route_id != "claude_readonly":
            return ReviewAdapterOutcome("vetoed", "claude_route_invalid")
        if cancellation_event is not None and cancellation_event.is_set():
            return ReviewAdapterOutcome("cancelled", "claude_cancelled")
        direct_scope: list[dict[str, str]] = []
        for item in materialized:
            if type(item) is not dict or not isinstance(item.get("path"), str) or not isinstance(item.get("body"), str):
                return ReviewAdapterOutcome("scope_rejected", "transient_scope_invalid")
            direct_scope.append({
                "path": item["path"],
                "diffDigest": "sha256:" + hashlib.sha256(item["body"].encode("utf-8")).hexdigest(),
            })
        validation = validate_transient_review_scope(list(materialized), direct_scope)
        if not validation.ok:
            return ReviewAdapterOutcome("scope_rejected", validation.code)
        with tempfile.TemporaryDirectory(prefix="kendall-review-") as temporary_root:
            root = Path(temporary_root)
            for item in validation.files:
                # Do not rely on cwd for containment: reject an escape before
                # a directory is created or a byte is written.
                path = PurePosixPath(item["path"])
                if path.is_absolute() or ".." in path.parts:
                    return ReviewAdapterOutcome("scope_rejected", "transient_path_forbidden")
                target = root.joinpath(*path.parts)
                if not target.resolve().is_relative_to(root.resolve()):
                    return ReviewAdapterOutcome("scope_rejected", "transient_path_forbidden")
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(item["body"], encoding="utf-8")
            prompt = (
                "Review only the files in the current isolated transient directory. "
                "Use Read and Grep only. Return one JSON array of normalized-finding/v1 objects; "
                "return [] when no finding is justified. Do not request commands, credentials, or files outside this directory."
            )
            argv = (*self._ARGV_PREFIX, prompt, "--allowedTools", self._ALLOWED_TOOLS)
            try:
                state, output = await self._await_runner_with_cancellation(
                    self._process_runner(argv, temporary_root), cancellation_event
                )
            except asyncio.TimeoutError:
                return ReviewAdapterOutcome("timed_out", "claude_timeout")
            except asyncio.CancelledError:
                return ReviewAdapterOutcome("cancelled", "claude_cancelled")
            except FileNotFoundError:
                return ReviewAdapterOutcome("unavailable", "claude_unavailable")
            except OSError as exc:
                return ReviewAdapterOutcome("failed", f"claude_{type(exc).__name__.lower()}")
        if state != "completed":
            return ReviewAdapterOutcome("failed", "claude_nonzero_exit")
        return _outcome_from_transient_text(output, route_id="claude_readonly")

    async def _await_runner_with_cancellation(
        self,
        operation: Awaitable[tuple[str, str]],
        cancellation_event: Event | None,
    ) -> tuple[str, str]:
        """Cancel and reap the CLI task when durable state revokes its route."""
        runner = asyncio.create_task(operation)
        cancellation_waiter: asyncio.Task[bool] | None = None
        if cancellation_event is not None:
            cancellation_waiter = asyncio.create_task(asyncio.to_thread(cancellation_event.wait))
        try:
            waiters = {runner} if cancellation_waiter is None else {runner, cancellation_waiter}
            done, _ = await asyncio.wait(waiters, timeout=self._TIMEOUT_SECONDS, return_when=asyncio.FIRST_COMPLETED)
            if cancellation_waiter in done and cancellation_event is not None and cancellation_event.is_set():
                runner.cancel()
                await _reap_cancelled_task(runner)
                raise asyncio.CancelledError
            if runner in done:
                return runner.result()
            runner.cancel()
            await _reap_cancelled_task(runner)
            raise asyncio.TimeoutError
        except asyncio.CancelledError:
            if not runner.done():
                runner.cancel()
            await _reap_cancelled_task(runner)
            raise
        finally:
            if cancellation_waiter is not None:
                cancellation_waiter.cancel()
                await _reap_cancelled_task(cancellation_waiter)

    async def _run_process(self, argv: tuple[str, ...], cwd: str) -> tuple[str, str]:
        # A temporary cwd is not a read boundary. Bubblewrap starts Claude in
        # an empty mount namespace with only its runtime libraries and the
        # transient review tree mounted; host home, checkout, credentials, and
        # network are absent. A missing/blocked sandbox is a safe failure.
        claude_binary = os.path.realpath(argv[0]) if os.path.isabs(argv[0]) else shutil.which(argv[0])
        if not claude_binary:
            raise FileNotFoundError("claude executable unavailable")
        # Explicit operator approval permits only the existing Claude session
        # metadata/config paths to be mounted read-only into this child.  The
        # supervisor never opens, copies, logs, or retains their contents.
        # `claude -p` needs both that session state and network access to be a
        # usable primary route; the review tree remains the only writable/read
        # source scope exposed to Claude's Read/Grep tools.
        session_home = "/home/kendall"
        session_mounts: list[str] = ["--dir", "/home", "--dir", session_home, "--dir", f"{session_home}/.config"]
        for source, destination in (
            (Path.home() / ".claude", f"{session_home}/.claude"),
            (Path.home() / ".claude.json", f"{session_home}/.claude.json"),
            (Path.home() / ".config" / "claude", f"{session_home}/.config/claude"),
        ):
            if source.exists():
                session_mounts.extend(("--ro-bind", str(source), destination))
        sandbox_argv = (
            "bwrap", "--die-with-parent", "--new-session", "--unshare-all", "--share-net",
            "--tmpfs", "/", "--proc", "/proc", "--dev", "/dev", "--dir", "/tmp",
            "--ro-bind", "/usr", "/usr", "--ro-bind", "/bin", "/bin",
            "--ro-bind", "/lib", "/lib", "--ro-bind", "/lib64", "/lib64",
            "--ro-bind", claude_binary, "/usr/local/bin/claude",
            "--ro-bind", cwd, "/review", "--chdir", "/review", *session_mounts,
            "--setenv", "HOME", session_home, "--setenv", "PATH", "/usr/local/bin:/usr/bin:/bin",
            "/usr/local/bin/claude", *argv[1:],
        )
        process = await asyncio.create_subprocess_exec(
            *sandbox_argv,
            cwd=None,
            env={"PATH": "/usr/bin:/bin"},
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        try:
            stdout, _ = await asyncio.wait_for(process.communicate(), timeout=self._TIMEOUT_SECONDS)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            if process.returncode is None:
                process.terminate()
                try:
                    await asyncio.wait_for(process.wait(), timeout=5)
                except asyncio.TimeoutError:
                    process.kill()
                    await process.wait()
            raise
        output = stdout.decode("utf-8", errors="replace")
        return ("completed" if process.returncode == 0 else "failed", output)


class OllamaExactReviewAdapter:
    """Concrete exact-gated review adapter over the shared bounded transport."""

    def __init__(self, *, transport: BoundedProviderTransport) -> None:
        self._transport = transport

    async def execute(
        self,
        *,
        immutable_review: dict[str, str],
        materialized: tuple[dict[str, str], ...],
        route_id: str,
        ollama_exact_gate: dict[str, object] | None,
        cancellation_event: Event | None = None,
    ) -> ReviewAdapterOutcome:
        if route_id != "ollama_exact" or not validate_exact_ollama_review_gate(ollama_exact_gate):
            return ReviewAdapterOutcome("vetoed", "ollama_exact_gate_invalid")
        request_text = _review_prompt_from_scope(materialized)
        result = await self._transport.execute_review(
            messages=(
                {"role": "system", "content": "Review only this sanitized transient scope. Return one JSON array of normalized-finding/v1 objects, or []. Do not request secrets, commands, credentials, or additional files."},
                {"role": "user", "content": request_text},
            ),
            cancellation_event=cancellation_event,
        )
        if result.status != "completed":
            return ReviewAdapterOutcome(result.status, f"ollama_{result.code}", receipt=result.to_metadata())
        outcome = _outcome_from_transient_text(result.content, route_id="ollama_exact")
        return ReviewAdapterOutcome(outcome.status, outcome.code, outcome.findings, result.to_metadata())


class BoundedBmadReviewAdapter:
    """Named port for the existing governed local BMAD review boundary.

    The runner is registered by supervisor composition; this adapter never
    accepts a shell command, endpoint, model, or arbitrary prompt from callers.
    """

    _TIMEOUT_SECONDS = 120

    def __init__(self, *, runner: BmadBoundedReviewRunner | None = None, runner_id: str | None = None) -> None:
        self._runner = runner
        self._runner_id = runner_id

    async def execute(
        self,
        *,
        immutable_review: dict[str, str],
        materialized: tuple[dict[str, str], ...],
        route_id: str,
        ollama_exact_gate: dict[str, object] | None,
        bmad_local_gate: dict[str, object] | None = None,
        cancellation_event: Event | None = None,
    ) -> ReviewAdapterOutcome:
        if route_id != "bmad_local":
            return ReviewAdapterOutcome("inconclusive", "bmad_route_invalid")
        if self._runner is None or not isinstance(self._runner_id, str):
            return ReviewAdapterOutcome("inconclusive", "bmad_boundary_unavailable")
        if not validate_bmad_local_review_gate(bmad_local_gate, self._runner_id):
            return ReviewAdapterOutcome("vetoed", "bmad_local_gate_invalid")
        if cancellation_event is not None and cancellation_event.is_set():
            return ReviewAdapterOutcome("cancelled", "bmad_cancelled")
        try:
            handle = self._runner(dict(immutable_review), materialized)
        except Exception:
            return ReviewAdapterOutcome("inconclusive", "bmad_runner_failed")
        # Runtime Protocol checks only establish that attributes exist.  They
        # do not prove the four child-control members are callable, so validate
        # the whole stop/reap surface before creating ``handle.wait()`` or an
        # asyncio task.  A malformed runner must not be able to leave a child
        # started with no durable cancellation path.
        if not _valid_bmad_execution_handle(handle):
            return ReviewAdapterOutcome("inconclusive", "bmad_execution_handle_invalid")
        runner = asyncio.create_task(handle.wait())
        cancellation_waiter: asyncio.Task[bool] | None = None
        if cancellation_event is not None:
            cancellation_waiter = asyncio.create_task(asyncio.to_thread(cancellation_event.wait))
        try:
            waiters = {runner} if cancellation_waiter is None else {runner, cancellation_waiter}
            done, _ = await asyncio.wait(
                waiters, timeout=self._TIMEOUT_SECONDS, return_when=asyncio.FIRST_COMPLETED
            )
            if cancellation_waiter in done and cancellation_event is not None and cancellation_event.is_set():
                stopped = await self._stop_and_reap(handle, runner)
                return ReviewAdapterOutcome("cancelled", "bmad_cancelled" if stopped else "bmad_stop_failed")
            if runner in done:
                return _validated_bmad_outcome(runner.result())
            stopped = await self._stop_and_reap(handle, runner)
            return ReviewAdapterOutcome("timed_out", "bmad_timeout" if stopped else "bmad_stop_failed")
        except asyncio.CancelledError:
            stopped = await self._stop_and_reap(handle, runner)
            return ReviewAdapterOutcome("cancelled", "bmad_cancelled" if stopped else "bmad_stop_failed")
        except Exception:
            return ReviewAdapterOutcome("inconclusive", "bmad_runner_failed")
        finally:
            if cancellation_waiter is not None:
                cancellation_waiter.cancel()
                await _reap_cancelled_task(cancellation_waiter)

    @staticmethod
    async def _stop_and_reap(
        handle: BmadBoundedExecutionHandle,
        runner: asyncio.Task[ReviewAdapterOutcome],
    ) -> bool:
        """Drive the registered child through cancel, terminate, and reap.

        The ordered escalation is deliberately unconditional once cancellation
        or timeout wins.  A terminal review receipt is not emitted until the
        runner's explicit kill-and-wait acknowledgement has returned and the
        local wait task is reaped.
        """
        try:
            await handle.cancel()
            await handle.terminate()
            await handle.kill_and_wait()
        except Exception:
            if not runner.done():
                runner.cancel()
            await _reap_cancelled_task(runner)
            return False
        if not runner.done():
            runner.cancel()
        await _reap_cancelled_task(runner)
        return True


async def _reap_cancelled_task(task: asyncio.Task[object]) -> None:
    """Await task shutdown so a terminal receipt never leaves a live runner."""
    try:
        await asyncio.shield(task)
    except (asyncio.CancelledError, Exception):
        pass


def _valid_bmad_execution_handle(handle: object) -> bool:
    """Require a callable wait/cancel/terminate/reap surface before use.

    ``@runtime_checkable`` Protocol membership deliberately allows a loose
    structural check.  This stricter boundary protects the exact methods the
    adapter will later await without invoking any of them during validation.
    """
    if not isinstance(handle, BmadBoundedExecutionHandle):
        return False
    return all(callable(getattr(handle, method, None)) for method in (
        "wait",
        "cancel",
        "terminate",
        "kill_and_wait",
    ))


def validate_transient_review_scope(
    materialized: object,
    path_scope: object,
) -> TransientReviewScopeValidation:
    """Validate/re-hash transient bodies without retaining them outside the call."""
    if type(materialized) is not list or type(path_scope) is not list or not materialized or not path_scope:
        return TransientReviewScopeValidation(False, "transient_scope_invalid")
    expected: dict[str, str] = {}
    for ref in path_scope:
        if type(ref) is not dict or set(ref) != {"path", "diffDigest"} or not _digest(ref.get("diffDigest")):
            return TransientReviewScopeValidation(False, "transient_scope_invalid")
        path_code = _path_validation_code(ref.get("path"))
        if path_code is not None:
            return TransientReviewScopeValidation(False, path_code)
        path = ref["path"]
        if path in expected:
            return TransientReviewScopeValidation(False, "transient_path_duplicate")
        expected[path] = ref["diffDigest"]
    checked: list[dict[str, str]] = []
    seen: set[str] = set()
    total_bytes = 0
    for entry in materialized:
        if type(entry) is not dict or set(entry) != {"path", "body"} or not isinstance(entry.get("body"), str):
            return TransientReviewScopeValidation(False, "transient_scope_invalid")
        path_code = _path_validation_code(entry.get("path"))
        if path_code is not None:
            return TransientReviewScopeValidation(False, path_code)
        body_bytes = len(entry["body"].encode("utf-8"))
        if body_bytes > MAX_MATERIALIZED_FILE_BYTES:
            return TransientReviewScopeValidation(False, "transient_file_oversize")
        total_bytes += body_bytes
        if total_bytes > MAX_MATERIALIZED_TOTAL_BYTES:
            return TransientReviewScopeValidation(False, "transient_scope_oversize")
        path = entry["path"]
        if path in seen:
            return TransientReviewScopeValidation(False, "transient_path_duplicate")
        seen.add(path)
        if path not in expected:
            return TransientReviewScopeValidation(False, "transient_path_outside_scope")
        digest = f"sha256:{hashlib.sha256(entry['body'].encode('utf-8')).hexdigest()}"
        if digest != expected[path]:
            return TransientReviewScopeValidation(False, "transient_digest_mismatch")
        checked.append({"path": path, "body": entry["body"]})
    if set(expected) != seen:
        return TransientReviewScopeValidation(False, "transient_scope_incomplete")
    return TransientReviewScopeValidation(True, "transient_scope_valid", tuple(checked))


def validate_exact_ollama_review_gate(gate: object) -> bool:
    return type(gate) is dict and gate == {
        "enabled": True,
        "endpointApproved": True,
        "modelApproved": True,
        "endpointRef": APPROVED_OLLAMA_ENDPOINT_REF,
        "modelRef": APPROVED_OLLAMA_MODEL_REF,
    }


def validate_bmad_local_review_gate(gate: object, runner_id: str | None = None) -> bool:
    """Gate BMAD with packet allowlists and a server-registered runner identity."""
    if type(gate) is not dict or set(gate) != {"routeAllowed", "adapterAllowed", "toolsAllowed", "registeredRunnerId"}:
        return False
    registered = gate.get("registeredRunnerId")
    return (
        gate.get("routeAllowed") is True
        and gate.get("adapterAllowed") is True
        and gate.get("toolsAllowed") is True
        and isinstance(registered, str)
        and _SAFE_RUNNER_ID.fullmatch(registered) is not None
        and (runner_id is None or registered == runner_id)
    )


def normalize_review_findings(
    findings: object,
    *,
    immutable_review: dict[str, str],
    allowed_paths: set[str],
) -> tuple[dict[str, str], ...] | None:
    if type(findings) not in {tuple, list} or len(findings) > 32:
        return None
    normalized: dict[str, dict[str, str]] = {}
    for candidate in findings:
        if not validate_normalized_finding(candidate).get("ok"):
            return None
        if candidate["reviewedHead"] != immutable_review.get("exactHead") or candidate["digest"] != immutable_review.get("digest"):
            return None
        if candidate["pathOrRef"] not in allowed_paths:
            return None
        existing = normalized.get(candidate["findingId"])
        if existing is not None and existing != candidate:
            return None
        normalized[candidate["findingId"]] = dict(candidate)
    return tuple(normalized[key] for key in sorted(normalized))


class ReviewFallbackCoordinator:
    """One-pass Claude -> exact Ollama -> bounded BMAD coordinator.

    Durable reservation/claim/finalization is intentionally owned by the
    supervisor runtime around every invocation, not by this task adapter.
    """

    def __init__(
        self,
        *,
        claude: DelegatedReviewAdapterPort,
        ollama: DelegatedReviewAdapterPort,
        bmad: DelegatedReviewAdapterPort,
        before_route: ReviewBeforeRoute | None = None,
        after_route: ReviewAfterRoute | None = None,
    ) -> None:
        self._claude = claude
        self._ollama = ollama
        self._bmad = bmad
        self._before_route = before_route
        self._after_route = after_route

    async def execute(
        self,
        *,
        immutable_review: dict[str, str],
        path_scope: list[dict[str, str]],
        materialized: list[dict[str, str]],
        ollama_exact_gate: dict[str, object],
        bmad_local_gate: dict[str, object] | None = None,
        cancellation_event: Event | None = None,
        allowed_route_ids: frozenset[str] | None = None,
    ) -> ReviewFallbackOutcome:
        allowed_routes = allowed_route_ids if allowed_route_ids is not None else frozenset({"claude_readonly", "ollama_exact", "bmad_local"})
        if "claude_readonly" not in allowed_routes:
            return self._blocked("claude_route_not_authorized", (), "reissue_disclosure_packet")
        scope = validate_transient_review_scope(materialized, path_scope)
        if not scope.ok:
            return self._blocked(scope.code, (), "reissue_disclosure_packet")
        allowed_paths = {item["path"] for item in scope.files}
        receipts: list[dict[str, object]] = []
        claude = await self._execute_route(self._claude, "claude_readonly", immutable_review, scope.files, None, cancellation_event=cancellation_event)
        receipts.append(_receipt("claude_readonly", claude))
        completed = self._completed(claude, immutable_review, allowed_paths, receipts, "claude_readonly")
        if completed is not None:
            return completed
        if claude.status not in _FALLBACK_ELIGIBLE:
            return self._blocked(claude.code, receipts, "reissue_disclosure_packet")
        if "ollama_exact" not in allowed_routes:
            return self._blocked("ollama_route_not_authorized", receipts, "reissue_disclosure_packet")
        # A failed exact-Ollama gate is provider exhaustion, not a terminal
        # review decision.  Preserve its typed receipt and advance once to the
        # already-gated local BMAD fallback.
        if not validate_exact_ollama_review_gate(ollama_exact_gate):
            ollama = ReviewAdapterOutcome("vetoed", "ollama_exact_gate_invalid")
        else:
            ollama = await self._execute_route(self._ollama, "ollama_exact", immutable_review, scope.files, ollama_exact_gate, cancellation_event=cancellation_event)
        receipts.append(_receipt("ollama_exact", ollama))
        completed = self._completed(ollama, immutable_review, allowed_paths, receipts, "ollama_exact")
        if completed is not None:
            return completed
        if ollama.status not in _FALLBACK_ELIGIBLE:
            return self._blocked(ollama.code, receipts, "reissue_disclosure_packet")
        if "bmad_local" not in allowed_routes:
            return self._blocked("bmad_route_not_authorized", receipts, "reissue_disclosure_packet")
        if not validate_bmad_local_review_gate(bmad_local_gate):
            return self._blocked("bmad_local_gate_invalid", receipts, "refresh_bmad_runner_gate")
        bmad = await self._execute_route(
            self._bmad, "bmad_local", immutable_review, scope.files, None, bmad_local_gate, cancellation_event
        )
        receipts.append(_receipt("bmad_local", bmad))
        completed = self._completed(bmad, immutable_review, allowed_paths, receipts, "bmad_local")
        if completed is not None:
            return completed
        return self._blocked(bmad.code, receipts, "inspect_bmad_recovery")

    async def _execute_route(
        self,
        adapter: DelegatedReviewAdapterPort,
        route_id: str,
        immutable_review: dict[str, str],
        materialized: tuple[dict[str, str], ...],
        ollama_exact_gate: dict[str, object] | None,
        bmad_local_gate: dict[str, object] | None = None,
        cancellation_event: Event | None = None,
    ) -> ReviewAdapterOutcome:
        if self._before_route is not None:
            blocked = await self._before_route(route_id)
            if blocked is not None:
                return blocked
        arguments: dict[str, object] = {
            "immutable_review": immutable_review,
            "materialized": materialized,
            "route_id": route_id,
            "ollama_exact_gate": ollama_exact_gate,
            "cancellation_event": cancellation_event,
        }
        if route_id == "bmad_local":
            arguments["bmad_local_gate"] = bmad_local_gate
        outcome = await adapter.execute(
            **arguments,
        )
        return await self._after_route(route_id, outcome) if self._after_route is not None else outcome

    @staticmethod
    def _completed(
        outcome: ReviewAdapterOutcome,
        immutable_review: dict[str, str],
        allowed_paths: set[str],
        receipts: list[dict[str, object]],
        route_id: str,
    ) -> ReviewFallbackOutcome | None:
        if outcome.status != "completed":
            return None
        findings = normalize_review_findings(outcome.findings, immutable_review=immutable_review, allowed_paths=allowed_paths)
        if findings is None:
            return ReviewFallbackCoordinator._blocked("normalized_findings_invalid", receipts, "reissue_disclosure_packet")
        return ReviewFallbackOutcome("completed", "review_completed", route_id, findings, tuple(receipts), "review_findings_ready")

    @staticmethod
    def _blocked(code: str, receipts: list[dict[str, object]] | tuple[dict[str, object], ...], action: str) -> ReviewFallbackOutcome:
        return ReviewFallbackOutcome("blocked", code, None, (), tuple(receipts), action)


class DurableDelegatedReviewRuntime:
    """Compose the task adapter with durable reserve/claim/recheck/finalize.

    The concrete lifecycle is supplied only by SupervisorService.  This keeps
    manager/dashboard code incapable of invoking a provider while making every
    side effect fenceable and testable with a fake lifecycle.
    """

    def __init__(self, *, coordinator: ReviewFallbackCoordinator, lifecycle: DurableReviewLifecyclePort) -> None:
        self._coordinator = coordinator
        self._lifecycle = lifecycle

    async def execute(
        self,
        *,
        immutable_review: dict[str, str],
        path_scope: list[dict[str, str]],
        materializer: TransientReviewMaterializer,
        ollama_exact_gate: dict[str, object],
        bmad_local_gate: dict[str, object] | None = None,
        cancellation_event: Event | None = None,
        allowed_route_ids: frozenset[str] | None = None,
    ) -> ReviewFallbackOutcome:
        allowed_routes = allowed_route_ids if allowed_route_ids is not None else frozenset({"claude_readonly", "ollama_exact", "bmad_local"})
        if "claude_readonly" not in allowed_routes:
            return ReviewFallbackOutcome("blocked", "claude_route_not_authorized", None, (), (), "reissue_disclosure_packet")
        first_route = "claude_readonly"
        first_route_claimed = False
        try:
            await self._lifecycle.reserve_and_claim(first_route)
            first_route_claimed = True
        except Exception as exc:
            return ReviewFallbackOutcome("blocked", f"claim_{type(exc).__name__.lower()}", None, (), (), "inspect_attempt_recovery")
        pre_materialization = await self._lifecycle.revalidate(first_route, "pre_materialization")
        if pre_materialization is not None:
            outcome = ReviewAdapterOutcome("stale", pre_materialization)
            await self._lifecycle.finalize(first_route, outcome)
            return ReviewFallbackOutcome("blocked", pre_materialization, None, (), (), "reissue_disclosure_packet")
        try:
            materialized = await materializer()
        except asyncio.CancelledError:
            outcome = ReviewAdapterOutcome("cancelled", "materialization_cancelled")
            await self._lifecycle.finalize(first_route, outcome)
            return ReviewFallbackOutcome("blocked", outcome.code, None, (), (), "reissue_disclosure_packet")
        except Exception as exc:
            outcome = ReviewAdapterOutcome("failed", f"materialization_{type(exc).__name__.lower()}")
            await self._lifecycle.finalize(first_route, outcome)
            return ReviewFallbackOutcome("blocked", outcome.code, None, (), (), "reissue_disclosure_packet")

        scope = validate_transient_review_scope(materialized, path_scope)
        if not scope.ok:
            outcome = ReviewAdapterOutcome("failed", scope.code)
            await self._lifecycle.finalize(first_route, outcome)
            return ReviewFallbackOutcome("blocked", scope.code, None, (), (), "reissue_disclosure_packet")

        post_materialization = await self._lifecycle.revalidate(first_route, "post_materialization")
        if post_materialization is not None:
            outcome = ReviewAdapterOutcome("stale", post_materialization)
            await self._lifecycle.finalize(first_route, outcome)
            return ReviewFallbackOutcome("blocked", post_materialization, None, (), (), "reissue_disclosure_packet")

        coordinator = ReviewFallbackCoordinator(
            claude=self._coordinator._claude,
            ollama=self._coordinator._ollama,
            bmad=self._coordinator._bmad,
            before_route=lambda route_id: self._before_route(route_id, first_route_claimed),
            after_route=self._after_route,
        )
        return await coordinator.execute(
            immutable_review=immutable_review,
            path_scope=path_scope,
            materialized=list(scope.files),
            ollama_exact_gate=ollama_exact_gate,
            bmad_local_gate=bmad_local_gate,
            cancellation_event=cancellation_event,
            allowed_route_ids=allowed_routes,
        )

    async def _before_route(self, route_id: str, first_route_claimed: bool) -> ReviewAdapterOutcome | None:
        if first_route_claimed and route_id == "claude_readonly":
            first_route_claimed = False
        else:
            try:
                await self._lifecycle.reserve_and_claim(route_id)
            except Exception as exc:
                return ReviewAdapterOutcome("stale", f"claim_{type(exc).__name__.lower()}")
        stale = await self._lifecycle.revalidate(route_id, "pre_send")
        if stale is None:
            return None
        outcome = ReviewAdapterOutcome("stale", stale)
        await self._lifecycle.finalize(route_id, outcome)
        return outcome

    async def _after_route(self, route_id: str, outcome: ReviewAdapterOutcome) -> ReviewAdapterOutcome:
        stale = await self._lifecycle.revalidate(route_id, "post_await")
        terminal = ReviewAdapterOutcome("stale", stale) if stale is not None else outcome
        await self._lifecycle.finalize(route_id, terminal)
        return terminal


def _receipt(route_id: str, outcome: ReviewAdapterOutcome) -> dict[str, object]:
    status = outcome.status if outcome.status in {"completed", "inconclusive", "failed", "timed_out", "cancelled", "unavailable", "vetoed", "scope_rejected", "empty", "rate_limited", "stale"} else "failed"
    code = outcome.code if isinstance(outcome.code, str) and _SAFE_OUTCOME_CODE.fullmatch(outcome.code) else "outcome_invalid"
    receipt = {"routeId": route_id, "status": status, "code": code, "rawPayloadRetained": False}
    if type(outcome.receipt) is dict:
        for key, value in outcome.receipt.items():
            if key not in _RECEIPT_FIELDS or key in {"status", "code", "rawPayloadRetained"}:
                continue
            if _receipt_value_allowed(key, value):
                receipt[key] = value
    return receipt


def _receipt_value_allowed(key: str, value: object) -> bool:
    if key in {"redactionApplied"}:
        return value is True
    if key in {"completionTokens", "promptTokens", "totalTokens", "responseCharacterCount", "reasoningCharacterCount"}:
        return isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= MAX_MATERIALIZED_TOTAL_BYTES
    if key == "modelId":
        return value in _RECEIPT_MODEL_IDS
    if key == "endpointFamily":
        return value in _RECEIPT_ENDPOINT_FAMILIES
    if key == "finishReason":
        return value is None or value in _RECEIPT_FINISH_REASONS
    if key == "timeoutState":
        return value in _RECEIPT_TIMEOUT_STATES
    if key == "cancellationState":
        return value in _RECEIPT_CANCELLATION_STATES
    return False


def _validated_bmad_outcome(value: object) -> ReviewAdapterOutcome:
    """Accept only compact BMAD terminal codes and metadata-safe receipts."""
    if not isinstance(value, ReviewAdapterOutcome):
        return ReviewAdapterOutcome("inconclusive", "bmad_outcome_invalid")
    allowed_codes = {
        "completed": {"completed"},
        "inconclusive": {"bmad_inconclusive", "bmad_boundary_unavailable", "bmad_runner_failed", "bmad_execution_handle_invalid"},
        "failed": {"bmad_failed"},
        "timed_out": {"bmad_timeout", "bmad_stop_failed"},
        "cancelled": {"bmad_cancelled", "bmad_stop_failed"},
    }
    if value.status not in allowed_codes or value.code not in allowed_codes[value.status]:
        return ReviewAdapterOutcome("inconclusive", "bmad_outcome_invalid")
    receipt = _receipt("bmad_local", value)
    return ReviewAdapterOutcome(value.status, value.code, value.findings, receipt)


def _outcome_from_transient_text(value: str, *, route_id: str) -> ReviewAdapterOutcome:
    """Parse strict JSON while ensuring raw provider/CLI text never leaves this frame."""
    if not value.strip():
        return ReviewAdapterOutcome("empty", f"{route_id}_empty")
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError):
        return ReviewAdapterOutcome("failed", f"{route_id}_result_invalid")
    if type(parsed) is not list:
        return ReviewAdapterOutcome("failed", f"{route_id}_result_invalid")
    return ReviewAdapterOutcome("completed", "completed", tuple(parsed))


def _review_prompt_from_scope(materialized: tuple[dict[str, str], ...]) -> str:
    """Build the only review prompt shape from already validated transient data."""
    sections = []
    for item in materialized:
        sections.append(f"FILE: {item['path']}\n---\n{item['body']}\n---")
    return (
        "Review exactly the following sanitized transient files. Return one JSON array of "
        "normalized-finding/v1 objects, or [] when no finding is justified.\n" + "\n".join(sections)
    )


def _safe_path(value: object) -> bool:
    return _path_validation_code(value) is None


def _path_validation_code(value: object) -> str | None:
    if not isinstance(value, str) or not value or len(value) > 240 or value.startswith("/") or "\\" in value:
        return "transient_scope_invalid"
    parts = value.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        return "transient_path_forbidden"
    for part in parts:
        lowered = part.lower()
        if part in _FORBIDDEN_PATH_SEGMENT or lowered.startswith(".env") or any(word in lowered for word in _FORBIDDEN_PATH_WORD):
            return "transient_path_forbidden"
    return None


def _digest(value: object) -> bool:
    return isinstance(value, str) and len(value) == 71 and value.startswith("sha256:") and all(char in "0123456789abcdef" for char in value[7:])
