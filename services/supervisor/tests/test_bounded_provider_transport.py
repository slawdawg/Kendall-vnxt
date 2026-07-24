import asyncio


def test_bounded_transport_keeps_provider_text_transient_and_returns_metadata_only_receipt(monkeypatch) -> None:
    from supervisor.domain.bounded_provider_transport import (
        BoundedProviderTransport,
    )

    captured: dict[str, object] = {}

    class FakeSocket:
        def settimeout(self, timeout):
            captured["read_timeout"] = timeout

    class FakeResponse:
        status = 200

        def read(self, _limit=None):
            return b'{"model":"qwen3:14b","choices":[{"message":{"content":"transient provider text"},"finish_reason":"stop"}],"usage":{"completion_tokens":1,"prompt_tokens":2,"total_tokens":3}}'

    class FakeConnection:
        sock = FakeSocket()

        def __init__(self, host, port, timeout):
            captured["host"] = host
            captured["connect_timeout"] = timeout

        def connect(self):
            captured["connected"] = True

        def request(self, method, path, body, headers):
            captured["request"] = (method, path, headers)

        def getresponse(self):
            return FakeResponse()

        def close(self):
            captured["closed"] = True

    monkeypatch.setattr("http.client.HTTPConnection", FakeConnection)
    transport = BoundedProviderTransport(
        endpoint_url="http://192.168.1.128:11434/v1/chat/completions",
        model_id="qwen3:14b",
        connect_timeout_seconds=2,
        total_timeout_seconds=120,
    )

    result = asyncio.run(
        transport.execute_evidence_explanation(
            messages=(
                {"role": "system", "content": "bounded system instruction"},
                {"role": "user", "content": "approved task input"},
            )
        )
    )

    assert result.status == "completed"
    assert result.content == "transient provider text"
    assert result.to_metadata()["rawPayloadRetained"] is False
    assert "content" not in result.to_metadata()
    assert captured["connect_timeout"] == 2
    assert captured["read_timeout"] <= 120
    assert captured["closed"] is True


def test_bounded_transport_has_no_generic_request_escape_hatch_and_rejects_unapproved_binding() -> None:
    from supervisor.domain.bounded_provider_transport import BoundedProviderTransport

    transport = BoundedProviderTransport(
        endpoint_url="http://192.168.1.128:11434/v1/chat/completions",
        model_id="qwen3:14b",
        connect_timeout_seconds=2,
        total_timeout_seconds=120,
    )

    assert not hasattr(transport, "execute")
    unbound = BoundedProviderTransport(
        endpoint_url="http://other.invalid/v1/chat/completions",
        model_id="qwen3:14b",
        connect_timeout_seconds=2,
        total_timeout_seconds=120,
    )
    result = asyncio.run(unbound.execute_review(messages=({"role": "user", "content": "not allowed"},)))
    assert result.status == "rejected"
    assert result.code == "approved_route_binding_invalid"


def test_bounded_transport_rejects_a_response_with_a_different_model(monkeypatch) -> None:
    from supervisor.domain.bounded_provider_transport import BoundedProviderTransport

    class Response:
        status = 200

        def read(self, _limit=None):
            return b'{"model":"wrong-model","choices":[{"message":{"content":"[]"}}]}'

    class Connection:
        sock = None

        def __init__(self, *_args, **_kwargs):
            pass

        def connect(self):
            pass

        def request(self, *_args, **_kwargs):
            pass

        def getresponse(self):
            return Response()

        def close(self):
            pass

    monkeypatch.setattr("http.client.HTTPConnection", Connection)
    result = asyncio.run(BoundedProviderTransport(
        endpoint_url="http://192.168.1.128:11434/v1/chat/completions",
        model_id="qwen3:14b",
        connect_timeout_seconds=2,
        total_timeout_seconds=120,
    ).execute_review(messages=({"role": "user", "content": "safe"},)))
    assert result.status == "failed"
    assert result.code == "transport_valueerror"


