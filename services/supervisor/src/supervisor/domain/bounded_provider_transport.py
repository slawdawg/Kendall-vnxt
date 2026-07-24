"""Constrained provider transport shared by task-specific adapters.

This module owns only the exact approved Ollama HTTP boundary.  It accepts a
validated task-specific request, never a caller-selected endpoint/model or a
generic prompt API.  Response text is transient: callers must transform it to
their task result and persist metadata only.
"""

from __future__ import annotations

import asyncio
import http.client
import json
import socket
import time
from dataclasses import dataclass
from threading import Event, Lock
from typing import Any
from urllib.parse import urlsplit


MAX_PROVIDER_RESPONSE_BYTES = 1024 * 1024
MAX_PROVIDER_REQUEST_BYTES = 2 * 1024 * 1024
APPROVED_OLLAMA_ENDPOINT_URL = "http://192.168.1.128:11434/v1/chat/completions"
APPROVED_OLLAMA_MODEL_ID = "qwen3:14b"
_TASK_KINDS = frozenset({"evidence_explanation", "review"})
_ROUTE_IDS = frozenset({"ollama_exact"})
_REQUEST_SEAL = object()


class BoundedProviderHTTPError(OSError):
    def __init__(self, status: int) -> None:
        self.status = status
        if status == 429:
            self.status_label = "rate_limited"
        elif 500 <= status <= 599:
            self.status_label = "unavailable"
        else:
            self.status_label = "failed"
        super().__init__(f"Bounded provider returned HTTP {status}.")


