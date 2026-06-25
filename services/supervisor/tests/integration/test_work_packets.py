import json
import sqlite3
import sys

from fastapi.testclient import TestClient


def _reset_supervisor_modules() -> None:
    for module_name in list(sys.modules):
        if module_name == "supervisor" or module_name.startswith("supervisor."):
            sys.modules.pop(module_name, None)


def _client(tmp_path, monkeypatch, db_name: str) -> TestClient:
    db_path = (tmp_path / db_name).as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    _reset_supervisor_modules()

    from supervisor.api.main import app

    return TestClient(app)


def _db_path(tmp_path, db_name: str) -> str:
    return (tmp_path / db_name).as_posix()


def _update_work_item_fixture(db_path: str, work_item_id: str, **fields: object) -> None:
    assignments = []
    values = []
    for key, value in fields.items():
        assignments.append(f"{key} = ?")
        values.append(json.dumps(value) if key == "metadata_json" else value)
    values.append(work_item_id)
    with sqlite3.connect(db_path) as conn:
        conn.execute(f"update work_items set {', '.join(assignments)} where id = ?", values)
        conn.commit()


def _update_candidate_fixture(db_path: str, candidate_id: str, **fields: object) -> None:
    assignments = []
    values = []
    for key, value in fields.items():
        assignments.append(f"{key} = ?")
        values.append(json.dumps(value) if key == "import_metadata_json" else value)
    values.append(candidate_id)
    with sqlite3.connect(db_path) as conn:
        conn.execute(f"update candidate_work set {', '.join(assignments)} where id = ?", values)
        conn.commit()


def _update_execution_attempt_fixture(db_path: str, attempt_id: str, **fields: object) -> None:
    assignments = []
    values = []
    for key, value in fields.items():
        assignments.append(f"{key} = ?")
        values.append(json.dumps(value) if key in {"artifact_refs_json", "event_refs_json", "workspace_isolation_plan_json"} else value)
    values.append(attempt_id)
    with sqlite3.connect(db_path) as conn:
        conn.execute(f"update execution_attempts set {', '.join(assignments)} where id = ?", values)
        conn.commit()


def _create_candidate(client: TestClient, *, title: str = "Capture cockpit packet") -> dict:
    response = client.post(
        "/candidate-work",
        json={
            "title": title,
            "requestedOutcome": "Show the candidate as a Work Packet without promotion.",
            "source": "operator",
            "sourceArtifactPath": "docs/operator-note.md",
            "sourceArtifactType": "manual_note",
            "riskLevel": "medium",
            "priority": "high",
            "sortOrder": 1,
        },
    )
    assert response.status_code == 200
    return response.json()["data"]


def _create_work_item(client: TestClient, *, title: str = "Direct active packet") -> dict:
    response = client.post(
        "/work-items",
        json={
            "title": title,
            "requestedOutcome": "Assemble a Work Packet from direct active work.",
            "source": "pytest",
            "riskLevel": "low",
            "metadata": {
                "sourceArtifactPath": "docs/direct-work.md",
                "candidatePriority": "urgent",
                "verificationSummary": "pytest fixture evidence only",
            },
        },
    )
    assert response.status_code == 200
    return response.json()["data"]


