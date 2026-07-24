import hashlib
import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace


HEAD = "a" * 40
DIGEST = "sha256:" + "b" * 64


def _path_ref(path: str, body: str) -> dict[str, str]:
    return {"path": path, "diffDigest": "sha256:" + hashlib.sha256(body.encode()).hexdigest()}


def _finding(path: str = "src/ok.py") -> dict[str, str]:
    from supervisor.domain.review_route import NORMALIZED_FINDING_SCHEMA_VERSION

    rule = "review-rule/v1"
    line = "1"
    key = f"{HEAD}:{DIGEST}:{path}:{line}:{rule}"
    return {
        "schemaVersion": NORMALIZED_FINDING_SCHEMA_VERSION,
        "findingId": "normalized-finding:sha256:" + hashlib.sha256(key.encode()).hexdigest(),
        "rule": rule,
        "severity": "medium",
        "pathOrRef": path,
        "lineOrRange": line,
        "summary": "Bounded review found one safe metadata issue.",
        "remediation": "Apply the bounded remediation and re-run review.",
        "reviewedHead": HEAD,
        "digest": DIGEST,
    }


class _FakeBmadExecutionHandle:
    """A metadata-only stand-in for one governed BMAD child process."""

    def __init__(self, outcome, *, wait_forever: bool = False) -> None:
        self.outcome = outcome
        self.wait_forever = wait_forever
        self.child_alive = True
        self.child_reaped = False
        self.calls: list[str] = []
        self._stopped = asyncio.Event()

    async def wait(self):
        if self.wait_forever:
            await self._stopped.wait()
        self.child_alive = False
        return self.outcome

    async def cancel(self) -> None:
        self.calls.append("cancel")

    async def terminate(self) -> None:
        self.calls.append("terminate")

    async def kill_and_wait(self) -> None:
        self.calls.append("kill_and_wait")
        self.child_alive = False
        self.child_reaped = True
        self._stopped.set()


def test_materialized_review_scope_rejects_nested_env_and_digest_mismatch() -> None:
    from supervisor.domain.delegated_review_adapter import validate_transient_review_scope

    body = "safe patch"
    valid = validate_transient_review_scope(
        [{"path": "src/ok.py", "body": body}], [_path_ref("src/ok.py", body)]
    )
    nested_env = validate_transient_review_scope(
        [{"path": "src/.env/secret.py", "body": body}], [_path_ref("src/.env/secret.py", body)]
    )
    mismatch = validate_transient_review_scope(
        [{"path": "src/ok.py", "body": "wrong"}], [_path_ref("src/ok.py", body)]
    )

    assert valid.ok is True
    assert nested_env.ok is False and nested_env.code == "transient_path_forbidden"
    assert mismatch.ok is False and mismatch.code == "transient_digest_mismatch"


def test_fallback_advances_claude_once_then_exact_ollama_and_deduplicates_findings() -> None:
    from supervisor.domain.delegated_review_adapter import (
        ReviewAdapterOutcome,
        ReviewFallbackCoordinator,
    )

    class Claude:
        async def execute(self, **_kwargs):
            return ReviewAdapterOutcome(status="unavailable", code="claude_unavailable")

    class Ollama:
        async def execute(self, **_kwargs):
            return ReviewAdapterOutcome(
                status="completed",
                code="completed",
                findings=(_finding(), _finding()),
                receipt={"routeId": "ollama_exact", "rawPayloadRetained": False},
            )

    class Bmad:
        async def execute(self, **_kwargs):
            raise AssertionError("BMAD must not run after valid Ollama findings.")

    outcome = __import__("asyncio").run(
        ReviewFallbackCoordinator(claude=Claude(), ollama=Ollama(), bmad=Bmad()).execute(
            immutable_review={"executionJobId": "job-1", "exactHead": HEAD, "digest": DIGEST},
            path_scope=[_path_ref("src/ok.py", "safe patch")],
            materialized=[{"path": "src/ok.py", "body": "safe patch"}],
            ollama_exact_gate={
                "enabled": True,
                "endpointApproved": True,
                "modelApproved": True,
                "endpointRef": "ollama-endpoint:192.168.1.128:11434/v1/chat/completions",
                "modelRef": "ollama-model:qwen3-14b",
            },
            bmad_local_gate={"routeAllowed": True, "adapterAllowed": True, "toolsAllowed": True, "registeredRunnerId": "bmad.runner-1"},
        )
    )

    assert outcome.state == "completed"
    assert outcome.route_id == "ollama_exact"
    assert len(outcome.findings) == 1
    assert outcome.raw_payload_retained is False
    assert [receipt["routeId"] for receipt in outcome.receipts] == ["claude_readonly", "ollama_exact"]


def test_fallback_never_dispatches_a_route_omitted_from_the_packet_authorization() -> None:
    from supervisor.domain.delegated_review_adapter import ReviewAdapterOutcome, ReviewFallbackCoordinator

    calls: list[str] = []

    class Claude:
        async def execute(self, **_kwargs):
            calls.append("claude")
            return ReviewAdapterOutcome("unavailable", "claude_unavailable")

    class Never:
        async def execute(self, **_kwargs):
            raise AssertionError("an omitted route must not receive the transient scope")

    outcome = asyncio.run(ReviewFallbackCoordinator(claude=Claude(), ollama=Never(), bmad=Never()).execute(
        immutable_review={"executionJobId": "job-1", "exactHead": HEAD, "digest": DIGEST},
        path_scope=[_path_ref("src/ok.py", "safe patch")],
        materialized=[{"path": "src/ok.py", "body": "safe patch"}],
        ollama_exact_gate={},
        allowed_route_ids=frozenset({"claude_readonly"}),
    ))

    assert calls == ["claude"]
    assert (outcome.state, outcome.code) == ("blocked", "ollama_route_not_authorized")
    assert [receipt["routeId"] for receipt in outcome.receipts] == ["claude_readonly"]