def test_total_timeout_aborts_the_inflight_connection(monkeypatch) -> None:
    from supervisor.domain.bounded_provider_transport import BoundedProviderTransport

    closed = asyncio.Event()

    class Connection:
        sock = None
        def __init__(self, *_args, **_kwargs): pass
        def connect(self): pass
        def request(self, *_args, **_kwargs): pass
        def getresponse(self):
            import time
            while not closed.is_set(): time.sleep(0.001)
            raise OSError("closed")
        def close(self): closed.set()

    monkeypatch.setattr("http.client.HTTPConnection", Connection)
    transport = BoundedProviderTransport(endpoint_url="http://192.168.1.128:11434/v1/chat/completions", model_id="qwen3:14b", connect_timeout_seconds=2, total_timeout_seconds=120)
    monkeypatch.setattr(transport, "_has_approved_binding", lambda: True)
    transport.total_timeout_seconds = 0.01
    result = asyncio.run(transport.execute_review(messages=({"role": "user", "content": "safe"},)))
    assert result.status == "timed_out"
    assert closed.is_set()


def test_cancellation_aborts_and_drains_the_inflight_connection(monkeypatch) -> None:
    from supervisor.domain.bounded_provider_transport import BoundedProviderTransport

    closed = asyncio.Event()

    class Connection:
        sock = None
        def __init__(self, *_args, **_kwargs): pass
        def connect(self): pass
        def request(self, *_args, **_kwargs): pass
        def getresponse(self):
            import time
            while not closed.is_set(): time.sleep(0.001)
            raise OSError("closed")
        def close(self): closed.set()

    monkeypatch.setattr("http.client.HTTPConnection", Connection)
    transport = BoundedProviderTransport(endpoint_url="http://192.168.1.128:11434/v1/chat/completions", model_id="qwen3:14b", connect_timeout_seconds=2, total_timeout_seconds=120)

    async def cancelled():
        task = asyncio.create_task(transport.execute_review(messages=({"role": "user", "content": "safe"},)))
        await asyncio.sleep(0.01)
        task.cancel()
        return await task

    result = asyncio.run(cancelled())
    assert result.status == "cancelled"
    assert closed.is_set()


def test_durable_cancellation_event_aborts_blocking_getresponse(monkeypatch) -> None:
    """A committed cancellation bridge must interrupt HTTP without task cancel."""
    from threading import Event
    from supervisor.domain.bounded_provider_transport import BoundedProviderTransport

    entered = Event()
    closed = Event()
    cancellation = Event()

    class Connection:
        sock = None
        def __init__(self, *_args, **_kwargs): pass
        def connect(self): pass
        def request(self, *_args, **_kwargs): pass
        def getresponse(self):
            import time
            entered.set()
            while not closed.is_set(): time.sleep(0.001)
            raise OSError("closed")
        def close(self): closed.set()

    monkeypatch.setattr("http.client.HTTPConnection", Connection)
    transport = BoundedProviderTransport(endpoint_url="http://192.168.1.128:11434/v1/chat/completions", model_id="qwen3:14b", connect_timeout_seconds=2, total_timeout_seconds=120)

    async def cancelled_by_durable_state():
        task = asyncio.create_task(transport.execute_review(messages=({"role": "user", "content": "safe"},), cancellation_event=cancellation))
        await asyncio.to_thread(entered.wait, 1)
        cancellation.set()
        return await task

    result = asyncio.run(cancelled_by_durable_state())
    assert result.status == "cancelled"
    assert result.cancellation_state == "cancel_requested_request_abort_recorded"
    assert closed.is_set()


def test_request_byte_cap_rejects_before_blocking_http(monkeypatch) -> None:
    from supervisor.domain.bounded_provider_transport import BoundedProviderTransport, MAX_PROVIDER_REQUEST_BYTES

    called = False
    def forbidden_connection(*_args, **_kwargs):
        nonlocal called
        called = True
        raise AssertionError("oversize request must not enter HTTP transport")

    monkeypatch.setattr("http.client.HTTPConnection", forbidden_connection)
    transport = BoundedProviderTransport(endpoint_url="http://192.168.1.128:11434/v1/chat/completions", model_id="qwen3:14b", connect_timeout_seconds=2, total_timeout_seconds=120)
    result = asyncio.run(transport.execute_review(messages=({"role": "user", "content": "x" * MAX_PROVIDER_REQUEST_BYTES},)))
    assert (result.status, result.code) == ("rejected", "request_oversize")
    assert called is False