def test_work_packets_include_candidate_only_work_item_only_combined_and_dangling_promoted_packets(tmp_path, monkeypatch) -> None:
    db_name = "work-packets.db"
    db_path = _db_path(tmp_path, db_name)
    with _client(tmp_path, monkeypatch, db_name) as client:
        candidate_only = _create_candidate(client)
        dangling_promoted_candidate = _create_candidate(client, title="Dangling promoted cockpit packet")
        direct_work_item = _create_work_item(client)
        promoted_candidate = _create_candidate(client, title="Promoted cockpit packet")
        approved = client.patch(f"/candidate-work/{promoted_candidate['id']}", json={"status": "approved"})
        assert approved.status_code == 200
        promoted = client.post(f"/candidate-work/{promoted_candidate['id']}/promote")
        assert promoted.status_code == 200
        combined = promoted.json()["data"]
        combined_work_item = combined["workItem"]
        _update_candidate_fixture(
            db_path,
            dangling_promoted_candidate["id"],
            status="approved",
            promoted_work_item_id="missing-work-item-id",
        )

        packets_response = client.get("/work-packets")
        assert packets_response.status_code == 200
        packets = packets_response.json()["data"]

        packet_ids = {packet["packetId"] for packet in packets}
        assert packet_ids == {
            f"candidate_work:{candidate_only['id']}",
            f"candidate_work:{dangling_promoted_candidate['id']}",
            f"work_item:{direct_work_item['id']}",
            f"work_item:{combined_work_item['id']}",
        }

        candidate_packet = next(packet for packet in packets if packet["packetId"] == f"candidate_work:{candidate_only['id']}")
        assert candidate_packet["candidateWork"]["id"] == candidate_only["id"]
        assert candidate_packet["workItem"] is None
        assert candidate_packet["taskPacket"] is None
        assert candidate_packet["routingPreview"] is None
        assert candidate_packet["executionAttempts"] == []
        assert candidate_packet["currentStage"] == "capture"
        assert candidate_packet["currentOwner"] == "kendall"
        assert candidate_packet["status"] == "waiting"
        assert candidate_packet["riskLevel"] == "medium"
        assert candidate_packet["priority"] == "high"
        assert candidate_packet["routeSummary"]["recommendation"] == "not_available"
        assert candidate_packet["routeSummary"]["confidenceScore"] == 0
        assert candidate_packet["routeSummary"]["reasonCodes"]
        assert candidate_packet["reviewSummaries"][0]["status"] == "not_applicable"
        assert candidate_packet["sourceRefs"][0]["sourceType"] == "candidate_work"
        assert candidate_packet["sourceRefs"][0]["accessState"] == "allowed"
        assert candidate_packet["artifactRefs"][0]["artifactType"] == "plan"
        assert candidate_packet["artifactRefs"][0]["pathOrUrl"] == "docs/operator-note.md"
        assert candidate_packet["humanGateActions"] == []
        assert candidate_packet["laneCards"] == []
        assert candidate_packet["memoryProposals"] == []
        assert candidate_packet["recoveryActions"] == []

        direct_packet = next(packet for packet in packets if packet["packetId"] == f"work_item:{direct_work_item['id']}")
        assert direct_packet["candidateWork"] is None
        assert direct_packet["workItem"]["id"] == direct_work_item["id"]
        assert direct_packet["priority"] == "urgent"
        assert direct_packet["sourceRefs"][0]["sourceType"] == "work_item"
        assert direct_packet["sourceRefs"][0]["accessState"] == "allowed"

        combined_packet = next(packet for packet in packets if packet["packetId"] == f"work_item:{combined_work_item['id']}")
        assert combined_packet["candidateWork"]["id"] == promoted_candidate["id"]
        assert combined_packet["workItem"]["id"] == combined_work_item["id"]
        assert {ref["sourceType"] for ref in combined_packet["sourceRefs"]} == {"candidate_work", "work_item"}

        dangling_packet = next(packet for packet in packets if packet["packetId"] == f"candidate_work:{dangling_promoted_candidate['id']}")
        assert dangling_packet["candidateWork"]["id"] == dangling_promoted_candidate["id"]
        assert dangling_packet["workItem"] is None
        assert dangling_packet["currentStage"] == "capture"
        assert dangling_packet["currentOwner"] == "kendall"
        assert dangling_packet["status"] == "waiting"
        assert "candidate.promoted_missing_work_item" in dangling_packet["routeSummary"]["reasonCodes"]

        single_response = client.get(f"/work-packets/work_item:{combined_work_item['id']}")
        assert single_response.status_code == 200
        assert single_response.json()["data"]["packetId"] == f"work_item:{combined_work_item['id']}"

        candidate_lookup_response = client.get(f"/work-packets/candidate_work:{promoted_candidate['id']}")
        assert candidate_lookup_response.status_code == 200
        assert candidate_lookup_response.json()["data"]["packetId"] == f"work_item:{combined_work_item['id']}"

        missing_response = client.get("/work-packets/work_item:not-found")
        assert missing_response.status_code == 404
        assert missing_response.json()["detail"]["error"]["code"] == "work_packet_not_found"

        assert client.post("/work-packets", json={}).status_code == 405