def test_provider_exhaustion_runs_bounded_bmad_once_and_inconclusive_blocks_delivery() -> None:
    from supervisor.domain.delegated_review_adapter import (
        ReviewAdapterOutcome,
        ReviewFallbackCoordinator,
    )

    class Failed:
        async def execute(self, **_kwargs):
            return ReviewAdapterOutcome(status="failed", code="bounded_failure")

    class Bmad:
        async def execute(self, **_kwargs):
            return ReviewAdapterOutcome(status="inconclusive", code="bmad_inconclusive")

    outcome = __import__("asyncio").run(
        ReviewFallbackCoordinator(claude=Failed(), ollama=Failed(), bmad=Bmad()).execute(
            immutable_review={"executionJobId": "job-1", "exactHead": HEAD, "digest": DIGEST},
            path_scope=[_path_ref("src/ok.py", "safe patch")],
            materialized=[{"path": "src/ok.py", "body": "safe patch"}],
            ollama_exact_gate={
                "enabled": True,
                "endpointApproved": True,
                "modelApproved": True,
                "endpointRef": "ollama-endpoint:192.168.1.128:11434/v1/chat/completions",
                "modelRef": "ollama-model:qwen3-14b",
            },
            bmad_local_gate={"routeAllowed": True, "adapterAllowed": True, "toolsAllowed": True, "registeredRunnerId": "bmad.runner-1"},
        )
    )

    assert outcome.state == "blocked"
    assert outcome.code == "bmad_inconclusive"
    assert outcome.next_safe_action == "inspect_bmad_recovery"
    assert len(outcome.receipts) == 3


def test_ollama_rate_limit_advances_once_to_bounded_bmad() -> None:
    from supervisor.domain.delegated_review_adapter import ReviewAdapterOutcome, ReviewFallbackCoordinator

    class Claude:
        async def execute(self, **_kwargs): return ReviewAdapterOutcome("failed", "claude_failed")
    class RateLimited:
        async def execute(self, **_kwargs): return ReviewAdapterOutcome("rate_limited", "ollama_http_429")
    class Bmad:
        async def execute(self, **_kwargs): return ReviewAdapterOutcome("inconclusive", "bmad_inconclusive")

    outcome = asyncio.run(ReviewFallbackCoordinator(claude=Claude(), ollama=RateLimited(), bmad=Bmad()).execute(
        immutable_review={"executionJobId": "job-1", "exactHead": HEAD, "digest": DIGEST},
        path_scope=[_path_ref("src/ok.py", "safe patch")], materialized=[{"path": "src/ok.py", "body": "safe patch"}],
        ollama_exact_gate={"enabled": True, "endpointApproved": True, "modelApproved": True, "endpointRef": "ollama-endpoint:192.168.1.128:11434/v1/chat/completions", "modelRef": "ollama-model:qwen3-14b"},
        bmad_local_gate={"routeAllowed": True, "adapterAllowed": True, "toolsAllowed": True, "registeredRunnerId": "bmad.runner-1"},
    ))
    assert outcome.code == "bmad_inconclusive"
    assert [receipt["routeId"] for receipt in outcome.receipts] == ["claude_readonly", "ollama_exact", "bmad_local"]


def test_concrete_claude_adapter_has_fixed_read_grep_only_argv_and_no_budget_flag() -> None:
    from supervisor.domain.delegated_review_adapter import ClaudeReadonlyReviewAdapter

    captured: dict[str, object] = {}

    async def fake_runner(argv, cwd):
        captured["argv"] = argv
        captured["cwd"] = cwd
        return "completed", "[]"

    outcome = __import__("asyncio").run(
        ClaudeReadonlyReviewAdapter(process_runner=fake_runner).execute(
            immutable_review={"executionJobId": "job-1", "exactHead": HEAD, "digest": DIGEST},
            materialized=({"path": "src/ok.py", "body": "safe patch"},),
            route_id="claude_readonly",
            ollama_exact_gate=None,
        )
    )

    assert outcome.status == "completed"
    assert captured["argv"][0:2] == ("claude", "-p")
    assert "Read,Grep" in captured["argv"]
    assert "--max-budget-usd" not in captured["argv"]


def test_durable_cancellation_reaps_inflight_claude_fake_runner() -> None:
    from threading import Event
    from supervisor.domain.delegated_review_adapter import ClaudeReadonlyReviewAdapter

    entered = asyncio.Event()
    reaped = asyncio.Event()
    cancellation = Event()

    async def runner(_argv, _cwd):
        entered.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            reaped.set()
            raise

    async def run():
        task = asyncio.create_task(ClaudeReadonlyReviewAdapter(process_runner=runner).execute(
            immutable_review={"executionJobId": "job-1", "exactHead": HEAD, "digest": DIGEST},
            materialized=({"path": "src/ok.py", "body": "safe patch"},),
            route_id="claude_readonly", ollama_exact_gate=None, cancellation_event=cancellation,
        ))
        await entered.wait()
        cancellation.set()
        return await task

    outcome = asyncio.run(run())
    assert (outcome.status, outcome.code) == ("cancelled", "claude_cancelled")
    assert reaped.is_set()