class _AbortableConnection:
    """Lets the async deadline close the blocking HTTP socket immediately."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._connection: http.client.HTTPConnection | None = None
        self._aborted = False

    def attach(self, connection: http.client.HTTPConnection) -> None:
        with self._lock:
            self._connection = connection
            aborted = self._aborted
        if aborted:
            connection.close()

    def abort(self) -> None:
        with self._lock:
            self._aborted = True
            connection = self._connection
        if connection is not None:
            connection.close()


@dataclass(frozen=True)
class _BoundedProviderTransportRequest:
    """Private request shape created only by a task-specific transport method."""

    task_kind: str
    route_id: str
    messages: tuple[dict[str, str], ...]
    seal: object


@dataclass(frozen=True)
class BoundedProviderTransportResult:
    status: str
    code: str
    model_id: str
    endpoint_family: str
    finish_reason: str | None
    content: str
    reasoning: str
    completion_tokens: int | None
    prompt_tokens: int | None
    total_tokens: int | None
    timeout_state: str
    cancellation_state: str

    def to_metadata(self) -> dict[str, Any]:
        """A safe receipt deliberately omitting response text and request bodies."""
        return {
            "status": self.status,
            "code": self.code,
            "modelId": self.model_id,
            "endpointFamily": self.endpoint_family,
            "finishReason": self.finish_reason,
            "responseCharacterCount": len(self.content),
            "reasoningCharacterCount": len(self.reasoning),
            "completionTokens": self.completion_tokens,
            "promptTokens": self.prompt_tokens,
            "totalTokens": self.total_tokens,
            "redactionApplied": True,
            "rawPayloadRetained": False,
            "timeoutState": self.timeout_state,
            "cancellationState": self.cancellation_state,
        }


class BoundedProviderTransport:
    """Exact endpoint/model transport for approved task adapters only."""

    endpoint_family = "approved_vm_to_host_ollama_openai_compatible"

    def __init__(
        self,
        *,
        endpoint_url: str,
        model_id: str,
        connect_timeout_seconds: int,
        total_timeout_seconds: int,
    ) -> None:
        # These are a concrete approved binding, not preferences supplied by a
        # caller.  Settings are checked separately by the supervisor gate; an
        # override cannot turn this transport into an arbitrary endpoint/model
        # client.
        self.endpoint_url = endpoint_url
        self.model_id = model_id
        self.connect_timeout_seconds = connect_timeout_seconds
        self.total_timeout_seconds = total_timeout_seconds

    async def execute_evidence_explanation(
        self,
        *,
        messages: tuple[dict[str, str], ...],
        cancellation_event: Event | None = None,
    ) -> BoundedProviderTransportResult:
        return await self._execute_task("evidence_explanation", messages, cancellation_event=cancellation_event)

    async def execute_review(
        self,
        *,
        messages: tuple[dict[str, str], ...],
        cancellation_event: Event | None = None,
    ) -> BoundedProviderTransportResult:
        return await self._execute_task("review", messages, cancellation_event=cancellation_event)

    async def _execute_task(
        self,
        task_kind: str,
        messages: tuple[dict[str, str], ...],
        *,
        cancellation_event: Event | None = None,
    ) -> BoundedProviderTransportResult:
        if not self._has_approved_binding():
            return self._terminal_result(status="rejected", code="approved_route_binding_invalid", timeout_state="not_timed_out", cancellation_state="not_cancelled")
        request = _BoundedProviderTransportRequest(task_kind, "ollama_exact", messages, _REQUEST_SEAL)
        invalid = self._validate_request(request)
        if invalid is not None:
            return self._terminal_result(status="rejected", code=invalid, timeout_state="not_timed_out", cancellation_state="not_cancelled")
        request_body = self._encode_request(request.messages)
        if request_body is None:
            return self._terminal_result(status="rejected", code="request_oversize", timeout_state="not_timed_out", cancellation_state="not_cancelled")
        aborter = _AbortableConnection()
        worker = asyncio.create_task(
            asyncio.to_thread(self._post_chat_completion, request_body, cancellation_event, aborter)
        )
        cancellation_waiter: asyncio.Task[bool] | None = None
        if cancellation_event is not None:
            # A durable supervisor cancellation is a threading.Event because
            # the HTTP request is intentionally blocking in a worker thread.
            # Wait for it alongside the request so cancellation closes the
            # socket instead of merely being noticed after a response arrives.
            cancellation_waiter = asyncio.create_task(asyncio.to_thread(cancellation_event.wait))
        try:
            if cancellation_waiter is None:
                return await asyncio.wait_for(asyncio.shield(worker), timeout=self.total_timeout_seconds)
            done, _pending = await asyncio.wait(
                {worker, cancellation_waiter},
                timeout=self.total_timeout_seconds,
                return_when=asyncio.FIRST_COMPLETED,
            )
            if cancellation_waiter in done and cancellation_event.is_set():
                aborter.abort()
                await self._drain_aborted_worker(worker)
                return self._terminal_result(
                    status="cancelled",
                    code="cancel_requested",
                    timeout_state="not_timed_out",
                    cancellation_state="cancel_requested_request_abort_recorded",
                )
            if worker in done:
                return worker.result()
            aborter.abort()
            await self._drain_aborted_worker(worker)
            return self._terminal_result(
                status="timed_out",
                code="total_timeout_elapsed",
                timeout_state="total_timeout_elapsed",
                cancellation_state="not_cancelled",
            )
        except TimeoutError:
            aborter.abort()
            await self._drain_aborted_worker(worker)
            return self._terminal_result(status="timed_out", code="total_timeout_elapsed", timeout_state="total_timeout_elapsed", cancellation_state="not_cancelled")
        except asyncio.CancelledError:
            if cancellation_event:
                cancellation_event.set()
            aborter.abort()
            await self._drain_aborted_worker(worker)
            return self._terminal_result(status="cancelled", code="cancel_requested", timeout_state="not_timed_out", cancellation_state="cancel_requested_request_abort_recorded")
        except BoundedProviderHTTPError as exc:
            return self._terminal_result(status=exc.status_label, code=f"http_{exc.status}", timeout_state="not_timed_out", cancellation_state="not_cancelled")
        except (http.client.HTTPException, OSError, ValueError, json.JSONDecodeError) as exc:
            return self._terminal_result(status="failed", code=f"transport_{type(exc).__name__.lower()}", timeout_state="not_timed_out", cancellation_state="not_cancelled")
        finally:
            if cancellation_waiter is not None:
                cancellation_waiter.cancel()
                try:
                    await cancellation_waiter
                except asyncio.CancelledError:
                    pass

    def _validate_request(self, request: object) -> str | None:
        if not isinstance(request, _BoundedProviderTransportRequest) or request.seal is not _REQUEST_SEAL:
            return "request_invalid"
        if request.task_kind not in _TASK_KINDS:
            return "task_kind_invalid"
        if request.route_id not in _ROUTE_IDS:
            return "route_invalid"
        if not request.messages or len(request.messages) > 4:
            return "messages_invalid"
        for message in request.messages:
            if type(message) is not dict or set(message) != {"role", "content"}:
                return "messages_invalid"
            if message["role"] not in {"system", "user"} or not isinstance(message["content"], str) or not message["content"]:
                return "messages_invalid"
        return None

    def _encode_request(self, messages: tuple[dict[str, str], ...]) -> bytes | None:
        """Cap the task-shaped request before it reaches blocking HTTP work."""
        try:
            body = json.dumps(
                {"model": self.model_id, "messages": list(messages), "stream": False},
                ensure_ascii=False,
                separators=(",", ":"),
            ).encode("utf-8")
        except (TypeError, ValueError, UnicodeEncodeError):
            return None
        return body if len(body) <= MAX_PROVIDER_REQUEST_BYTES else None

    @staticmethod
    async def _drain_aborted_worker(worker: asyncio.Task[BoundedProviderTransportResult]) -> None:
        """Do not record a terminal result while the closed HTTP worker survives."""
        try:
            await asyncio.shield(worker)
        except (BoundedProviderHTTPError, http.client.HTTPException, OSError, ValueError, json.JSONDecodeError):
            pass

    def _has_approved_binding(self) -> bool:
        return (
            self.endpoint_url == APPROVED_OLLAMA_ENDPOINT_URL
            and self.model_id == APPROVED_OLLAMA_MODEL_ID
            and self.connect_timeout_seconds == 2
            and self.total_timeout_seconds == 120
        )

    def _post_chat_completion(
        self,
        body: bytes,
        cancellation_event: Event | None,
        aborter: _AbortableConnection | None = None,
    ) -> BoundedProviderTransportResult:
        if cancellation_event and cancellation_event.is_set():
            return self._terminal_result(status="cancelled", code="cancel_requested_before_send", timeout_state="not_timed_out", cancellation_state="cancel_requested_before_send")
        parsed = urlsplit(self.endpoint_url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("Provider endpoint must be an HTTP(S) URL with a host")
        connection_type = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
        connection = connection_type(parsed.hostname, parsed.port, timeout=self.connect_timeout_seconds)
        if aborter is not None:
            aborter.attach(connection)
        started = time.monotonic()
        try:
            connection.connect()
            remaining = max(0.1, self.total_timeout_seconds - (time.monotonic() - started))
            if connection.sock is not None:
                connection.sock.settimeout(remaining)
            path = parsed.path or "/"
            if parsed.query:
                path = f"{path}?{parsed.query}"
            connection.request("POST", path, body=body, headers={"Content-Type": "application/json"})
            if cancellation_event and cancellation_event.is_set():
                return self._terminal_result(status="cancelled", code="cancel_requested_before_response", timeout_state="not_timed_out", cancellation_state="cancel_requested_request_abort_recorded")
            response = connection.getresponse()
            if not 200 <= response.status < 300:
                raise BoundedProviderHTTPError(response.status)
            response_body = response.read(MAX_PROVIDER_RESPONSE_BYTES + 1)
            if len(response_body) > MAX_PROVIDER_RESPONSE_BYTES:
                raise ValueError("Provider response exceeded the metadata-only bound")
            payload = json.loads(response_body.decode("utf-8"))
        finally:
            connection.close()
        if payload.get("model") != self.model_id:
            raise ValueError("Provider response model did not match the exact approved model")
        choices = payload.get("choices")
        if type(choices) is not list or len(choices) != 1 or type(choices[0]) is not dict:
            raise ValueError("Provider response choices were malformed")
        choice = choices[0]
        message = choice.get("message") if isinstance(choice.get("message"), dict) else {}
        content = message.get("content") if isinstance(message.get("content"), str) else ""
        reasoning = message.get("reasoning") if isinstance(message.get("reasoning"), str) else ""
        usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
        return BoundedProviderTransportResult(
            status="completed",
            code="completed",
            model_id=str(payload.get("model") or self.model_id),
            endpoint_family=self.endpoint_family,
            finish_reason=choice.get("finish_reason") if isinstance(choice.get("finish_reason"), str) else None,
            content=content,
            reasoning=reasoning,
            completion_tokens=usage.get("completion_tokens") if isinstance(usage.get("completion_tokens"), int) else None,
            prompt_tokens=usage.get("prompt_tokens") if isinstance(usage.get("prompt_tokens"), int) else None,
            total_tokens=usage.get("total_tokens") if isinstance(usage.get("total_tokens"), int) else None,
            timeout_state="completed_before_total_timeout",
            cancellation_state="not_cancelled",
        )

    def _terminal_result(
        self,
        *,
        status: str,
        code: str,
        timeout_state: str,
        cancellation_state: str,
    ) -> BoundedProviderTransportResult:
        return BoundedProviderTransportResult(
            status=status,
            code=code,
            model_id=self.model_id,
            endpoint_family=self.endpoint_family,
            finish_reason=None,
            content="",
            reasoning="",
            completion_tokens=None,
            prompt_tokens=None,
            total_tokens=None,
            timeout_state=timeout_state,
            cancellation_state=cancellation_state,
        )
