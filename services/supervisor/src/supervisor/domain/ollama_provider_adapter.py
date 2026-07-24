"""Task-specific local evidence adapter over the bounded provider transport."""

from __future__ import annotations

from dataclasses import dataclass
from threading import Event
from typing import Any

from supervisor.domain.bounded_provider_transport import (
    BoundedProviderTransport,
)


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
    """Evidence-only facade; it cannot receive a review diff or arbitrary prompt."""

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
        self._transport = BoundedProviderTransport(
            endpoint_url=endpoint_url,
            model_id=model_id,
            connect_timeout_seconds=connect_timeout_seconds,
            total_timeout_seconds=total_timeout_seconds,
        )

    async def explain(
        self,
        *,
        evidence_summary: str,
        evidence_count: int,
        cancellation_event: Event | None = None,
    ) -> OllamaProviderResult:
        prompt = self._build_prompt(evidence_summary=evidence_summary, evidence_count=evidence_count)
        result = await self._transport.execute_evidence_explanation(
            messages=(
                {"role": "system", "content": "Summarize approved Kendall_vNxt evidence only. Do not request secrets, files, commands, or credentials."},
                {"role": "user", "content": prompt},
            ),
            cancellation_event=cancellation_event,
        )
        return self._from_transport_result(result, prompt)

    def _from_transport_result(self, result: object, prompt: str) -> OllamaProviderResult:
        """Map transient transport output to the historical evidence-only receipt."""
        metadata = result.to_metadata()
        return OllamaProviderResult(
            status=self._compatibility_status(result.status),
            model_id=result.model_id,
            endpoint_family=result.endpoint_family,
            finish_reason=result.finish_reason,
            prompt_summary=self._prompt_summary(prompt),
            response_summary=(
                f"Provider returned {len(result.content)} content character(s) and {len(result.reasoning)} reasoning character(s); raw text redacted."
                if result.status == "completed"
                else f"Provider request {result.status}; raw provider payload was not retained."
            ),
            response_character_count=metadata["responseCharacterCount"],
            reasoning_character_count=metadata["reasoningCharacterCount"],
            prompt_character_count=len(prompt),
            completion_tokens=metadata["completionTokens"],
            prompt_tokens=metadata["promptTokens"],
            total_tokens=metadata["totalTokens"],
            redaction_applied=True,
            raw_payload_retained=False,
            timeout_state=result.timeout_state,
            cancellation_state=result.cancellation_state,
        )

    def _post_chat_completion(self, prompt: str, cancellation_event: Event | None) -> OllamaProviderResult:
        """Compatibility seam retained for existing focused adapter tests."""
        result = self._transport._post_chat_completion(
            (
                {"role": "system", "content": "Summarize approved Kendall_vNxt evidence only. Do not request secrets, files, commands, or credentials."},
                {"role": "user", "content": prompt},
            ),
            cancellation_event,
        )
        return self._from_transport_result(result, prompt)

    @staticmethod
    def _compatibility_status(status: str) -> str:
        return {"rate_limited": "rate-limited", "rejected": "failed"}.get(status, status)

    def _build_prompt(self, *, evidence_summary: str, evidence_count: int) -> str:
        return (
            "Kendall_vNxt local evidence explanation request.\n"
            f"Approved evidence summary: {evidence_summary}\n"
            f"Workflow event summary count: {evidence_count}\n"
            "Return a concise operator-facing explanation based only on this approved summary."
        )

    @staticmethod
    def _prompt_summary(prompt: str) -> str:
        return f"Approved local evidence prompt, {len(prompt)} character(s), raw text not retained."