def test_claude_adapter_rejects_escape_before_writing_or_running() -> None:
    from supervisor.domain.delegated_review_adapter import ClaudeReadonlyReviewAdapter

    called = False

    async def fake_runner(_argv, _cwd):
        nonlocal called
        called = True
        return "completed", "[]"

    outcome = asyncio.run(ClaudeReadonlyReviewAdapter(process_runner=fake_runner).execute(
        immutable_review={"executionJobId": "job-1", "exactHead": HEAD, "digest": DIGEST},
        materialized=({"path": "../escape.py", "body": "safe"},),
        route_id="claude_readonly",
        ollama_exact_gate=None,
    ))
    assert outcome.status == "scope_rejected"
    assert called is False


def test_scope_limits_reject_before_hashing_or_provider_dispatch() -> None:
    from supervisor.domain.delegated_review_adapter import MAX_MATERIALIZED_FILE_BYTES, validate_transient_review_scope

    body = "x" * (MAX_MATERIALIZED_FILE_BYTES + 1)
    scope = validate_transient_review_scope([{"path": "src/large.py", "body": body}], [_path_ref("src/large.py", body)])
    assert scope.ok is False
    assert scope.code == "transient_file_oversize"


def test_receipts_are_allowlisted_and_cannot_persist_provider_text() -> None:
    from supervisor.domain.delegated_review_adapter import ReviewAdapterOutcome, _receipt

    receipt = _receipt("bmad_local", ReviewAdapterOutcome(
        "failed", "safe_code", receipt={"endpointFamily": "approved", "raw": "provider completion", "source": "diff", "modelId": "qwen3:14b"}
    ))
    assert receipt == {"routeId": "bmad_local", "status": "failed", "code": "safe_code", "rawPayloadRetained": False, "modelId": "qwen3:14b"}


def test_bmad_requires_packet_gate_registered_identity_and_bounded_terminal_result() -> None:
    from supervisor.domain.delegated_review_adapter import BoundedBmadReviewAdapter, ReviewAdapterOutcome

    calls: list[str] = []
    def runner(_identity, _scope):
        calls.append("ran")
        return _FakeBmadExecutionHandle(ReviewAdapterOutcome("completed", "completed", ()))

    adapter = BoundedBmadReviewAdapter(runner=runner, runner_id="bmad.runner-1")
    common = {"immutable_review": {"executionJobId": "job-1", "exactHead": HEAD, "digest": DIGEST}, "materialized": ({"path": "src/ok.py", "body": "safe patch"},), "route_id": "bmad_local", "ollama_exact_gate": None}
    rejected = asyncio.run(adapter.execute(**common, bmad_local_gate={"routeAllowed": True, "adapterAllowed": True, "toolsAllowed": True, "registeredRunnerId": "wrong.runner"}))
    accepted = asyncio.run(adapter.execute(**common, bmad_local_gate={"routeAllowed": True, "adapterAllowed": True, "toolsAllowed": True, "registeredRunnerId": "bmad.runner-1"}))
    assert (rejected.status, rejected.code) == ("vetoed", "bmad_local_gate_invalid")
    assert accepted.status == "completed" and calls == ["ran"]


def test_bmad_timeout_and_untrusted_outcome_are_typed_without_raw_receipts() -> None:
    from supervisor.domain.delegated_review_adapter import BoundedBmadReviewAdapter, ReviewAdapterOutcome

    slow_handle = _FakeBmadExecutionHandle(ReviewAdapterOutcome("completed", "completed"), wait_forever=True)

    def slow(_identity, _scope):
        return slow_handle
    adapter = BoundedBmadReviewAdapter(runner=slow, runner_id="bmad.runner-1")
    adapter._TIMEOUT_SECONDS = 0.001
    common = {"immutable_review": {"executionJobId": "job-1", "exactHead": HEAD, "digest": DIGEST}, "materialized": ({"path": "src/ok.py", "body": "safe patch"},), "route_id": "bmad_local", "ollama_exact_gate": None, "bmad_local_gate": {"routeAllowed": True, "adapterAllowed": True, "toolsAllowed": True, "registeredRunnerId": "bmad.runner-1"}}
    timed_out = asyncio.run(adapter.execute(**common))
    assert (timed_out.status, timed_out.code) == ("timed_out", "bmad_timeout")
    assert slow_handle.calls == ["cancel", "terminate", "kill_and_wait"]
    assert slow_handle.child_alive is False and slow_handle.child_reaped is True

    def raw_runner(_identity, _scope):
        return _FakeBmadExecutionHandle(
            ReviewAdapterOutcome("completed", "provider_completion_contains_raw", receipt={"raw": "forbidden"})
        )
    invalid = asyncio.run(BoundedBmadReviewAdapter(runner=raw_runner, runner_id="bmad.runner-1").execute(**common))
    assert (invalid.status, invalid.code, invalid.receipt) == ("inconclusive", "bmad_outcome_invalid", {})


