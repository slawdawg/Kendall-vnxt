import asyncio
import json
import socket
import urllib.error
import urllib.request
from dataclasses import dataclass
from threading import Event
from typing import Any


@dataclass(frozen=True)
class OllamaProviderResult:
    status: str
    model_id: str
    endpoint_family: str
    finish_reason: str | None
    prompt_summary: str
    response_summary: str
    response_character_count: int
    reasoning_character_count: int
    prompt_character_count: int
    completion_tokens: int | None
    prompt_tokens: int | None
    total_tokens: int | None
    redaction_applied: bool
    raw_payload_retained: bool
    timeout_state: str
    cancellation_state: str

    def to_metadata(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "modelId": self.model_id,
            "endpointFamily": self.endpoint_family,
            "finishReason": self.finish_reason,
            "promptSummary": self.prompt_summary,
            "responseSummary": self.response_summary,
            "responseCharacterCount": self.response_character_count,
            "reasoningCharacterCount": self.reasoning_character_count,
            "promptCharacterCount": self.prompt_character_count,
            "completionTokens": self.completion_tokens,
            "promptTokens": self.prompt_tokens,
            "totalTokens": self.total_tokens,
            "redactionApplied": self.redaction_applied,
            "rawPayloadRetained": self.raw_payload_retained,
            "timeoutState": self.timeout_state,
            "cancellationState": self.cancellation_state,
        }


class OllamaProviderAdapter:
    endpoint_family = "approved_vm_to_host_ollama_openai_compatible"

    def __init__(
        self,
        *,
        endpoint_url: str,
        model_id: str,
        connect_timeout_seconds: int,
        total_timeout_seconds: int,
    ) -> None:
        self.endpoint_url = endpoint_url
        self.model_id = model_id
        self.connect_timeout_seconds = connect_timeout_seconds
        self.total_timeout_seconds = total_timeout_seconds

    async def explain(
        self,
        *,
        evidence_summary: str,
        evidence_count: int,
        cancellation_event: Event | None = None,
    ) -> OllamaProviderResult:
        prompt = self._build_prompt(evidence_summary=evidence_summary, evidence_count=evidence_count)
        try:
            return await asyncio.wait_for(
                asyncio.to_thread(self._post_chat_completion, prompt, cancellation_event),
                timeout=self.total_timeout_seconds,
            )
        except TimeoutError:
            return self._terminal_result(
                status="timed_out",
                prompt=prompt,
                response_summary="Provider request timed out; raw provider payload was not retained.",
                timeout_state="total_timeout_elapsed",
                cancellation_state="not_cancelled",
            )
        except asyncio.CancelledError:
            if cancellation_event:
                cancellation_event.set()
            return self._terminal_result(
                status="cancelled",
                prompt=prompt,
                response_summary="Provider request cancelled; raw provider payload was not retained.",
                timeout_state="not_timed_out",
                cancellation_state="cancel_requested_request_abort_recorded",
            )
        except (OSError, urllib.error.URLError, ValueError) as exc:
            return self._terminal_result(
                status="failed",
                prompt=prompt,
                response_summary=f"Provider request failed before retained output; reason class {type(exc).__name__}.",
                timeout_state="not_timed_out",
                cancellation_state="not_cancelled",
            )

    def _post_chat_completion(self, prompt: str, cancellation_event: Event | None) -> OllamaProviderResult:
        if cancellation_event and cancellation_event.is_set():
            return self._terminal_result(
                status="cancelled",
                prompt=prompt,
                response_summary="Provider request cancelled before send; raw provider payload was not retained.",
                timeout_state="not_timed_out",
                cancellation_state="cancel_requested_before_send",
            )
        socket.setdefaulttimeout(self.connect_timeout_seconds)
        body = json.dumps(
            {
                "model": self.model_id,
                "messages": [
                    {
                        "role": "system",
                        "content": "Summarize approved Kendall_vNxt evidence only. Do not request secrets, files, commands, or credentials.",
                    },
                    {"role": "user", "content": prompt},
                ],
                "stream": False,
            }
        ).encode("utf-8")
        request = urllib.request.Request(
            self.endpoint_url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=self.total_timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
        choice = (payload.get("choices") or [{}])[0]
        message = choice.get("message") or {}
        content = message.get("content") if isinstance(message.get("content"), str) else ""
        reasoning = message.get("reasoning") if isinstance(message.get("reasoning"), str) else ""
        usage = payload.get("usage") if isinstance(payload.get("usage"), dict) else {}
        return OllamaProviderResult(
            status="completed",
            model_id=str(payload.get("model") or self.model_id),
            endpoint_family=self.endpoint_family,
            finish_reason=choice.get("finish_reason") if isinstance(choice.get("finish_reason"), str) else None,
            prompt_summary=self._prompt_summary(prompt),
            response_summary=(
                f"Provider returned {len(content)} content character(s) and {len(reasoning)} reasoning character(s); "
                "raw text redacted."
            ),
            response_character_count=len(content),
            reasoning_character_count=len(reasoning),
            prompt_character_count=len(prompt),
            completion_tokens=usage.get("completion_tokens") if isinstance(usage.get("completion_tokens"), int) else None,
            prompt_tokens=usage.get("prompt_tokens") if isinstance(usage.get("prompt_tokens"), int) else None,
            total_tokens=usage.get("total_tokens") if isinstance(usage.get("total_tokens"), int) else None,
            redaction_applied=True,
            raw_payload_retained=False,
            timeout_state="completed_before_total_timeout",
            cancellation_state="not_cancelled",
        )

    def _terminal_result(
        self,
        *,
        status: str,
        prompt: str,
        response_summary: str,
        timeout_state: str,
        cancellation_state: str,
    ) -> OllamaProviderResult:
        return OllamaProviderResult(
            status=status,
            model_id=self.model_id,
            endpoint_family=self.endpoint_family,
            finish_reason=None,
            prompt_summary=self._prompt_summary(prompt),
            response_summary=response_summary,
            response_character_count=0,
            reasoning_character_count=0,
            prompt_character_count=len(prompt),
            completion_tokens=None,
            prompt_tokens=None,
            total_tokens=None,
            redaction_applied=True,
            raw_payload_retained=False,
            timeout_state=timeout_state,
            cancellation_state=cancellation_state,
        )

    def _build_prompt(self, *, evidence_summary: str, evidence_count: int) -> str:
        return (
            "Kendall_vNxt local evidence explanation request.\n"
            f"Approved evidence summary: {evidence_summary}\n"
            f"Workflow event summary count: {evidence_count}\n"
            "Return a concise operator-facing explanation based only on this approved summary."
        )

    def _prompt_summary(self, prompt: str) -> str:
        return f"Approved local evidence prompt, {len(prompt)} character(s), raw text not retained."