def test_work_packet_assembles_route_task_attempt_evidence_and_recovery_metadata(tmp_path, monkeypatch) -> None:
    db_name = "work-packet-attempt.db"
    db_path = _db_path(tmp_path, db_name)
    with _client(tmp_path, monkeypatch, db_name) as client:
        work_item = _create_work_item(client, title="Failed utility packet")

        preview_response = client.get(f"/work-items/{work_item['id']}/routing-preview?taskKind=path_scope_check")
        assert preview_response.status_code == 200

        task_packet_response = client.get(f"/work-items/{work_item['id']}/task-packet-preview")
        assert task_packet_response.status_code == 200

        attempt_response = client.post(
            f"/work-items/{work_item['id']}/execution-attempts",
            json={"taskKind": "path_scope_check", "actorLabel": "Operator"},
        )
        assert attempt_response.status_code == 200
        attempt = attempt_response.json()["data"]
        failed_response = client.post(
            f"/work-items/{work_item['id']}/execution-attempts/{attempt['attemptId']}/lifecycle",
            json={"status": "failed", "reason": "Fixture failure for recovery drawer."},
        )
        assert failed_response.status_code == 200
        _update_execution_attempt_fixture(
            db_path,
            attempt["attemptId"],
            artifact_refs_json=[
                {"artifactType": "task_packet_v0", "taskKind": "path_scope_check", "sourceArtifactPath": "docs/direct-work.md"},
                {"artifactType": "missing_fixture"},
            ],
        )

        before_attempts = client.get(f"/work-items/{work_item['id']}/execution-attempts").json()["data"]
        before_events = client.get(f"/work-items/{work_item['id']}/events").json()["data"]

        packets_response = client.get("/work-packets")
        assert packets_response.status_code == 200

        packet_response = client.get(f"/work-packets/work_item:{work_item['id']}")
        assert packet_response.status_code == 200
        packet = packet_response.json()["data"]

        assert packet["taskPacket"]["workItemId"] == work_item["id"]
        assert packet["routingPreview"]["decision"]["selectedLane"] == "utility"
        assert packet["routeSummary"]["recommendation"] == "utility"
        assert packet["routeSummary"]["confidenceScore"] > 0
        assert "task.deterministic_check" in packet["routeSummary"]["reasonCodes"]
        assert packet["currentStage"] == "execute"
        assert packet["currentOwner"] == "blocked"
        assert packet["status"] == "failed"
        assert len(packet["executionAttempts"]) == 1
        attempt_summary = packet["executionAttempts"][0]
        assert attempt_summary["attemptId"] == attempt["attemptId"]
        assert attempt_summary["workItemId"] == work_item["id"]
        assert attempt_summary["routeDecisionId"] == attempt["routeDecisionId"]
        assert attempt_summary["lane"] == "utility"
        assert attempt_summary["workerId"] == "utility.internal"
        assert attempt_summary["status"] == "failed"
        assert attempt_summary["failureReason"] == "Fixture failure for recovery drawer."
        assert attempt_summary["evidenceRefs"]
        assert attempt_summary["artifactRefs"]
        assert all("workspaceIsolationPlan" not in summary for summary in packet["executionAttempts"])
        assert any(ref["evidenceType"] == "attempt" for ref in packet["evidenceRefs"])
        attempt_artifacts = [ref for ref in packet["artifactRefs"] if ref["refId"].startswith(f"artifact:attempt:{attempt['attemptId']}")]
        assert attempt_artifacts
        assert attempt_artifacts[0]["artifactType"] == "fixture"
        assert attempt_artifacts[0]["pathOrUrl"] == "docs/direct-work.md"
        assert any(ref["status"] == "missing" and ref["label"] == "missing_fixture" for ref in attempt_artifacts)
        assert packet["laneCards"][0]["laneType"] == "utility"
        assert packet["laneCards"][0]["status"] == "blocked"
        assert packet["recoveryActions"]
        assert packet["recoveryActions"][0]["actionType"] == "retry_smaller"

        assert client.get(f"/work-items/{work_item['id']}/execution-attempts").json()["data"] == before_attempts
        assert client.get(f"/work-items/{work_item['id']}/events").json()["data"] == before_events