def test_malformed_bmad_handle_is_rejected_before_wait_task_and_durably_finalized() -> None:
    """A structural Protocol match is insufficient if any control member is non-callable."""
    from supervisor.domain.delegated_review_adapter import (
        BoundedBmadReviewAdapter,
        DurableDelegatedReviewRuntime,
        ReviewAdapterOutcome,
        ReviewFallbackCoordinator,
    )

    calls: list[str] = []

    class MalformedHandle:
        def wait(self):
            raise AssertionError("wait must not be invoked for a malformed handle")

        cancel = "not-callable"

        async def terminate(self):
            raise AssertionError("terminate must not be invoked for a malformed handle")

        async def kill_and_wait(self):
            raise AssertionError("kill_and_wait must not be invoked for a malformed handle")

    class Unavailable:
        async def execute(self, **_kwargs):
            return ReviewAdapterOutcome("unavailable", "provider_unavailable")

    class Lifecycle:
        async def reserve_and_claim(self, route_id):
            calls.append(f"reserve:{route_id}")

        async def revalidate(self, route_id, phase):
            calls.append(f"revalidate:{route_id}:{phase}")
            return None

        async def finalize(self, route_id, outcome):
            calls.append(f"finalize:{route_id}:{outcome.code}")

    def malformed_runner(_identity, _scope):
        calls.append("runner")
        return MalformedHandle()

    async def materialize():
        return [{"path": "src/ok.py", "body": "safe patch"}]

    runtime = DurableDelegatedReviewRuntime(
        coordinator=ReviewFallbackCoordinator(
            claude=Unavailable(),
            ollama=Unavailable(),
            bmad=BoundedBmadReviewAdapter(runner=malformed_runner, runner_id="bmad.runner-1"),
        ),
        lifecycle=Lifecycle(),
    )
    outcome = asyncio.run(runtime.execute(
        immutable_review={"executionJobId": "job-1", "exactHead": HEAD, "digest": DIGEST},
        path_scope=[_path_ref("src/ok.py", "safe patch")],
        materializer=materialize,
        ollama_exact_gate={
            "enabled": True,
            "endpointApproved": True,
            "modelApproved": True,
            "endpointRef": "ollama-endpoint:192.168.1.128:11434/v1/chat/completions",
            "modelRef": "ollama-model:qwen3-14b",
        },
        bmad_local_gate={
            "routeAllowed": True,
            "adapterAllowed": True,
            "toolsAllowed": True,
            "registeredRunnerId": "bmad.runner-1",
        },
    ))

    assert (outcome.state, outcome.code) == ("blocked", "bmad_execution_handle_invalid")
    assert calls.count("runner") == 1
    assert "finalize:bmad_local:bmad_execution_handle_invalid" in calls


def test_durable_cancellation_terminates_and_reaps_inflight_bmad_fake_child() -> None:
    from threading import Event
    from supervisor.domain.delegated_review_adapter import BoundedBmadReviewAdapter, ReviewAdapterOutcome

    entered = asyncio.Event()
    cancellation = Event()
    handle = _FakeBmadExecutionHandle(ReviewAdapterOutcome("completed", "completed"), wait_forever=True)

    def runner(_identity, _scope):
        entered.set()
        return handle

    async def run():
        adapter = BoundedBmadReviewAdapter(runner=runner, runner_id="bmad.runner-1")
        task = asyncio.create_task(adapter.execute(
            immutable_review={"executionJobId": "job-1", "exactHead": HEAD, "digest": DIGEST},
            materialized=({"path": "src/ok.py", "body": "safe patch"},), route_id="bmad_local",
            ollama_exact_gate=None,
            bmad_local_gate={"routeAllowed": True, "adapterAllowed": True, "toolsAllowed": True, "registeredRunnerId": "bmad.runner-1"},
            cancellation_event=cancellation,
        ))
        await entered.wait()
        cancellation.set()
        return await task

    outcome = asyncio.run(run())
    assert (outcome.status, outcome.code) == ("cancelled", "bmad_cancelled")
    assert handle.calls == ["cancel", "terminate", "kill_and_wait"]
    assert handle.child_alive is False
    assert handle.child_reaped is True


def test_conflicting_duplicate_findings_reject_independent_of_provider_order() -> None:
    from supervisor.domain.delegated_review_adapter import normalize_review_findings
    first = _finding()
    conflicting = {**first, "summary": "Another valid but conflicting safe summary."}
    result = normalize_review_findings((first, conflicting), immutable_review={"executionJobId": "job-1", "exactHead": HEAD, "digest": DIGEST}, allowed_paths={"src/ok.py"})
    assert result is None


