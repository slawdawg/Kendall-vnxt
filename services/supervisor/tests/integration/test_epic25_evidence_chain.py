import copy
import json
import socket
import sys
import threading
import time
import urllib.request
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError

import uvicorn
import pytest
from fastapi.testclient import TestClient


SLOTS = ("readiness", "canary", "ramp", "recovery", "hardening", "decision")
SCHEMAS = {
    "readiness": "pipeline-operational-readiness-contract/v0",
    "canary": "pipeline-one-worker-live-canary/v0",
    "ramp": "pipeline-live-capacity-ramp/v0",
    "recovery": "pipeline-resilience-recovery-validation/v0",
    "hardening": "pipeline-operational-hardening-runbooks/v0",
    "decision": "pipeline-production-readiness-decision/v0",
}
GATE_FAMILIES = ("security", "retention", "rollback", "runbook", "telemetry", "recovery")
TARGET_REVISION = "a" * 40


def _reset_supervisor_modules() -> None:
    for module_name in list(sys.modules):
        if module_name == "supervisor" or module_name.startswith("supervisor."):
            sys.modules.pop(module_name, None)


def _configure(tmp_path, monkeypatch, db_name: str, *, source_revision: str | None = TARGET_REVISION) -> None:
    db_path = (tmp_path / db_name).as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    if source_revision is None:
        monkeypatch.delenv("SUPERVISOR_PIPELINE_EPIC_25_SOURCE_REVISION", raising=False)
    else:
        monkeypatch.setenv("SUPERVISOR_PIPELINE_EPIC_25_SOURCE_REVISION", source_revision)
    _reset_supervisor_modules()


def _client(tmp_path, monkeypatch, db_name: str, *, source_revision: str | None = TARGET_REVISION) -> TestClient:
    _configure(tmp_path, monkeypatch, db_name, source_revision=source_revision)
    from supervisor.api.main import app

    return TestClient(app, client=("127.0.0.1", 50000))


def _remote_client(tmp_path, monkeypatch, db_name: str) -> TestClient:
    _configure(tmp_path, monkeypatch, db_name)
    from supervisor.api.main import app

    return TestClient(app, client=("203.0.113.10", 50000))


def _free_loopback_port() -> int:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.bind(("127.0.0.1", 0))
            return int(listener.getsockname()[1])
    except PermissionError:
        pytest.skip("sandbox blocks loopback socket creation; rerun this exact suite outside the sandbox")