def test_work_packet_matches_candidate_from_work_item_metadata_without_mutation(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "work-packet-metadata-link.db") as client:
        candidate = _create_candidate(client, title="Metadata linked candidate")
        work_item_response = client.post(
            "/work-items",
            json={
                "title": "Metadata linked active work",
                "requestedOutcome": "Combine using Work Item metadata candidateWorkId.",
                "source": "pytest",
                "riskLevel": "medium",
                "metadata": {
                    "candidateWorkId": candidate["id"],
                    "candidatePriority": "high",
                    "sourceArtifactPath": "docs/metadata-linked.md",
                },
            },
        )
        assert work_item_response.status_code == 200
        work_item = work_item_response.json()["data"]

        before_candidates = client.get("/candidate-work").json()["data"]
        before_work_items = client.get("/work-items").json()["data"]

        packets_response = client.get("/work-packets")
        assert packets_response.status_code == 200
        packets = packets_response.json()["data"]
        packet_ids = {packet["packetId"] for packet in packets}
        assert packet_ids == {f"work_item:{work_item['id']}"}

        packet = packets[0]
        assert packet["candidateWork"]["id"] == candidate["id"]
        assert packet["workItem"]["id"] == work_item["id"]
        assert {ref["sourceType"] for ref in packet["sourceRefs"]} == {"candidate_work", "work_item"}

        assert client.get("/candidate-work").json()["data"] == before_candidates
        assert client.get("/work-items").json()["data"] == before_work_items