def test_claim_failure_blocks_without_reusing_shared_claim_state() -> None:
    from supervisor.domain.delegated_review_adapter import DurableDelegatedReviewRuntime, ReviewFallbackCoordinator

    class Lifecycle:
        def __init__(self): self.calls = 0
        async def reserve_and_claim(self, _route):
            self.calls += 1
            raise ValueError("claim failed")
        async def revalidate(self, *_args): return None
        async def finalize(self, *_args): raise AssertionError("no claim to finalize")

    class Never:
        async def execute(self, **_kwargs): raise AssertionError("no adapter execution")

    lifecycle = Lifecycle()
    runtime = DurableDelegatedReviewRuntime(coordinator=ReviewFallbackCoordinator(claude=Never(), ollama=Never(), bmad=Never()), lifecycle=lifecycle)
    async def materialize(): return [{"path": "src/ok.py", "body": "safe patch"}]
    async def twice():
        first = await runtime.execute(immutable_review={"executionJobId": "job-1", "exactHead": HEAD, "digest": DIGEST}, path_scope=[_path_ref("src/ok.py", "safe patch")], materializer=materialize, ollama_exact_gate={})
        second = await runtime.execute(immutable_review={"executionJobId": "job-1", "exactHead": HEAD, "digest": DIGEST}, path_scope=[_path_ref("src/ok.py", "safe patch")], materializer=materialize, ollama_exact_gate={})
        return first, second
    first, second = asyncio.run(twice())
    assert first.code == second.code == "claim_valueerror"
    assert lifecycle.calls == 2


def test_runtime_rejects_a_packet_without_claude_before_claim_or_materialization() -> None:
    from supervisor.domain.delegated_review_adapter import DurableDelegatedReviewRuntime, ReviewFallbackCoordinator

    calls: list[str] = []

    class Lifecycle:
        async def reserve_and_claim(self, _route):
            calls.append("claim")
        async def revalidate(self, *_args):
            raise AssertionError("a disallowed first route must not revalidate")
        async def finalize(self, *_args):
            raise AssertionError("a disallowed first route must not finalize")

    class Never:
        async def execute(self, **_kwargs):
            raise AssertionError("a disallowed first route must not execute")

    async def materialize():
        calls.append("materialize")
        return [{"path": "src/ok.py", "body": "safe patch"}]

    outcome = asyncio.run(DurableDelegatedReviewRuntime(
        coordinator=ReviewFallbackCoordinator(claude=Never(), ollama=Never(), bmad=Never()), lifecycle=Lifecycle(),
    ).execute(
        immutable_review={"executionJobId": "job-1", "exactHead": HEAD, "digest": DIGEST},
        path_scope=[_path_ref("src/ok.py", "safe patch")], materializer=materialize,
        ollama_exact_gate={}, allowed_route_ids=frozenset({"ollama_exact"}),
    ))

    assert calls == []
    assert (outcome.state, outcome.code) == ("blocked", "claude_route_not_authorized")