@contextmanager
def _running_http_supervisor(tmp_path, monkeypatch, db_name: str):
    _configure(tmp_path, monkeypatch, db_name)
    from supervisor.api import main

    server = uvicorn.Server(
        uvicorn.Config(main.app, host="127.0.0.1", port=_free_loopback_port(), log_level="error", access_log=False, lifespan="on")
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 10
    while not server.started and thread.is_alive() and time.monotonic() < deadline:
        time.sleep(0.02)
    assert server.started
    try:
        yield f"http://127.0.0.1:{server.config.port}"
    finally:
        server.should_exit = True
        thread.join(timeout=10)
        assert not thread.is_alive()


def _request(base_url: str, path: str, method: str, payload: dict | None = None) -> tuple[int, dict]:
    request = urllib.request.Request(
        f"{base_url}{path}",
        data=json.dumps(payload).encode("utf8") if payload is not None else None,
        headers={"accept": "application/json", **({"content-type": "application/json"} if payload is not None else {})},
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310 - fixed loopback URL
            return response.status, json.loads(response.read().decode("utf8"))
    except HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf8"))


def _create_packet(
    client: TestClient,
    packet_id: str = "packet-epic-25",
    evidence_refs: list[str] | None = None,
) -> None:
    response = client.post(
        "/pipeline-control-plane/work-packets",
        json={
            "packetId": packet_id,
            "title": "Epic 25 evidence chain",
            "sourceRef": {"refId": "repo-doc:epic-25", "sourceType": "repo_doc", "pathOrUrl": "docs/workflows/epic-25-retrospective-and-next-authority.md"},
            "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
            "idempotencyKey": f"create-{packet_id}",
            "evidenceRefs": evidence_refs or ["evidence:epic-25-source", f"source:revision-{TARGET_REVISION}"],
        },
    )
    assert response.status_code == 200, response.text


def _attestation(slot: str, packet_id: str, now: datetime) -> dict:
    return {
        "schemaVersion": "pipeline-observed-evidence-attestation/v0",
        "attestationId": f"attestation-{slot}",
        "evidenceClass": "live_observed",
        "observer": {"observerType": "independent_runtime", "observerId": "observer-loopback"},
        "subject": {"packetSchemaVersion": SCHEMAS[slot], "targetRef": packet_id},
        "receipt": {
            "receiptId": f"receipt-{slot}",
            "observedAt": (now - timedelta(seconds=2)).isoformat(),
            "issuedAt": (now - timedelta(seconds=1)).isoformat(),
            "expiresAt": (now + timedelta(minutes=4)).isoformat(),
            "evidenceDigestSha256": f"sha256:{'a' * 64}",
            "sourceRefs": ["prd:epic-25"],
            "evidenceRefs": [f"evidence:{slot}"],
        },
        "metadataOnly": True,
        "rawPayloadRetained": False,
    }


def _chain(
    evidence_class: str = "integrated_local",
    packet_id: str = "packet-epic-25",
    now: datetime | None = None,
    ttl: timedelta = timedelta(minutes=4),
    policy_ttl: timedelta | None = None,
) -> dict:
    now = now or datetime.now(timezone.utc).replace(microsecond=0)
    expires_at = (now + ttl).isoformat()
    policy_expires_at = (now + (policy_ttl or ttl)).isoformat()
    policy_profile = {
        "schemaVersion": "pipeline-epic-25-policy-profile/v0",
        "targetRevision": TARGET_REVISION,
        "checkedAt": now.isoformat(),
        "expiresAt": policy_expires_at,
        "qualityGates": [
            {
                "family": family,
                "requirement": "not_applicable" if family == "runbook" else "required",
                "state": "not_applicable" if family == "runbook" else "pass",
                "typedReason": None,
                "nextSafeAction": "No action is required." if family == "runbook" else "Preserve passing evidence and continue review.",
                "notApplicableReason": "Runbook publication is outside this validation target." if family == "runbook" else None,
                "targetRevision": TARGET_REVISION,
                "checkedAt": now.isoformat(),
                "expiresAt": policy_expires_at,
                "evidenceRefs": [f"evidence:{family}-gate"],
            }
            for family in GATE_FAMILIES
        ],
        "retentionPolicy": {
            "sourceOwner": "epic-25-source-owner",
            "toolOwner": "supervisor",
            "disposition": "metadata_only",
            "redactionState": "verified_redacted",
            "expiresAt": (now + timedelta(days=30)).isoformat(),
            "retentionPeriodDays": 30,
            "disposalAction": "delete_metadata",
            "verificationStatus": "verified",
            "policyReason": "Retain bounded validation metadata for audit and then dispose it.",
            "evidenceRefs": ["evidence:retention-policy"],
            "metadataOnly": True,
            "rawPayloadRetained": False,
        },
        "executionAllowed": False,
        "providerCallsAllowed": False,
        "mutationAllowed": False,
        "metadataOnly": True,
        "rawPayloadRetained": False,
    }
    packets = {}
    predecessor = None
    for slot in SLOTS:
        evidence_packet_id = f"epic-25-{slot}-packet"
        if slot == "readiness":
            outcome = "go" if evidence_class == "live_observed" else "no_go"
        elif slot == "decision":
            outcome = "go" if evidence_class == "live_observed" else "hold"
        else:
            outcome = "pass" if evidence_class == "live_observed" else "hold"
        attestation = _attestation(slot, evidence_packet_id, now) if evidence_class == "live_observed" else None
        if slot == "readiness":
            details = {
                "kind": slot, "backendTruth": "live" if evidence_class == "live_observed" else "dry_run", "authorityState": "allowed" if evidence_class == "live_observed" else "blocked",
                "gateCount": 10, "thresholdsComplete": evidence_class == "live_observed", "telemetryReady": evidence_class == "live_observed",
                "rollbackReady": True, "recoveryReady": True, "configurationValid": True,
            }
        elif slot == "canary":
            details = {
                "kind": slot, "workerCount": 1, "backendTruth": "live" if evidence_class == "live_observed" else "dry_run",
                "leaseState": "pass" if evidence_class == "live_observed" else "blocked", "checkpointState": "pass" if evidence_class == "live_observed" else "blocked",
                "measurementsComplete": evidence_class == "live_observed", "canaryAuthorityProven": evidence_class == "live_observed", "rampAllowed": False,
            }
        elif slot == "ramp":
            details = {
                "kind": slot, "canaryPacketId": packets["canary"]["packetId"], "canaryOutcome": packets["canary"]["outcome"],
                "stageWorkerCounts": [1, 2, 4, 6], "stageOutcomes": [outcome] * 4, "scaleEvidenceReady": evidence_class == "live_observed",
            }
        elif slot == "recovery":
            details = {
                "kind": slot, "rampPacketId": packets["ramp"]["packetId"], "predecessorOutcome": packets["ramp"]["outcome"], "drillCount": 1,
                "allDrillsPassed": evidence_class == "live_observed", "idempotencyProven": evidence_class == "live_observed", "silentRetryObserved": False,
                "reliabilityEvidenceReady": evidence_class == "live_observed",
            }
        elif slot == "hardening":
            details = {
                "kind": slot, "recoveryPacketId": packets["recovery"]["packetId"], "predecessorOutcome": packets["recovery"]["outcome"], "domainCount": 1,
                "unresolvedHighRiskGap": evidence_class != "live_observed", "readinessHandoffReady": evidence_class == "live_observed",
            }
        else:
            details = {
                "kind": slot,
                "predecessorPacketIds": {name: packets[name]["packetId"] for name in ("canary", "ramp", "recovery", "hardening")},
                "predecessorOutcomes": {name: packets[name]["outcome"] for name in ("canary", "ramp", "recovery", "hardening")},
                "authorityReady": evidence_class == "live_observed", "simulatedEvidence": evidence_class != "live_observed",
                "staleEvidence": False, "fixtureEvidence": evidence_class == "fixture",
            }
        packets[slot] = {
            "slot": slot,
            "packetId": evidence_packet_id,
            "packetSchemaVersion": SCHEMAS[slot],
            "predecessorPacketId": predecessor,
            "evidenceClass": evidence_class,
            "outcome": outcome,
            "sourceRefs": ["prd:epic-25"],
            "evidenceRefs": [f"evidence:{slot}"],
            "checkedAt": now.isoformat(),
            "expiresAt": expires_at,
            "observedEvidenceAttestation": attestation,
            "details": details,
            "metadataOnly": True,
            "rawPayloadRetained": False,
        }
        predecessor = evidence_packet_id
    return {
        "schemaVersion": "pipeline-epic-25-evidence-chain/v1",
        "authoritativePacketId": packet_id,
        "evidenceClass": evidence_class,
        "policyProfile": policy_profile,
        "packets": packets,
        "checkedAt": now.isoformat(),
        "expiresAt": expires_at,
        "executionAllowed": False,
        "providerCallsAllowed": False,
        "mutationAllowed": False,
        "metadataOnly": True,
        "rawPayloadRetained": False,
    }


def _ingest_payload(chain: dict, expected_digest: str | None = None, *, actor_id: str = "pipeline-operator") -> dict:
    return {
        "requestedBy": {"actorType": "operator", "actorId": actor_id, "actorLabel": "Pipeline operator"},
        "expectedCurrentDigestSha256": expected_digest,
        "evidenceChain": chain,
    }


def _with_equivalent_offset_timestamps(value):
    if isinstance(value, dict):
        return {key: _with_equivalent_offset_timestamps(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_with_equivalent_offset_timestamps(item) for item in value]
    if isinstance(value, str) and (value.endswith("+00:00") or value.endswith("Z")):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value
        return parsed.astimezone(timezone(timedelta(hours=1))).isoformat()
    return value


def test_integrated_local_chain_round_trips_over_loopback_and_restart(tmp_path, monkeypatch) -> None:
    db_name = "epic-25-loopback-restart.db"
    chain = _chain()
    with _running_http_supervisor(tmp_path, monkeypatch, db_name) as base_url:
        status, created = _request(
            base_url,
            "/pipeline-control-plane/work-packets",
            "POST",
            {
                "packetId": "packet-epic-25",
                "title": "Epic 25 evidence chain",
                "sourceRef": {"refId": "repo-doc:epic-25", "sourceType": "repo_doc", "pathOrUrl": "docs/workflows/epic-25-retrospective-and-next-authority.md"},
                "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                "idempotencyKey": "create-packet-epic-25",
                "evidenceRefs": ["evidence:epic-25-source", f"source:revision-{TARGET_REVISION}"],
            },
        )
        assert status == 200, created
        status, posted = _request(base_url, "/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain", "POST", _ingest_payload(chain))
        assert status == 200, posted
        posted_chain = posted["data"]
        assert posted_chain["packets"]["decision"]["outcome"] == "hold"
        assert posted_chain["executionAllowed"] is False
        status, fetched = _request(base_url, "/pipeline-control-plane/work-packets/packet-epic-25", "GET")
        assert status == 200
        assert fetched["data"]["evidenceChain"] == posted_chain

    with _client(tmp_path, monkeypatch, db_name) as restarted_client:
        restarted = restarted_client.get("/pipeline-control-plane/work-packets/packet-epic-25")
        assert restarted.status_code == 200
        assert restarted.json()["data"]["evidenceChain"] == posted_chain


def test_caller_forged_live_chain_is_unavailable_and_cannot_create_go(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "epic-25-live.db") as client:
        _create_packet(client)
        live_chain = _chain("live_observed")
        rejected = client.post("/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain", json=_ingest_payload(live_chain))
        assert rejected.status_code == 400, rejected.text
        assert "server-issued" in rejected.text

        missing_attestation = copy.deepcopy(live_chain)
        missing_attestation["packets"]["ramp"]["observedEvidenceAttestation"] = None
        assert client.post("/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain", json=_ingest_payload(missing_attestation)).status_code == 422

        mismatched_subject = copy.deepcopy(live_chain)
        mismatched_subject["packets"]["recovery"]["observedEvidenceAttestation"]["subject"]["targetRef"] = "epic-25-other-packet"
        assert client.post("/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain", json=_ingest_payload(mismatched_subject)).status_code == 422

        mismatched_predecessor = copy.deepcopy(live_chain)
        mismatched_predecessor["packets"]["hardening"]["predecessorPacketId"] = "epic-25-other-packet"
        assert client.post("/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain", json=_ingest_payload(mismatched_predecessor)).status_code == 422

        mismatched_schema = copy.deepcopy(live_chain)
        mismatched_schema["packets"]["ramp"]["packetSchemaVersion"] = SCHEMAS["canary"]
        assert client.post("/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain", json=_ingest_payload(mismatched_schema)).status_code == 422

        mismatched_refs = copy.deepcopy(live_chain)
        mismatched_refs["packets"]["canary"]["observedEvidenceAttestation"]["receipt"]["evidenceRefs"] = ["evidence:unrelated"]
        assert client.post("/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain", json=_ingest_payload(mismatched_refs)).status_code == 422

        missing_live_predecessor = copy.deepcopy(live_chain)
        missing_live_predecessor["packets"]["recovery"]["outcome"] = "hold"
        assert client.post("/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain", json=_ingest_payload(missing_live_predecessor)).status_code == 422


def test_fixture_chain_is_accepted_only_as_metadata_only_hold_without_live_attestation(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "epic-25-fixture.db") as client:
        _create_packet(client)
        fixture = _chain("fixture")
        accepted = client.post("/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain", json=_ingest_payload(fixture))
        assert accepted.status_code == 200, accepted.text
        assert accepted.json()["data"]["packets"]["decision"]["outcome"] == "hold"
        assert all(packet["observedEvidenceAttestation"] is None for packet in accepted.json()["data"]["packets"].values())

        forged_live_attestation = copy.deepcopy(fixture)
        forged_live_attestation["packets"]["canary"]["observedEvidenceAttestation"] = _attestation(
            "canary", fixture["packets"]["canary"]["packetId"], datetime.now(timezone.utc).replace(microsecond=0)
        )
        assert client.post("/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain", json=_ingest_payload(forged_live_attestation)).status_code == 422


def test_legacy_v0_chain_reads_as_stale_upgrade_required_and_upgrades_by_digest(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "epic-25-legacy-upgrade.db") as client:
        _create_packet(client)
        base_time = datetime.now(timezone.utc).replace(microsecond=0)
        legacy = _chain(now=base_time)
        legacy["schemaVersion"] = "pipeline-epic-25-evidence-chain/v0"
        del legacy["policyProfile"]

        accepted = client.post(
            "/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain",
            json=_ingest_payload(legacy),
        )
        assert accepted.status_code == 200, accepted.text
        legacy_read = accepted.json()["data"]
        assert legacy_read["freshnessState"] == "stale"
        assert legacy_read["effectiveDecision"] == "hold"
        assert legacy_read["typedBlockers"] == ["policy_profile_upgrade_required"]
        assert "policyProfile" not in legacy_read

        upgraded = _chain(now=base_time + timedelta(seconds=10))
        upgraded_response = client.post(
            "/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain",
            json=_ingest_payload(upgraded, legacy_read["chainDigestSha256"]),
        )
        assert upgraded_response.status_code == 200, upgraded_response.text
        assert upgraded_response.json()["data"]["schemaVersion"] == "pipeline-epic-25-evidence-chain/v1"
        assert "policy_profile_upgrade_required" not in upgraded_response.json()["data"]["typedBlockers"]


def test_v1_target_revision_must_match_authoritative_packet_source_revision(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "epic-25-revision-binding.db") as client:
        _create_packet(client)
        unrelated = _chain()
        unrelated["policyProfile"]["targetRevision"] = "b" * 40
        for gate in unrelated["policyProfile"]["qualityGates"]:
            gate["targetRevision"] = "b" * 40
        rejected = client.post(
            "/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain",
            json=_ingest_payload(unrelated),
        )
        assert rejected.status_code == 400, rejected.text
        assert "server-owned source revision attestation" in rejected.text


def test_v1_forged_packet_created_revision_ref_cannot_authorize_arbitrary_target(tmp_path, monkeypatch) -> None:
    forged_revision = "b" * 40
    with _client(tmp_path, monkeypatch, "epic-25-forged-revision.db") as client:
        _create_packet(client, evidence_refs=[f"source:revision-{forged_revision}"])
        forged = _chain()
        forged["policyProfile"]["targetRevision"] = forged_revision
        for gate in forged["policyProfile"]["qualityGates"]:
            gate["targetRevision"] = forged_revision

        rejected = client.post(
            "/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain",
            json=_ingest_payload(forged),
        )

        assert rejected.status_code == 400, rejected.text
        assert "server-owned source revision attestation" in rejected.text


def test_v1_without_server_owned_revision_is_held_even_when_caller_ref_matches(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "epic-25-missing-revision-attestation.db", source_revision=None) as client:
        _create_packet(client)
        held = client.post(
            "/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain",
            json=_ingest_payload(_chain()),
        )

        assert held.status_code == 400, held.text
        assert "held/upgrade-required" in held.text
        assert "legacy v0" in held.text


def test_policy_profile_failures_are_retained_as_non_authorizing_readback_blockers(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "epic-25-policy-blockers.db") as client:
        _create_packet(client)
        chain = _chain()
        security_gate = next(gate for gate in chain["policyProfile"]["qualityGates"] if gate["family"] == "security")
        security_gate["state"] = "blocked"
        security_gate["typedReason"] = "safety_violation"
        security_gate["nextSafeAction"] = "Hold and inspect the failed security evidence."
        chain["policyProfile"]["retentionPolicy"]["verificationStatus"] = "pending"

        accepted = client.post(
            "/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain",
            json=_ingest_payload(chain),
        )
        assert accepted.status_code == 200, accepted.text
        assert accepted.json()["data"]["effectiveDecision"] == "hold"
        assert accepted.json()["data"]["typedBlockers"] == ["retention_policy_unverified", "quality_gate_not_passed"]


def test_runbook_not_applicable_does_not_block_but_required_failure_does(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "epic-25-runbook-semantics.db") as client:
        _create_packet(client)
        baseline = _chain()
        accepted = client.post(
            "/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain",
            json=_ingest_payload(baseline),
        )
        assert accepted.status_code == 200, accepted.text
        assert accepted.json()["data"]["typedBlockers"] == []

        replacement = _chain(now=datetime.now(timezone.utc).replace(microsecond=0) + timedelta(seconds=10))
        runbook_gate = next(gate for gate in replacement["policyProfile"]["qualityGates"] if gate["family"] == "runbook")
        runbook_gate.update(
            {
                "requirement": "required",
                "state": "fail",
                "typedReason": "runbook_gap",
                "nextSafeAction": "Hold and repair the runbook gap.",
                "notApplicableReason": None,
            }
        )
        failed = client.post(
            "/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain",
            json=_ingest_payload(replacement, accepted.json()["data"]["chainDigestSha256"]),
        )
        assert failed.status_code == 200, failed.text
        assert failed.json()["data"]["typedBlockers"] == ["quality_gate_not_passed"]
        assert failed.json()["data"]["effectiveDecision"] == "hold"


def test_policy_expiry_alone_marks_chain_readback_stale(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "epic-25-policy-expiry.db") as client:
        _create_packet(client)
        short_policy = _chain(policy_ttl=timedelta(seconds=1))
        posted = client.post(
            "/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain",
            json=_ingest_payload(short_policy),
        )
        assert posted.status_code == 200, posted.text
        assert posted.json()["data"]["freshnessState"] == "fresh"
        time.sleep(1.2)
        projected = client.get("/pipeline-control-plane/work-packets/packet-epic-25").json()["data"]["evidenceChain"]
        assert projected["freshnessState"] == "stale"
        assert projected["typedBlockers"] == ["policy_profile_stale"]
        assert projected["effectiveDecision"] == "hold"


def test_ingestion_rejects_gate_expired_now_even_when_policy_check_was_fresh(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "epic-25-gate-expiry-at-ingestion.db") as client:
        _create_packet(client)
        checked_at = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(seconds=30)
        expired_gate_chain = _chain(now=checked_at)
        telemetry_gate = next(
            gate for gate in expired_gate_chain["policyProfile"]["qualityGates"] if gate["family"] == "telemetry"
        )
        telemetry_gate["expiresAt"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()

        rejected = client.post(
            "/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain",
            json=_ingest_payload(expired_gate_chain),
        )

        assert rejected.status_code == 400, rejected.text
        assert "expired at ingestion time" in rejected.text


def test_chain_rejects_partial_unsafe_stale_mismatched_and_non_live_go_without_overwrite(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "epic-25-rejections.db") as client:
        _create_packet(client)
        valid = _chain()
        posted = client.post("/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain", json=_ingest_payload(valid))
        assert posted.status_code == 200
        stored = posted.json()["data"]

        invalid_chains = []
        partial = copy.deepcopy(valid)
        del partial["packets"]["recovery"]
        invalid_chains.append(partial)
        raw_payload = copy.deepcopy(valid)
        raw_payload["packets"]["canary"]["rawPayload"] = {"value": "must-not-store"}
        invalid_chains.append(raw_payload)
        secret = copy.deepcopy(valid)
        secret["packets"]["canary"]["evidenceRefs"] = ["evidence:secret-token-value"]
        invalid_chains.append(secret)
        executable = copy.deepcopy(valid)
        executable["packets"]["ramp"]["evidenceRefs"] = ["command:git push origin dev"]
        invalid_chains.append(executable)
        stale = copy.deepcopy(valid)
        stale["checkedAt"] = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        stale["expiresAt"] = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        invalid_chains.append(stale)
        stale_packet = copy.deepcopy(valid)
        stale_packet["packets"]["hardening"]["checkedAt"] = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        stale_packet["packets"]["hardening"]["expiresAt"] = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        invalid_chains.append(stale_packet)
        mismatched = copy.deepcopy(valid)
        mismatched["authoritativePacketId"] = "packet-other"
        invalid_chains.append(mismatched)
        non_live_go = copy.deepcopy(valid)
        non_live_go["packets"]["decision"]["outcome"] = "go"
        invalid_chains.append(non_live_go)
        missing_gate_family = copy.deepcopy(valid)
        missing_gate_family["policyProfile"]["qualityGates"] = [
            gate for gate in missing_gate_family["policyProfile"]["qualityGates"] if gate["family"] != "security"
        ]
        invalid_chains.append(missing_gate_family)
        not_applicable_without_reason = copy.deepcopy(valid)
        next(gate for gate in not_applicable_without_reason["policyProfile"]["qualityGates"] if gate["family"] == "runbook")["notApplicableReason"] = None
        invalid_chains.append(not_applicable_without_reason)
        required_gate_downgrade = copy.deepcopy(valid)
        security_gate = next(gate for gate in required_gate_downgrade["policyProfile"]["qualityGates"] if gate["family"] == "security")
        security_gate.update({"requirement": "not_applicable", "state": "not_applicable", "notApplicableReason": "Caller downgrade.", "typedReason": None})
        invalid_chains.append(required_gate_downgrade)
        stale_target = copy.deepcopy(valid)
        next(gate for gate in stale_target["policyProfile"]["qualityGates"] if gate["family"] == "telemetry")["targetRevision"] = "b" * 40
        invalid_chains.append(stale_target)
        unsafe_policy_ref = copy.deepcopy(valid)
        next(gate for gate in unsafe_policy_ref["policyProfile"]["qualityGates"] if gate["family"] == "security")["evidenceRefs"] = [
            "evidence:sk-proj-12345678901234567890"
        ]
        invalid_chains.append(unsafe_policy_ref)
        expired_retention = copy.deepcopy(valid)
        expired_retention["policyProfile"]["retentionPolicy"]["expiresAt"] = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        invalid_chains.append(expired_retention)
        missing_retention = copy.deepcopy(valid)
        del missing_retention["policyProfile"]["retentionPolicy"]
        invalid_chains.append(missing_retention)
        retained_raw_payload = copy.deepcopy(valid)
        retained_raw_payload["policyProfile"]["retentionPolicy"]["rawPayloadRetained"] = True
        invalid_chains.append(retained_raw_payload)
        executable_policy_reason = copy.deepcopy(valid)
        executable_policy_reason["policyProfile"]["retentionPolicy"]["policyReason"] = "git commit -am update"
        invalid_chains.append(executable_policy_reason)
        token_policy_reason = copy.deepcopy(valid)
        token_policy_reason["policyProfile"]["retentionPolicy"]["policyReason"] = "sk-proj-12345678901234567890"
        invalid_chains.append(token_policy_reason)
        token_not_applicable_reason = copy.deepcopy(valid)
        next(gate for gate in token_not_applicable_reason["policyProfile"]["qualityGates"] if gate["family"] == "runbook")["notApplicableReason"] = "ghp_123456789012345678901234567890123456"
        invalid_chains.append(token_not_applicable_reason)
        duplicate_gate_refs = copy.deepcopy(valid)
        next(gate for gate in duplicate_gate_refs["policyProfile"]["qualityGates"] if gate["family"] == "security")["evidenceRefs"] = ["evidence:security-gate", "evidence:security-gate"]
        invalid_chains.append(duplicate_gate_refs)
        boolean_retention_period = copy.deepcopy(valid)
        boolean_retention_period["policyProfile"]["retentionPolicy"]["retentionPeriodDays"] = True
        invalid_chains.append(boolean_retention_period)
        invalid_24_hour_timestamp = copy.deepcopy(valid)
        invalid_24_hour_timestamp["policyProfile"]["checkedAt"] = f"{valid['policyProfile']['checkedAt'][:10]}T24:00:00+00:00"
        invalid_chains.append(invalid_24_hour_timestamp)
        future_check = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(seconds=30)
        gate_stale_at_profile_check = _chain(now=future_check)
        stale_gate = next(gate for gate in gate_stale_at_profile_check["policyProfile"]["qualityGates"] if gate["family"] == "telemetry")
        stale_gate["checkedAt"] = (future_check - timedelta(seconds=30)).isoformat()
        stale_gate["expiresAt"] = (future_check - timedelta(seconds=10)).isoformat()
        invalid_chains.append(gate_stale_at_profile_check)

        for invalid in invalid_chains:
            response = client.post("/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain", json=_ingest_payload(invalid))
            assert response.status_code in {400, 422}, response.text
            fetched = client.get("/pipeline-control-plane/work-packets/packet-epic-25")
            assert fetched.status_code == 200
            assert fetched.json()["data"]["evidenceChain"] == stored

        replay = client.post("/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain", json=_ingest_payload(valid))
        assert replay.status_code == 200
        assert replay.json()["data"] == stored


def test_ingestion_requires_loopback_and_exact_server_owned_operator(tmp_path, monkeypatch) -> None:
    db_name = "epic-25-local-boundary.db"
    with _client(tmp_path, monkeypatch, db_name) as client:
        _create_packet(client)
        wrong_actor = client.post(
            "/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain",
            json=_ingest_payload(_chain(), actor_id="caller-manager"),
        )
        assert wrong_actor.status_code == 422

    with _remote_client(tmp_path, monkeypatch, db_name) as remote_client:
        remote = remote_client.post(
            "/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain",
            json=_ingest_payload(_chain()),
        )
        assert remote.status_code == 403
        assert "loopback" in remote.text


def test_realistic_secret_refs_duplicate_ids_and_slot_contract_bypasses_are_rejected(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "epic-25-secret-refs.db") as client:
        _create_packet(client)
        secret_refs = [
            "evidence:" + "sk" + "-proj-" + "12345678901234567890",
            "evidence:" + "gh" + "p_" + "123456789012345678901234567890123456",
            "evidence:" + "xox" + "b-" + "1234567890-abcdefghijklmnop",
            "evidence:" + "eyJhbGciOiJIUzI1NiJ9" + "." + "eyJzdWIiOiIxMjM0NTY3ODkwIn0" + "." + "signature1234567890",
            "evidence:" + "AK" + "IA" + "1234567890ABCDEF",
            f"evidence:{'A' * 64}",
        ]
        for secret_ref in secret_refs:
            candidate = _chain()
            candidate["packets"]["readiness"]["evidenceRefs"] = [secret_ref]
            response = client.post(
                "/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain",
                json=_ingest_payload(candidate),
            )
            assert response.status_code == 422, secret_ref

        duplicate_packet = _chain()
        duplicate_packet["packets"]["ramp"]["packetId"] = duplicate_packet["packets"]["canary"]["packetId"]
        duplicate_packet["packets"]["recovery"]["predecessorPacketId"] = duplicate_packet["packets"]["ramp"]["packetId"]
        assert client.post(
            "/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain", json=_ingest_payload(duplicate_packet)
        ).status_code == 422

        malformed_ramp = _chain()
        malformed_ramp["packets"]["ramp"]["details"]["stageWorkerCounts"] = [1, 2, 6, 8]
        assert client.post(
            "/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain", json=_ingest_payload(malformed_ramp)
        ).status_code == 422


def test_readback_revalidates_expiry_and_projects_auditable_stale_hold(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "epic-25-stale-read.db") as client:
        _create_packet(client)
        short_lived = _chain(ttl=timedelta(seconds=1))
        posted = client.post(
            "/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain", json=_ingest_payload(short_lived)
        )
        assert posted.status_code == 200, posted.text
        assert posted.json()["data"]["freshnessState"] == "fresh"
        time.sleep(1.2)
        fetched = client.get("/pipeline-control-plane/work-packets/packet-epic-25")
        projected = fetched.json()["data"]["evidenceChain"]
        assert projected["freshnessState"] == "stale"
        assert projected["effectiveDecision"] == "hold"
        assert projected["typedBlockers"] == ["evidence_chain_stale", "policy_profile_stale"]
        assert projected["packets"]["readiness"]["packetId"] == "epic-25-readiness-packet"


def test_exact_replay_is_offset_canonical_and_replacement_requires_digest_monotonic_cas(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "epic-25-cas.db") as client:
        _create_packet(client)
        base_time = datetime.now(timezone.utc).replace(microsecond=0)
        initial = _chain(now=base_time)
        created = client.post(
            "/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain", json=_ingest_payload(initial)
        )
        assert created.status_code == 200, created.text
        created_chain = created.json()["data"]
        digest = created_chain["chainDigestSha256"]
        assert created_chain["checkedAt"].endswith("Z")

        replay = client.post(
            "/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain",
            json=_ingest_payload(_with_equivalent_offset_timestamps(initial)),
        )
        assert replay.status_code == 200
        assert replay.json()["data"] == created_chain

        replacement = _chain(now=base_time + timedelta(seconds=10))
        wrong_digest = client.post(
            "/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain",
            json=_ingest_payload(replacement, f"sha256:{'0' * 64}"),
        )
        assert wrong_digest.status_code == 400
        replaced = client.post(
            "/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain",
            json=_ingest_payload(replacement, digest),
        )
        assert replaced.status_code == 200, replaced.text
        replacement_digest = replaced.json()["data"]["chainDigestSha256"]

        delayed = _chain(now=base_time + timedelta(seconds=5))
        rollback = client.post(
            "/pipeline-control-plane/work-packets/packet-epic-25/epic-25-evidence-chain",
            json=_ingest_payload(delayed, replacement_digest),
        )
        assert rollback.status_code == 400
        assert "monotonically" in rollback.text