def test_work_packets_cover_blocked_and_done_delivery_aggregate_states(tmp_path, monkeypatch) -> None:
    db_name = "work-packet-terminal-states.db"
    db_path = _db_path(tmp_path, db_name)
    with _client(tmp_path, monkeypatch, db_name) as client:
        blocked_item = _create_work_item(client, title="Blocked aggregate packet")
        done_item_response = client.post(
            "/work-items",
            json={
                "title": "Done delivery aggregate packet",
                "requestedOutcome": "Show delivery evidence in the Work Packet aggregate.",
                "source": "pytest",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "sourceArtifactPath": "docs/done-delivery.md",
                    "pullRequestUrl": "https://github.com/example/repo/pull/42",
                    "pullRequestStatus": "ready",
                    "ciStatus": "passed",
                    "mergeStatus": "ready",
                },
            },
        )
        assert done_item_response.status_code == 200
        done_item = done_item_response.json()["data"]

        _update_work_item_fixture(
            db_path,
            blocked_item["id"],
            state="blocked",
            blocked_reason="Fixture blocker for coverage.",
            status_summary="Blocked by fixture.",
            next_step="Resolve fixture blocker.",
            metadata_json={
                "sourceArtifactPath": "docs/direct-work.md",
                "workPacketSourceRefs": [
                    {
                        "refId": "fixture:source:stale",
                        "sourceType": "obsidian",
                        "label": "Stale Obsidian note",
                        "pathOrUrl": "obsidian://Kendall/Stale",
                        "freshness": "stale",
                        "accessState": "allowed",
                    },
                    {
                        "refId": "fixture:source:missing",
                        "sourceType": "github",
                        "label": "Missing GitHub evidence",
                        "freshness": "unknown",
                        "accessState": "missing",
                    },
                    {
                        "refId": "fixture:source:excluded",
                        "sourceType": "llm_wiki",
                        "label": "Excluded wiki source",
                        "pathOrUrl": "https://example.invalid/raw-source",
                        "freshness": "unknown",
                        "accessState": "excluded",
                    },
                    {
                        "refId": "fixture:source:blocked",
                        "sourceType": "research",
                        "label": "Blocked research source",
                        "freshness": "unknown",
                        "accessState": "blocked",
                    },
                    {
                        "refId": "fixture:source:malformed-type",
                        "sourceType": "private_dump",
                        "label": "Unsafe private dump",
                        "pathOrUrl": "file:///private/raw-source.md",
                        "freshness": "fresh",
                        "accessState": "allowed",
                    },
                    {
                        "refId": "fixture:source:unavailable",
                        "sourceType": "obsidian",
                        "label": "Unavailable Obsidian source",
                        "pathOrUrl": "obsidian://Kendall/Missing",
                        "freshness": "fresh",
                        "accessState": "unavailable",
                    },
                    {
                        "refId": "fixture:source:missing-state",
                        "sourceType": "research",
                        "label": "Missing state research source",
                    },
                    "not-a-source-ref",
                ],
            },
        )
        _update_work_item_fixture(
            db_path,
            done_item["id"],
            state="done",
            status_summary="Done with delivery readiness evidence.",
            next_step=None,
        )

        packets_response = client.get("/work-packets")
        assert packets_response.status_code == 200
        packets = packets_response.json()["data"]
        blocked_packet = next(packet for packet in packets if packet["packetId"] == f"work_item:{blocked_item['id']}")
        done_packet = next(packet for packet in packets if packet["packetId"] == f"work_item:{done_item['id']}")

        assert blocked_packet["currentStage"] == "human_gate"
        assert blocked_packet["currentOwner"] == "blocked"
        assert blocked_packet["status"] == "blocked"
        assert blocked_packet["recoveryActions"][0]["actionType"] == "retry_smaller"
        blocked_source_refs = {ref["refId"]: ref for ref in blocked_packet["sourceRefs"]}
        assert blocked_source_refs["fixture:source:stale"]["freshness"] == "stale"
        assert blocked_source_refs["fixture:source:missing"]["accessState"] == "missing"
        assert blocked_source_refs["fixture:source:excluded"]["accessState"] == "excluded"
        assert blocked_source_refs["fixture:source:excluded"]["pathOrUrl"] is None
        assert blocked_source_refs["fixture:source:blocked"]["accessState"] == "blocked"
        assert blocked_source_refs["fixture:source:malformed-type"]["sourceType"] == "manual"
        assert blocked_source_refs["fixture:source:malformed-type"]["accessState"] == "blocked"
        assert "invalid source type" in blocked_source_refs["fixture:source:malformed-type"]["label"]
        assert blocked_source_refs["fixture:source:malformed-type"]["pathOrUrl"] is None
        assert blocked_source_refs["fixture:source:unavailable"]["sourceType"] == "obsidian"
        assert blocked_source_refs["fixture:source:unavailable"]["accessState"] == "missing"
        assert "invalid access state" in blocked_source_refs["fixture:source:unavailable"]["label"]
        assert blocked_source_refs["fixture:source:unavailable"]["pathOrUrl"] is None
        assert blocked_source_refs["fixture:source:missing-state"]["accessState"] == "blocked"
        assert "invalid access state" in blocked_source_refs["fixture:source:missing-state"]["label"]
        assert blocked_source_refs["metadata_source:7"]["sourceType"] == "manual"
        assert blocked_source_refs["metadata_source:7"]["accessState"] == "blocked"
        assert "malformed source ref" in blocked_source_refs["metadata_source:7"]["label"]
        alpha_status = blocked_packet["alphaMemorySourceStatus"]
        assert alpha_status["authorityFamily"] == "memory-writeback-and-source-mutation"
        assert alpha_status["operationMode"] == "dry_run"
        assert alpha_status["decisionState"] == "blocked"
        assert alpha_status["retentionClass"] == "metadata_only"
        assert alpha_status["canonicalMutationAllowed"] is False
        assert alpha_status["sourceMutationAllowed"] is False
        assert alpha_status["providerCallsAllowed"] is False
        assert alpha_status["workerLaunchAllowed"] is False
        assert alpha_status["githubCallsAllowed"] is False
        assert alpha_status["networkEgressAllowed"] is False
        assert alpha_status["sourceRefs"]
        assert "fixture:source:malformed-type" in alpha_status["sourceRefs"]
        assert "fixture:source:unavailable" in alpha_status["sourceRefs"]
        assert "approval_metadata.missing" in alpha_status["blockedReasons"]
        assert "source_ref.invalid_or_blocked.fixture:source:malformed-type" in alpha_status["blockedReasons"]
        assert "source_ref.invalid_or_blocked.fixture:source:unavailable" in alpha_status["blockedReasons"]
        assert "source_ref.stale.fixture:source:stale" in alpha_status["blockedReasons"]
        assert alpha_status["backupPath"] == "not_authorized_for_alpha_status"
        assert alpha_status["rollbackPath"] == "no_mutation_performed"
        assert "Review blocked source refs" in alpha_status["recoveryOptions"]
        assert "Provide explicit approval metadata" in alpha_status["recoveryOptions"]
        assert alpha_status["targetMetadata"]["targetKind"] == "draft_or_quarantine_preview"
        assert alpha_status["targetMetadata"]["canonicalMutationAllowed"] is False
        assert alpha_status["auditEventSummary"].startswith("Alpha memory/source dry-run status")

        assert done_packet["currentStage"] == "deliver"
        assert done_packet["currentOwner"] == "github"
        assert done_packet["status"] == "complete"
        assert any(ref["evidenceType"] == "gate" and ref["refId"] == f"delivery:{done_item['id']}" for ref in done_packet["evidenceRefs"])
        assert any(
            ref["artifactType"] == "pull_request" and ref["pathOrUrl"] == "https://github.com/example/repo/pull/42"
            for ref in done_packet["artifactRefs"]
        )