def test_supervisor_rejects_a_packet_that_omits_the_required_claude_first_authorization() -> None:
    from supervisor.application.service import SupervisorService
    from supervisor.config.settings import Settings
    from supervisor.infrastructure.streaming.bus import EventBus

    service = SupervisorService(Settings(), EventBus())
    async def materializer():
        return [{"path": "src/ok.py", "body": "safe patch"}]
    service.register_governed_delegated_review_worker(materializer, worker_id="worker-1")
    now = datetime.now(timezone.utc)
    issued = (now - timedelta(minutes=1)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    expires = (now + timedelta(minutes=2)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    packet = {
        "schemaVersion": "disclosure-packet/v1", "disclosurePacketId": "packet-ollama-only",
        "immutableReview": {"executionJobId": "job-1", "exactHead": HEAD, "digest": DIGEST},
        "routeAllowlist": ["ollama_exact"], "adapterAllowlist": ["ollama-exact-injected/v1"], "toolAllowlist": ["none"],
        "authority": {"issuerId": "operator", "authorityRef": "authority-1", "valid": True},
        "issuance": {"issuedAt": issued, "expiresAt": expires, "revocationState": "active", "cancellationState": "active", "singleUse": True},
        "scope": {"dataClass": "sanitized_path_scoped_private_diff", "evidenceRefs": ["evidence:sha256:" + "c" * 64], "pathScope": [_path_ref("src/ok.py", "safe patch")]},
        "metadataOnly": True, "rawPayloadRetained": False,
    }

    class Session:
        async def get(self, *_args, **_kwargs):
            raise AssertionError("rejected authorization must not reach work-item persistence")

    async def prepare():
        return await service.prepare_governed_delegated_review(
            Session(), "work-item-1", immutable_review=packet["immutableReview"], disclosure_packet=packet, worker_id="worker-1",
        )

    try:
        asyncio.run(prepare())
    except ValueError as exc:
        assert "Claude-first" in str(exc)
    else:
        raise AssertionError("packet omitting Claude-first authorization was accepted")


def test_supervisor_runtime_accepts_a_current_packet_before_reservation(monkeypatch) -> None:
    """Exercise the real SupervisorService review entrypoint with fake-only ports."""
    from supervisor.application.service import SupervisorService
    from supervisor.config.settings import Settings
    from supervisor.domain.delegated_review_adapter import ReviewAdapterOutcome
    from supervisor.domain.types import ExecutionAttemptStatus
    from supervisor.infrastructure.db.models import ExecutionAttempt, WorkItem
    from supervisor.infrastructure.streaming.bus import EventBus

    service = SupervisorService(Settings(), EventBus())
    item = SimpleNamespace(id="work-item-1")
    attempt = SimpleNamespace(
        id="route-attempt-1", work_item_id=item.id, status=ExecutionAttemptStatus.RUNNING.value,
        launch_claimed_at=datetime.now(timezone.utc), launch_fence_token="fence", cancel_requested_at=None,
    )
    calls: list[str] = []

    class Session:
        async def get(self, model, _id, **_kwargs):
            if model is WorkItem:
                return item
            if model is ExecutionAttempt:
                return dispatch if _id == dispatch.id else attempt
            return None
        async def refresh(self, _value): pass
        async def rollback(self): pass
        async def commit(self): pass
        async def execute(self, _statement):
            dispatch.launch_claimed_at = datetime.now(timezone.utc)
            dispatch.revision += 1
            return SimpleNamespace(rowcount=1)

    class Completed:
        async def execute(self, **_kwargs):
            calls.append("adapter")
            return ReviewAdapterOutcome("completed", "completed", ())

    async def reserve(_session, _item, **kwargs):
        calls.append("reserve")
        attempt.worker_id = kwargs["worker_id"]
        attempt.authority_mode = kwargs["authority_mode"]
        attempt.artifact_refs_json = kwargs["artifact_refs"]
        return attempt
    async def claim(_session, _item, candidate, **_kwargs):
        calls.append("claim")
        return candidate
    async def finalize(_session, _item, _attempt, **_kwargs):
        calls.append("finalize")
    async def reject(*_args, **_kwargs):
        raise AssertionError("current packet must claim successfully")

    monkeypatch.setattr(service, "_reserve_external_launch_attempt", reserve)
    monkeypatch.setattr(service, "_claim_external_launch_attempt", claim)
    monkeypatch.setattr(service, "_finalize_external_launch_attempt", finalize)
    monkeypatch.setattr(service, "_reject_external_launch_reservation", reject)
    monkeypatch.setattr(service, "_ollama_provider_gate_state", lambda: {"enabled": True})
    service._bounded_review_claude_adapter = Completed()
    service._bounded_review_ollama_adapter = Completed()
    service._bounded_review_bmad_adapter = Completed()
    now = datetime.now(timezone.utc)
    issued = (now - timedelta(minutes=1)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    expires = (now + timedelta(minutes=2)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    body = "safe patch"
    immutable = {"executionJobId": "job-1", "exactHead": HEAD, "digest": DIGEST}
    packet = {
        "schemaVersion": "disclosure-packet/v1", "disclosurePacketId": "packet-1",
        "immutableReview": immutable, "routeAllowlist": ["claude_readonly", "ollama_exact", "bmad_local"],
        "adapterAllowlist": ["claude-readonly-injected/v1", "ollama-exact-injected/v1", "bmad-governed-runner/v1"],
        "toolAllowlist": ["Read", "Grep", "none"],
        "authority": {"issuerId": "operator", "authorityRef": "authority-1", "valid": True},
        "issuance": {"issuedAt": issued, "expiresAt": expires, "revocationState": "active", "cancellationState": "active", "singleUse": True},
        "scope": {"dataClass": "sanitized_path_scoped_private_diff", "evidenceRefs": ["evidence:sha256:" + "c" * 64], "pathScope": [_path_ref("src/ok.py", body)]},
        "metadataOnly": True, "rawPayloadRetained": False,
    }
    async def materializer(): return [{"path": "src/ok.py", "body": body}]
    from supervisor.domain.review_route import disclosure_packet_canonical_digest, validate_disclosure_packet
    assert validate_disclosure_packet(packet, now=now.isoformat(timespec="milliseconds").replace("+00:00", "Z"), route_policy={"routeAllowlist": ["claude_readonly", "ollama_exact", "bmad_local"], "adapterAllowlist": ["claude-readonly-injected/v1", "ollama-exact-injected/v1", "bmad-governed-runner/v1"], "toolAllowlist": ["Read", "Grep", "none"]}, immutable_review=immutable) == {"ok": True, "reasons": []}
    dispatch = SimpleNamespace(
        id="dispatch-1", work_item_id=item.id, worker_id="review-worker-1",
        authority_mode="operator_approved_bounded_review", status=ExecutionAttemptStatus.PREPARED.value,
        revision=1, launch_claimed_at=None, cancel_requested_at=None, artifact_refs_json=[{
            "artifactType": "governed_review_dispatch_v1", "packet": packet,
            "packetDigest": disclosure_packet_canonical_digest(packet), "immutableReview": immutable,
            "authorityIssuerId": "operator", "authorityRef": "authority-1", "workerId": "review-worker-1",
            "metadataOnly": True, "rawPayloadRetained": False,
        }],
    )
    service.register_governed_delegated_review_worker(materializer, worker_id="review-worker-1")
    outcome = asyncio.run(service.execute_governed_delegated_review(Session(), item.id, dispatch_attempt_id=dispatch.id))
    assert outcome.state == "completed"
    assert calls == ["reserve", "claim", "adapter", "finalize"]


def test_supervisor_prepares_immutable_server_owned_dispatch_record() -> None:
    from supervisor.application.service import SupervisorService
    from supervisor.config.settings import Settings
    from supervisor.infrastructure.db.models import WorkItem
    from supervisor.infrastructure.streaming.bus import EventBus

    service = SupervisorService(Settings(), EventBus())
    item = SimpleNamespace(id="work-item-prepare")
    captured: list[object] = []

    class Session:
        async def get(self, model, _id, **_kwargs): return item if model is WorkItem else None
        def add(self, value): captured.append(value)
        async def commit(self): pass
        async def refresh(self, _value): pass

    async def materializer(): return [{"path": "src/ok.py", "body": "safe patch"}]
    service.register_governed_delegated_review_worker(materializer, worker_id="review-worker-prepare")
    now = datetime.now(timezone.utc)
    issued = (now - timedelta(minutes=1)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    expires = (now + timedelta(minutes=2)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    immutable = {"executionJobId": "job-1", "exactHead": HEAD, "digest": DIGEST}
    packet = {
        "schemaVersion": "disclosure-packet/v1", "disclosurePacketId": "packet-prepare", "immutableReview": immutable,
        "routeAllowlist": ["claude_readonly", "ollama_exact", "bmad_local"],
        "adapterAllowlist": ["claude-readonly-injected/v1", "ollama-exact-injected/v1", "bmad-governed-runner/v1"],
        "toolAllowlist": ["Read", "Grep", "none"],
        "authority": {"issuerId": "operator", "authorityRef": "authority-prepare", "valid": True},
        "issuance": {"issuedAt": issued, "expiresAt": expires, "revocationState": "active", "cancellationState": "active", "singleUse": True},
        "scope": {"dataClass": "sanitized_path_scoped_private_diff", "evidenceRefs": ["evidence:sha256:" + "c" * 64], "pathScope": [_path_ref("src/ok.py", "safe patch")]},
        "metadataOnly": True, "rawPayloadRetained": False,
    }

    dispatch_id = asyncio.run(service.prepare_governed_delegated_review(Session(), item.id, immutable_review=immutable, disclosure_packet=packet, worker_id="review-worker-prepare"))
    packet["authority"]["issuerId"] = "forged-after-prepare"

    assert dispatch_id == captured[0].id
    assert captured[0].status == "prepared"
    record = captured[0].artifact_refs_json[0]
    assert captured[0].worker_id == "review-worker-prepare"
    assert record["authorityIssuerId"] == "operator"
    assert record["packet"]["authority"]["issuerId"] == "operator"
    assert record["rawPayloadRetained"] is False


def test_real_db_prepared_dispatch_does_not_block_its_first_route_reservation(tmp_path) -> None:
    """A durable prepared dispatch is metadata, not its own active side effect."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from supervisor.application.service import SupervisorService
    from supervisor.config.settings import Settings
    from supervisor.domain.delegated_review_adapter import ReviewAdapterOutcome
    from supervisor.domain.types import ExecutionAttemptStatus
    from supervisor.infrastructure.db.database import Base
    from supervisor.infrastructure.db.models import AdmissionLock, ExecutionAttempt, SupervisorControl, WorkItem
    from supervisor.infrastructure.streaming.bus import EventBus

    async def run() -> None:
        engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'governed-review.db'}", future=True)
        try:
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)
            sessions = async_sessionmaker(engine, expire_on_commit=False)
            service = SupervisorService(Settings(), EventBus())

            class Completed:
                async def execute(self, **_kwargs):
                    return ReviewAdapterOutcome("completed", "completed", ())

            service._bounded_review_claude_adapter = Completed()
            async def materializer(): return [{"path": "src/ok.py", "body": "safe patch"}]
            service.register_governed_delegated_review_worker(materializer, worker_id="review-worker-db")
            now = datetime.now(timezone.utc)
            issued = (now - timedelta(minutes=1)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
            expires = (now + timedelta(minutes=2)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
            immutable = {"executionJobId": "job-db", "exactHead": HEAD, "digest": DIGEST}
            body = "safe patch"
            packet = {
                "schemaVersion": "disclosure-packet/v1", "disclosurePacketId": "packet-db", "immutableReview": immutable,
                "routeAllowlist": ["claude_readonly", "ollama_exact", "bmad_local"],
                "adapterAllowlist": ["claude-readonly-injected/v1", "ollama-exact-injected/v1", "bmad-governed-runner/v1"],
                "toolAllowlist": ["Read", "Grep", "none"],
                "authority": {"issuerId": "operator", "authorityRef": "authority-db", "valid": True},
                "issuance": {"issuedAt": issued, "expiresAt": expires, "revocationState": "active", "cancellationState": "active", "singleUse": True},
                "scope": {"dataClass": "sanitized_path_scoped_private_diff", "evidenceRefs": ["evidence:sha256:" + "c" * 64], "pathScope": [_path_ref("src/ok.py", body)]},
                "metadataOnly": True, "rawPayloadRetained": False,
            }
            async with sessions() as session:
                item = WorkItem(id="work-item-db", title="Governed DB review", requested_outcome="Review", source="test")
                session.add_all([AdmissionLock(scope="execute", generation=0), SupervisorControl(id=1, mode="running"), item])
                await session.commit()
                dispatch_id = await service.prepare_governed_delegated_review(
                    session, item.id, immutable_review=immutable, disclosure_packet=packet, worker_id="review-worker-db"
                )
                outcome = await service.execute_governed_delegated_review(session, item.id, dispatch_attempt_id=dispatch_id)
                assert outcome.state == "completed"
                attempts = list((await session.execute(select(ExecutionAttempt).order_by(ExecutionAttempt.created_at))).scalars())
                assert [attempt.status for attempt in attempts] == [ExecutionAttemptStatus.PREPARED.value, ExecutionAttemptStatus.COMPLETED.value]
        finally:
            await engine.dispose()

    asyncio.run(run())


def test_concrete_ollama_adapter_rejects_gate_before_transport_call() -> None:
    from supervisor.domain.delegated_review_adapter import OllamaExactReviewAdapter

    class Transport:
        async def execute(self, _request):
            raise AssertionError("Exact gate must reject before transport execution.")

    outcome = __import__("asyncio").run(
        OllamaExactReviewAdapter(transport=Transport()).execute(
            immutable_review={"executionJobId": "job-1", "exactHead": HEAD, "digest": DIGEST},
            materialized=({"path": "src/ok.py", "body": "safe patch"},),
            route_id="ollama_exact",
            ollama_exact_gate={"enabled": False},
        )
    )

    assert outcome.status == "vetoed"
    assert outcome.code == "ollama_exact_gate_invalid"


def test_invalid_exact_ollama_gate_advances_once_to_registered_bmad() -> None:
    from supervisor.domain.delegated_review_adapter import ReviewAdapterOutcome, ReviewFallbackCoordinator

    calls: list[str] = []

    class Claude:
        async def execute(self, **_kwargs):
            calls.append("claude")
            return ReviewAdapterOutcome("unavailable", "claude_unavailable")

    class Ollama:
        async def execute(self, **_kwargs):
            raise AssertionError("invalid exact gate must not dispatch Ollama")

    class Bmad:
        async def execute(self, **_kwargs):
            calls.append("bmad")
            return ReviewAdapterOutcome("completed", "completed", ())

    outcome = asyncio.run(ReviewFallbackCoordinator(claude=Claude(), ollama=Ollama(), bmad=Bmad()).execute(
        immutable_review={"executionJobId": "job-1", "exactHead": HEAD, "digest": DIGEST},
        path_scope=[_path_ref("src/ok.py", "safe patch")], materialized=[{"path": "src/ok.py", "body": "safe patch"}],
        ollama_exact_gate={"enabled": False},
        bmad_local_gate={"routeAllowed": True, "adapterAllowed": True, "toolsAllowed": True, "registeredRunnerId": "bmad.runner-1"},
    ))

    assert calls == ["claude", "bmad"]
    assert outcome.state == "completed"
    assert [receipt["routeId"] for receipt in outcome.receipts] == ["claude_readonly", "ollama_exact", "bmad_local"]
    assert outcome.receipts[1]["code"] == "ollama_exact_gate_invalid"


def test_durable_runtime_reserves_and_claims_before_materialization_and_finalizes_post_await_stale() -> None:
    from supervisor.domain.delegated_review_adapter import (
        DurableDelegatedReviewRuntime,
        ReviewAdapterOutcome,
        ReviewFallbackCoordinator,
    )

    calls: list[str] = []

    class Lifecycle:
        async def reserve_and_claim(self, route_id):
            calls.append(f"reserve_claim:{route_id}")

        async def revalidate(self, route_id, phase):
            calls.append(f"revalidate:{route_id}:{phase}")
            return "immutable_identity_stale" if phase == "post_await" else None

        async def finalize(self, route_id, outcome):
            calls.append(f"finalize:{route_id}:{outcome.code}")

    class Claude:
        async def execute(self, **_kwargs):
            calls.append("claude_execute")
            return ReviewAdapterOutcome(status="completed", code="completed", findings=())

    class Never:
        async def execute(self, **_kwargs):
            raise AssertionError("fallback must not run after a terminal stale state")

    async def materialize():
        calls.append("materialize")
        return [{"path": "src/ok.py", "body": "safe patch"}]

    outcome = __import__("asyncio").run(
        DurableDelegatedReviewRuntime(
            coordinator=ReviewFallbackCoordinator(claude=Claude(), ollama=Never(), bmad=Never()),
            lifecycle=Lifecycle(),
        ).execute(
            immutable_review={"executionJobId": "job-1", "exactHead": HEAD, "digest": DIGEST},
            path_scope=[_path_ref("src/ok.py", "safe patch")],
            materializer=materialize,
            ollama_exact_gate={
                "enabled": True,
                "endpointApproved": True,
                "modelApproved": True,
                "endpointRef": "ollama-endpoint:192.168.1.128:11434/v1/chat/completions",
                "modelRef": "ollama-model:qwen3-14b",
            },
        )
    )

    assert calls[:5] == [
        "reserve_claim:claude_readonly",
        "revalidate:claude_readonly:pre_materialization",
        "materialize",
        "revalidate:claude_readonly:post_materialization",
        "revalidate:claude_readonly:pre_send",
    ]
    assert "revalidate:claude_readonly:post_await" in calls
    assert "finalize:claude_readonly:immutable_identity_stale" in calls
    assert outcome.state == "blocked"
    assert outcome.code == "immutable_identity_stale"


def test_claude_process_sandbox_has_only_approved_readonly_session_mount_contract() -> None:
    """The approved external route needs network/auth, never supervisor credential reads."""
    from pathlib import Path

    source = Path(__file__).parents[1] / "src" / "supervisor" / "domain" / "delegated_review_adapter.py"
    content = source.read_text(encoding="utf-8")
    assert '"--unshare-all", "--share-net"' in content
    for session_path in ('".claude"', '".claude.json"', '".config" / "claude"'):
        assert session_path in content
    assert '"--ro-bind", str(source), destination' in content
    assert '"--dir", f"{session_home}/.config"' in content
    assert '"--ro-bind", cwd, "/review"' in content
    assert "supervisor never opens, copies, logs, or retains their contents" in content
