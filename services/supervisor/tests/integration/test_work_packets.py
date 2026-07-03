import json
import sqlite3
import sys

from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError


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


def _insert_workflow_event_fixture(
    db_path: str,
    work_item_id: str,
    *,
    event_id: str,
    event_type: str,
    summary: str,
    payload: dict,
    created_at: str = "2026-06-28 00:00:00.000000",
) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            insert into workflow_events (
                id, work_item_id, event_type, actor_type, actor_id, actor_label,
                correlation_id, summary, payload, created_at
            ) values (?, ?, ?, 'system', null, null, ?, ?, ?, ?)
            """,
            (event_id, work_item_id, event_type, f"corr-{event_id}", summary, json.dumps(payload), created_at),
        )
        conn.commit()


def _sqlite_table_columns(db_path: str, table_name: str) -> set[str]:
    with sqlite3.connect(db_path) as conn:
        return {row[1] for row in conn.execute(f"pragma table_info({table_name})").fetchall()}


def _sqlite_tables(db_path: str) -> set[str]:
    with sqlite3.connect(db_path) as conn:
        return {row[0] for row in conn.execute("select name from sqlite_master where type = 'table'").fetchall()}


def _sqlite_has_unique_index(db_path: str, table_name: str, columns: tuple[str, ...]) -> bool:
    with sqlite3.connect(db_path) as conn:
        for row in conn.execute(f"pragma index_list({table_name})").fetchall():
            index_name = row[1]
            is_unique = bool(row[2])
            if not is_unique:
                continue
            index_columns = tuple(column_row[2] for column_row in conn.execute(f"pragma index_info({index_name})").fetchall())
            if index_columns == columns:
                return True
    return False


def _write_obsidian_memory_config(tmp_path, *, profile: str = "local-folder") -> tuple[str, object, object]:
    vault_root = tmp_path / "obsidian-vault"
    backup_root = tmp_path / "obsidian-backups"
    for folder in [
        "00 Inbox",
        "01 Dashboard Queue/AI Drafts",
        "02 Customers",
        "Private",
        "Personal",
        "Journal",
        "09 Archive",
    ]:
        (vault_root / folder).mkdir(parents=True, exist_ok=True)
    config_path = tmp_path / "obsidian-memory.json"
    config_path.write_text(
        json.dumps(
            {
                "profile": profile,
                "vault": {"local_path": vault_root.as_posix()},
                "access": {
                    "read_allowlist": ["00 Inbox", "02 Customers"],
                    "excluded": ["01 Dashboard Queue", "Private", "Personal", "Journal", "09 Archive"],
                },
                "write_policy": {
                    "draft_folder": "01 Dashboard Queue/AI Drafts",
                    "require_dashboard_approval": True,
                },
                "backup": {"destination": backup_root.as_posix()},
                "sync": {"mechanism": "local-folder-manual", "health": "manual-current", "checked_at": "2026-06-26T00:00:00Z"},
            }
        ),
        encoding="utf-8",
    )
    return config_path.as_posix(), vault_root, backup_root


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
        assert candidate_packet["lifecycleState"]["source"] == "candidate_work"
        assert candidate_packet["lifecycleState"]["stage"] == "capture"
        assert candidate_packet["lifecycleState"]["owner"] == "kendall"
        assert candidate_packet["lifecycleState"]["status"] == "waiting"
        assert candidate_packet["lifecycleState"]["authoritativeRef"] == f"candidate_work:{candidate_only['id']}"
        assert candidate_packet["lifecycleState"]["derivedFromRefs"][0] == f"candidate_work:{candidate_only['id']}"
        assert candidate_packet["lifecycleState"]["transitionEventRefs"] == []
        assert candidate_packet["lifecycleState"]["latestTransitionEventRef"] is None
        assert candidate_packet["lifecycleState"]["attemptRef"] is None
        assert candidate_packet["lifecycleState"]["metadataOnly"] is True
        assert candidate_packet["lifecycleState"]["sourceMutationAllowed"] is False
        assert candidate_packet["lifecycleState"]["providerCallsAllowed"] is False
        assert candidate_packet["lifecycleState"]["workerLaunchAllowed"] is False
        assert candidate_packet["lifecycleState"]["githubMutationAllowed"] is False
        assert candidate_packet["lifecycleState"]["cleanupAllowed"] is False
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


def test_authoritative_work_packet_lifecycle_persists_current_stage_and_history_after_restart(tmp_path, monkeypatch) -> None:
    db_name = "authoritative-work-packet-lifecycle.db"
    db_path = _db_path(tmp_path, db_name)
    source_ref = {
        "refId": "prd:_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-01/prd.md",
        "sourceType": "prd",
        "pathOrUrl": "_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-01/prd.md",
        "title": "Backend-backed pipeline control plane",
    }

    with _client(tmp_path, monkeypatch, db_name) as client:
        create_response = client.post(
            "/pipeline-control-plane/work-packets",
            json={
                "packetId": "packet-story-1-1",
                "title": "Authoritative lifecycle test packet",
                "initialStage": "capture",
                "status": "waiting",
                "truthLabel": "source_owned",
                "sourceRef": source_ref,
                "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                "idempotencyKey": "test-create-story-1-1",
                "correlationId": "corr-create-1-1",
                "payloadSummary": "Created from source-owned PRD metadata.",
                "evidenceRefs": ["story:1-1"],
            },
        )
        assert create_response.status_code == 200
        packet = create_response.json()["data"]
        assert packet["packetId"] == "packet-story-1-1"
        assert packet["currentStage"] == "capture"
        assert packet["history"][0]["eventType"] == "packet.created"
        assert packet["history"][0]["correlationId"] == "corr-create-1-1"
        assert packet["history"][0]["metadataOnly"] is True
        current_event_id = packet["currentEventId"]

        raw_evidence_create_response = client.post(
            "/pipeline-control-plane/work-packets",
            json={
                "packetId": "packet-raw-evidence",
                "title": "Raw evidence should be blocked",
                "sourceRef": source_ref,
                "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                "payloadSummary": "Attempt to store unsafe evidence metadata.",
                "evidenceRefs": ["rawPrompt:do-not-store"],
            },
        )
        assert raw_evidence_create_response.status_code == 400
        raw_spaced_summary_response = client.post(
            "/pipeline-control-plane/work-packets",
            json={
                "packetId": "packet-raw-spaced-summary",
                "title": "Raw spaced summary should be blocked",
                "sourceRef": source_ref,
                "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                "payloadSummary": "raw prompt retained in lifecycle metadata",
                "evidenceRefs": ["story:raw-spaced"],
            },
        )
        assert raw_spaced_summary_response.status_code == 400

        stale_transition_response = client.post(
            "/pipeline-control-plane/work-packets/packet-story-1-1/transitions",
            json={
                "targetStage": "execute",
                "expectedCurrentEventId": "event:stale",
                "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                "payloadSummary": "Stale transition should not be accepted.",
            },
        )
        assert stale_transition_response.status_code == 400

        skipped_stage_response = client.post(
            "/pipeline-control-plane/work-packets/packet-story-1-1/transitions",
            json={
                "targetStage": "execute",
                "expectedCurrentEventId": current_event_id,
                "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                "payloadSummary": "Out-of-order transition should not be accepted.",
            },
        )
        assert skipped_stage_response.status_code == 400

        for stage in ["classify", "route", "shape", "needs_approval", "execute", "review", "promote", "deliver", "learn"]:
            transition_response = client.post(
                "/pipeline-control-plane/work-packets/packet-story-1-1/transitions",
                json={
                    "targetStage": stage,
                    "expectedCurrentEventId": current_event_id,
                    "status": "active" if stage != "learn" else "complete",
                    "truthLabel": "source_owned",
                    "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                    "idempotencyKey": f"test-transition-{stage}",
                    "correlationId": "corr-story-1-1",
                    "causationId": current_event_id,
                    "payloadSummary": f"Accepted transition to {stage}.",
                    "evidenceRefs": [f"event:{stage}"],
                },
            )
            assert transition_response.status_code == 200
            current_event_id = transition_response.json()["data"]["currentEventId"]
            if stage == "classify":
                duplicate_transition_conflict = client.post(
                    "/pipeline-control-plane/work-packets/packet-story-1-1/transitions",
                    json={
                        "targetStage": "classify",
                        "expectedCurrentEventId": current_event_id,
                        "status": "active",
                        "truthLabel": "source_owned",
                        "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                        "idempotencyKey": "test-transition-classify",
                        "correlationId": "corr-story-1-1",
                        "causationId": packet["currentEventId"],
                        "payloadSummary": "Conflicting duplicate transition payload.",
                        "evidenceRefs": ["event:classify"],
                    },
                )
                assert duplicate_transition_conflict.status_code == 400
                same_stage_blocked_response = client.post(
                    "/pipeline-control-plane/work-packets/packet-story-1-1/transitions",
                    json={
                        "targetStage": "classify",
                        "expectedCurrentEventId": current_event_id,
                        "status": "blocked",
                        "truthLabel": "source_owned",
                        "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                        "idempotencyKey": "test-transition-classify-blocked",
                        "correlationId": "corr-story-1-1",
                        "causationId": current_event_id,
                        "payloadSummary": "Classify remains in-stage while blocked for operator evidence.",
                        "evidenceRefs": ["event:classify-blocked"],
                    },
                )
                assert same_stage_blocked_response.status_code == 200
                same_stage_blocked = same_stage_blocked_response.json()["data"]
                assert same_stage_blocked["currentStage"] == "classify"
                assert same_stage_blocked["status"] == "blocked"
                current_event_id = same_stage_blocked["currentEventId"]
                create_retry_after_transition = client.post(
                    "/pipeline-control-plane/work-packets",
                    json={
                        "packetId": "packet-story-1-1",
                        "title": "Authoritative lifecycle test packet",
                        "initialStage": "capture",
                        "status": "waiting",
                        "truthLabel": "source_owned",
                        "sourceRef": source_ref,
                        "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                        "idempotencyKey": "test-create-story-1-1",
                        "correlationId": "corr-create-1-1",
                        "payloadSummary": "Created from source-owned PRD metadata.",
                        "evidenceRefs": ["story:1-1"],
                    },
                )
                assert create_retry_after_transition.status_code == 200
                assert create_retry_after_transition.json()["data"]["currentStage"] == "classify"
                assert create_retry_after_transition.json()["data"]["status"] == "blocked"

        latest_response = client.get("/pipeline-control-plane/work-packets/packet-story-1-1")
        assert latest_response.status_code == 200
        latest = latest_response.json()["data"]
        assert latest["currentStage"] == "learn"
        assert latest["status"] == "complete"
        assert [event["targetStage"] for event in latest["history"]] == [
            "capture",
            "classify",
            "classify",
            "route",
            "shape",
            "needs_approval",
            "execute",
            "review",
            "promote",
            "deliver",
            "learn",
        ]
        assert all(event["sourceRef"]["refId"] == source_ref["refId"] for event in latest["history"])
        assert all(event["metadataOnly"] is True for event in latest["history"])
        assert latest["history"][-1]["correlationId"] == "corr-story-1-1"
        assert latest["history"][-1]["causationId"] == latest["history"][-2]["eventId"]

        blocked_raw_ref_response = client.post(
            "/pipeline-control-plane/work-packets/packet-story-1-1/transitions",
            json={
                "targetStage": "capture",
                "expectedCurrentEventId": latest["currentEventId"],
                "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                "payloadSummary": "Raw evidence ref should not be accepted.",
                "evidenceRefs": ["rawPrompt:do-not-store"],
            },
        )
        assert blocked_raw_ref_response.status_code == 400

        reused_transition_key_create = client.post(
            "/pipeline-control-plane/work-packets",
            json={
                "packetId": "packet-story-1-1-second",
                "title": "Second lifecycle packet",
                "sourceRef": source_ref,
                "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                "idempotencyKey": "test-transition-route",
                "payloadSummary": "Creation key may match an unrelated transition key without hijacking the packet.",
            },
        )
        assert reused_transition_key_create.status_code == 200
        assert reused_transition_key_create.json()["data"]["packetId"] == "packet-story-1-1-second"

        reused_create_key_conflict = client.post(
            "/pipeline-control-plane/work-packets",
            json={
                "packetId": "packet-story-1-1-conflict",
                "title": "Conflicting lifecycle packet",
                "sourceRef": source_ref,
                "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                "idempotencyKey": "test-create-story-1-1",
                "payloadSummary": "Create key reuse across packet ids must be rejected.",
            },
        )
        assert reused_create_key_conflict.status_code == 400

        with sqlite3.connect(db_path) as conn:
            conn.execute(
                "update authoritative_work_packets set current_stage = ?, status = ?, current_event_id = ? where id = ?",
                ("capture", "waiting", "event:stale-projection", "packet-story-1-1"),
            )
            conn.commit()

        reconstructed_response = client.get("/pipeline-control-plane/work-packets/packet-story-1-1")
        assert reconstructed_response.status_code == 200
        reconstructed = reconstructed_response.json()["data"]
        assert reconstructed["currentStage"] == "learn"
        assert reconstructed["status"] == "complete"
        assert reconstructed["currentEventId"] == latest["history"][-1]["eventId"]

    assert "authoritative_work_packets" in _sqlite_tables(db_path)
    assert "authoritative_work_packet_lifecycle_events" in _sqlite_tables(db_path)

    with _client(tmp_path, monkeypatch, db_name) as restarted_client:
        restarted_response = restarted_client.get("/pipeline-control-plane/work-packets/packet-story-1-1")
        assert restarted_response.status_code == 200
        restarted = restarted_response.json()["data"]
        assert restarted["currentStage"] == "learn"
        assert restarted["currentEventId"] == restarted["history"][-1]["eventId"]
        assert len(restarted["history"]) == 11
        assert restarted["history"][4]["previousStage"] == "route"


def test_pipeline_dashboard_projection_returns_truthful_empty_and_live_packet_states(tmp_path, monkeypatch) -> None:
    db_name = "pipeline-dashboard-projection.db"
    source_ref = {
        "refId": "prd:_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-01/prd.md",
        "sourceType": "prd",
        "pathOrUrl": "_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-01/prd.md",
        "title": "Live pipeline backend projection",
    }
    superseded_source_ref = {
        "refId": "prd:_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-02/prd.md",
        "sourceType": "prd",
        "pathOrUrl": "_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-02/prd.md",
        "title": "Superseded pipeline backend projection",
    }

    with _client(tmp_path, monkeypatch, db_name) as client:
        empty_response = client.get("/pipeline-control-plane/projection")
        assert empty_response.status_code == 200
        empty_projection = empty_response.json()["data"]
        expected_keys = {
            "schemaVersion",
            "projectionId",
            "generatedAt",
            "sourceUpdatedAt",
            "sourceLabel",
            "freshnessState",
            "staleAfterSeconds",
            "backendReachability",
            "fixtureMode",
            "truthSummary",
            "stageSummaries",
            "workPackets",
            "selectedPacketDetails",
            "managerSummary",
            "queueSummary",
            "evidenceRefs",
        }
        assert expected_keys <= set(empty_projection)
        assert empty_projection["staleAfterSeconds"] == 15
        assert empty_projection["sourceLabel"] == "live"
        assert empty_projection["freshnessState"] == "live"
        assert empty_projection["backendReachability"]["state"] == "reachable"
        assert empty_projection["fixtureMode"]["enabled"] is False
        assert empty_projection["fixtureMode"]["visibleLabelRequired"] is True
        assert empty_projection["fixtureMode"]["canSatisfyLiveProof"] is False
        assert empty_projection["truthSummary"]["emptyReason"] == "healthy_empty"
        assert empty_projection["truthSummary"]["backendEmpty"] is True
        assert empty_projection["truthSummary"]["backendUnavailable"] is False
        assert empty_projection["workPackets"] == []
        assert empty_projection["managerSummary"]["stateSource"] == "unknown"
        assert empty_projection["managerSummary"]["activeLeaseCount"] is None
        assert empty_projection["managerSummary"]["activeWorkerCount"] is None
        assert empty_projection["managerSummary"]["warmWorkerCount"] is None
        assert empty_projection["managerSummary"]["inactivityReason"] == "healthy_empty"
        assert empty_projection["queueSummary"]["emptyReason"] == "healthy_empty"
        assert {stage["stage"] for stage in empty_projection["stageSummaries"]} == {
            "capture",
            "classify",
            "route",
            "shape",
            "needs_approval",
            "execute",
            "review",
            "promote",
            "deliver",
            "learn",
        }
        assert all(stage["packetCount"] == 0 for stage in empty_projection["stageSummaries"])

        superseded_create_response = client.post(
            "/pipeline-control-plane/work-packets",
            json={
                "packetId": "packet-superseded-prd-proof",
                "title": "Superseded PRD projection packet",
                "initialStage": "execute",
                "status": "active",
                "truthLabel": "source_owned",
                "sourceRef": superseded_source_ref,
                "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                "idempotencyKey": "projection-create-superseded-prd",
                "payloadSummary": "Attempted creation from superseded PRD metadata.",
                "evidenceRefs": ["story:superseded", "proof:pipeline-real-workpacket"],
            },
        )
        assert superseded_create_response.status_code == 400
        assert "superseded planning PRD" in superseded_create_response.text

        create_response = client.post(
            "/pipeline-control-plane/work-packets",
            json={
                "packetId": "packet-story-2-4-real-proof",
                "title": "Projection packet",
                "initialStage": "execute",
                "status": "active",
                "truthLabel": "source_owned",
                "sourceRef": source_ref,
                "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                "idempotencyKey": "projection-create-story-2-4",
                "payloadSummary": "Created from source-owned PRD metadata.",
                "evidenceRefs": ["story:2-4", "proof:pipeline-real-workpacket"],
            },
        )
        assert create_response.status_code == 200

        projection_response = client.get("/pipeline-control-plane/projection")
        assert projection_response.status_code == 200
        projection = projection_response.json()["data"]
        assert projection["sourceLabel"] == "live"
        assert projection["freshnessState"] == "live"
        assert projection["fixtureMode"]["enabled"] is False
        assert projection["fixtureMode"]["canSatisfyLiveProof"] is False
        assert projection["truthSummary"]["emptyReason"] is None
        assert projection["truthSummary"]["backendEmpty"] is False
        assert projection["truthSummary"]["backendUnavailable"] is False
        assert projection["truthSummary"]["fixtureBacked"] is False
        assert projection["truthSummary"]["stale"] is False
        assert projection["evidenceRefs"] == ["proof:pipeline-real-workpacket", "story:2-4"]
        assert projection["queueSummary"]["dispatchableCount"] == 1
        assert projection["managerSummary"]["stateSource"] == "unknown"
        assert projection["managerSummary"]["freshnessState"] == "unknown"
        assert projection["managerSummary"]["activeLeaseCount"] is None
        assert projection["managerSummary"]["activeWorkerCount"] is None
        assert projection["managerSummary"]["warmWorkerCount"] is None
        assert projection["managerSummary"]["dispatchableQueueCount"] == 1
        assert projection["managerSummary"]["inactivityReason"] is None
        assert {packet["packetId"] for packet in projection["workPackets"]} == {detail["packetId"] for detail in projection["selectedPacketDetails"]}
        projected_packet = next(packet for packet in projection["workPackets"] if packet["packetId"] == "packet-story-2-4-real-proof")
        assert projected_packet["title"] == "Projection packet"
        assert projected_packet["currentStage"] == "execute"
        assert projected_packet["status"] == "active"
        assert projected_packet["truthLabel"] == "live"
        assert projected_packet["sourceRef"] == source_ref
        assert projected_packet["blocker"] is None
        assert projected_packet["nextAction"] == "Advance toward Review."
        assert projected_packet["evidenceRefs"] == ["proof:pipeline-real-workpacket", "story:2-4"]
        assert projected_packet["metadataOnly"] is True
        selected_detail = next(detail for detail in projection["selectedPacketDetails"] if detail["packetId"] == "packet-story-2-4-real-proof")
        assert selected_detail["sourceRefs"] == [source_ref]
        assert selected_detail["evidenceRefs"] == ["proof:pipeline-real-workpacket", "story:2-4"]
        assert selected_detail["currentStage"] == "execute"
        assert selected_detail["status"] == "active"
        assert selected_detail["truthLabel"] == "live"
        assert selected_detail["blocker"] is None
        assert selected_detail["nextAction"] == "Advance toward Review."
        assert selected_detail["metadataOnly"] is True
        execute_summary = next(stage for stage in projection["stageSummaries"] if stage["stage"] == "execute")
        assert execute_summary["packetCount"] == 1
        assert execute_summary["sourceLabel"] == "live"
        assert execute_summary["freshnessState"] == "live"

        refreshed_response = client.get("/pipeline-control-plane/projection")
        assert refreshed_response.status_code == 200
        refreshed_projection = refreshed_response.json()["data"]
        refreshed_packet = next(packet for packet in refreshed_projection["workPackets"] if packet["packetId"] == "packet-story-2-4-real-proof")
        refreshed_detail = next(detail for detail in refreshed_projection["selectedPacketDetails"] if detail["packetId"] == "packet-story-2-4-real-proof")
        assert refreshed_projection["sourceLabel"] == "live"
        assert refreshed_projection["freshnessState"] == "live"
        assert refreshed_projection["fixtureMode"]["enabled"] is False
        assert refreshed_projection["truthSummary"]["fixtureBacked"] is False
        assert {packet["packetId"] for packet in refreshed_projection["workPackets"]} == {detail["packetId"] for detail in refreshed_projection["selectedPacketDetails"]}
        assert refreshed_packet["truthLabel"] == "live"
        assert refreshed_packet["metadataOnly"] is True
        assert refreshed_packet["sourceRef"] == source_ref
        assert refreshed_detail["sourceRefs"] == [source_ref]
        assert refreshed_detail["evidenceRefs"] == ["proof:pipeline-real-workpacket", "story:2-4"]
        assert refreshed_detail["truthLabel"] == "live"
        assert refreshed_detail["metadataOnly"] is True

        with sqlite3.connect(_db_path(tmp_path, db_name)) as conn:
            conn.execute(
                "update authoritative_work_packets set updated_at = ? where id = ?",
                ("2026-01-01 00:00:00.000000", "packet-story-2-4-real-proof"),
            )
            conn.commit()

        stale_response = client.get("/pipeline-control-plane/projection")
        assert stale_response.status_code == 200
        stale_projection = stale_response.json()["data"]
        assert stale_projection["sourceLabel"] == "live"
        assert stale_projection["freshnessState"] == "live"
        assert stale_projection["truthSummary"]["stale"] is False
        assert stale_projection["managerSummary"]["inactivityReason"] is None
        stale_execute_summary = next(stage for stage in stale_projection["stageSummaries"] if stage["stage"] == "execute")
        assert stale_execute_summary["sourceLabel"] == "live"
        assert stale_execute_summary["freshnessState"] == "live"

        fresh_create_response = client.post(
            "/pipeline-control-plane/work-packets",
            json={
                "packetId": "packet-story-2-4-fresh",
                "title": "Fresh projection packet",
                "initialStage": "route",
                "status": "waiting",
                "truthLabel": "source_owned",
                "sourceRef": source_ref,
                "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                "idempotencyKey": "projection-create-story-2-4-fresh",
                "payloadSummary": "Fresh packet should not hide older stale packet.",
                "evidenceRefs": ["story:2-4:fresh"],
            },
        )
        assert fresh_create_response.status_code == 200
        approval_waiting_response = client.post(
            "/pipeline-control-plane/work-packets",
            json={
                "packetId": "packet-story-2-4-approval-gate",
                "title": "Approval gated packet",
                "initialStage": "needs_approval",
                "status": "waiting",
                "truthLabel": "source_owned",
                "sourceRef": source_ref,
                "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                "idempotencyKey": "projection-create-story-2-4-approval",
                "payloadSummary": "Approval gated packet should not count as worker dispatchable.",
                "evidenceRefs": ["story:2-4:approval"],
            },
        )
        assert approval_waiting_response.status_code == 200

        mixed_response = client.get("/pipeline-control-plane/projection")
        assert mixed_response.status_code == 200
        mixed_projection = mixed_response.json()["data"]
        assert mixed_projection["sourceLabel"] == "live"
        assert mixed_projection["freshnessState"] == "live"
        assert mixed_projection["queueSummary"]["dispatchableCount"] == 2
        assert mixed_projection["managerSummary"]["dispatchableQueueCount"] == 2
        approval_summary = next(stage for stage in mixed_projection["stageSummaries"] if stage["stage"] == "needs_approval")
        assert approval_summary["packetCount"] == 1
        mixed_active_packet = next(packet for packet in mixed_projection["workPackets"] if packet["packetId"] == "packet-story-2-4-real-proof")
        mixed_active_detail = next(detail for detail in mixed_projection["selectedPacketDetails"] if detail["packetId"] == "packet-story-2-4-real-proof")
        mixed_fresh_packet = next(packet for packet in mixed_projection["workPackets"] if packet["packetId"] == "packet-story-2-4-fresh")
        mixed_fresh_detail = next(detail for detail in mixed_projection["selectedPacketDetails"] if detail["packetId"] == "packet-story-2-4-fresh")
        assert mixed_active_packet["truthLabel"] == "live"
        assert mixed_active_detail["truthLabel"] == "live"
        assert mixed_fresh_packet["truthLabel"] == "live"
        assert mixed_fresh_detail["truthLabel"] == "live"
        assert {packet["packetId"] for packet in mixed_projection["workPackets"]} == {detail["packetId"] for detail in mixed_projection["selectedPacketDetails"]}
        mixed_execute_summary = next(stage for stage in mixed_projection["stageSummaries"] if stage["stage"] == "execute")
        mixed_route_summary = next(stage for stage in mixed_projection["stageSummaries"] if stage["stage"] == "route")
        assert mixed_execute_summary["sourceLabel"] == "live"
        assert mixed_execute_summary["freshnessState"] == "live"
        assert mixed_route_summary["sourceLabel"] == "live"
        assert mixed_route_summary["freshnessState"] == "live"

        with sqlite3.connect(_db_path(tmp_path, db_name)) as conn:
            conn.execute("update authoritative_work_packets set status = ? where id in (?, ?)", ("blocked", "packet-story-2-4-real-proof", "packet-story-2-4-fresh"))
            conn.execute(
                "update authoritative_work_packet_lifecycle_events set status = ? where packet_id in (?, ?)",
                ("blocked", "packet-story-2-4-real-proof", "packet-story-2-4-fresh"),
            )
            conn.commit()

        blocked_response = client.get("/pipeline-control-plane/projection")
        assert blocked_response.status_code == 200
        blocked_projection = blocked_response.json()["data"]
        assert blocked_projection["sourceLabel"] == "live"
        assert blocked_projection["queueSummary"]["dispatchableCount"] == 0
        assert blocked_projection["queueSummary"]["blockedCount"] == 2
        assert blocked_projection["managerSummary"]["inactivityReason"] == "blocked"

        with sqlite3.connect(_db_path(tmp_path, db_name)) as conn:
            conn.execute("update authoritative_work_packets set updated_at = CURRENT_TIMESTAMP where id in (?, ?)", ("packet-story-2-4-real-proof", "packet-story-2-4-fresh"))
            conn.commit()

        fresh_blocked_response = client.get("/pipeline-control-plane/projection")
        assert fresh_blocked_response.status_code == 200
        fresh_blocked_projection = fresh_blocked_response.json()["data"]
        assert fresh_blocked_projection["sourceLabel"] == "live"
        assert fresh_blocked_projection["queueSummary"]["dispatchableCount"] == 0
        assert fresh_blocked_projection["queueSummary"]["blockedCount"] == 2
        assert fresh_blocked_projection["managerSummary"]["inactivityReason"] == "blocked"
        assert fresh_blocked_projection["truthSummary"]["backendEmpty"] is False
        assert fresh_blocked_projection["queueSummary"]["emptyReason"] == "blocked"
        assert fresh_blocked_projection["managerSummary"]["sourceExhausted"] is False

        with sqlite3.connect(_db_path(tmp_path, db_name)) as conn:
            conn.execute("update authoritative_work_packets set status = ?, updated_at = CURRENT_TIMESTAMP where id in (?, ?)", ("failed", "packet-story-2-4-real-proof", "packet-story-2-4-fresh"))
            conn.execute(
                "update authoritative_work_packet_lifecycle_events set status = ? where packet_id in (?, ?)",
                ("failed", "packet-story-2-4-real-proof", "packet-story-2-4-fresh"),
            )
            conn.commit()

        failed_response = client.get("/pipeline-control-plane/projection")
        assert failed_response.status_code == 200
        failed_projection = failed_response.json()["data"]
        assert failed_projection["queueSummary"]["dispatchableCount"] == 0
        assert failed_projection["queueSummary"]["blockedCount"] == 2
        assert failed_projection["queueSummary"]["closedCount"] == 0
        assert failed_projection["queueSummary"]["emptyReason"] == "blocked"
        failed_packet = next(packet for packet in failed_projection["workPackets"] if packet["packetId"] == "packet-story-2-4-real-proof")
        assert failed_packet["blocker"] == "Packet status is failed."

        with sqlite3.connect(_db_path(tmp_path, db_name)) as conn:
            conn.execute(
                "update authoritative_work_packets set status = ?, updated_at = CURRENT_TIMESTAMP where id in (?, ?, ?)",
                ("complete", "packet-story-2-4-real-proof", "packet-story-2-4-fresh", "packet-story-2-4-approval-gate"),
            )
            conn.execute(
                "update authoritative_work_packet_lifecycle_events set status = ? where packet_id in (?, ?, ?)",
                ("complete", "packet-story-2-4-real-proof", "packet-story-2-4-fresh", "packet-story-2-4-approval-gate"),
            )
            conn.commit()

        source_exhausted_response = client.get("/pipeline-control-plane/projection")
        assert source_exhausted_response.status_code == 200
        source_exhausted_projection = source_exhausted_response.json()["data"]
        assert source_exhausted_projection["sourceLabel"] == "live"
        assert source_exhausted_projection["freshnessState"] == "live"
        assert source_exhausted_projection["truthSummary"]["backendEmpty"] is False
        assert len(source_exhausted_projection["workPackets"]) == 3
        assert source_exhausted_projection["queueSummary"]["dispatchableCount"] == 0
        assert source_exhausted_projection["queueSummary"]["blockedCount"] == 0
        assert source_exhausted_projection["queueSummary"]["closedCount"] == 3
        assert source_exhausted_projection["queueSummary"]["emptyReason"] == "source_exhausted"
        assert source_exhausted_projection["queueSummary"]["sourceExhausted"] is True
        assert source_exhausted_projection["managerSummary"]["inactivityReason"] == "source_exhausted"
        assert source_exhausted_projection["managerSummary"]["sourceExhausted"] is True
        assert source_exhausted_projection["managerSummary"]["dispatchableQueueCount"] == 0
        assert source_exhausted_projection["managerSummary"]["blockedQueueCount"] == 0
        assert source_exhausted_projection["managerSummary"]["closedQueueCount"] == 3

        from supervisor.application.service import SupervisorService

        async def unavailable_authoritative_packets(self, session):  # noqa: ARG001
            raise SQLAlchemyError("projection backend unavailable")

        monkeypatch.setattr(SupervisorService, "list_authoritative_work_packets", unavailable_authoritative_packets)
        unavailable_response = client.get("/pipeline-control-plane/projection")
        assert unavailable_response.status_code == 200
        unavailable_projection = unavailable_response.json()["data"]
        assert unavailable_projection["sourceLabel"] == "unavailable"
        assert unavailable_projection["freshnessState"] == "unavailable"
        assert unavailable_projection["backendReachability"]["state"] == "unavailable"
        assert unavailable_projection["backendReachability"]["reason"] == "backend_unavailable"
        assert unavailable_projection["truthSummary"]["backendUnavailable"] is True
        assert unavailable_projection["truthSummary"]["backendEmpty"] is False
        assert unavailable_projection["truthSummary"]["emptyReason"] == "backend_unavailable"
        assert unavailable_projection["managerSummary"]["stateSource"] == "unavailable"
        assert unavailable_projection["managerSummary"]["activeLeaseCount"] is None
        assert unavailable_projection["managerSummary"]["dispatchableQueueCount"] is None
        assert unavailable_projection["queueSummary"]["emptyReason"] == "backend_unavailable"
        assert unavailable_projection["queueSummary"]["dispatchableCount"] is None


def test_pipeline_dashboard_projection_includes_existing_backend_work_packets(tmp_path, monkeypatch) -> None:
    db_name = "pipeline-dashboard-legacy-work-packets.db"
    with _client(tmp_path, monkeypatch, db_name) as client:
        create_response = client.post(
            "/candidate-work",
            json={
                "title": "Legacy backend packet",
                "requestedOutcome": "Show existing backend WorkPacket source in projection.",
                "source": "operator",
                "sourceArtifactPath": "docs/operator-note.md",
                "sourceArtifactType": "manual_note",
                "riskLevel": "low",
                "priority": "normal",
            },
        )
        assert create_response.status_code == 200
        candidate_id = create_response.json()["data"]["id"]

        projection_response = client.get("/pipeline-control-plane/projection")
        assert projection_response.status_code == 200
        projection = projection_response.json()["data"]
        assert projection["sourceLabel"] == "live"
        assert projection["truthSummary"]["backendEmpty"] is False
        assert projection["queueSummary"]["dispatchableCount"] == 1
        assert projection["stageSummaries"][0]["stage"] == "capture"
        assert projection["stageSummaries"][0]["packetCount"] == 1
        assert projection["workPackets"] == [
            {
                "packetId": f"candidate_work:{candidate_id}",
                "title": "Legacy backend packet",
                "currentStage": "capture",
                "status": "waiting",
                "truthLabel": "live",
                "sourceRef": None,
                "blocker": None,
                "nextAction": "Advance toward Classify.",
                "evidenceRefs": [],
                "updatedAt": create_response.json()["data"]["updatedAt"],
                "metadataOnly": True,
            }
        ]
        assert projection["selectedPacketDetails"][0]["sourceRefs"] == []


def test_pipeline_dashboard_projection_blocks_legacy_packets_from_superseded_prd_sources(tmp_path, monkeypatch) -> None:
    db_name = "pipeline-dashboard-legacy-superseded-source.db"
    with _client(tmp_path, monkeypatch, db_name) as client:
        create_response = client.post(
            "/candidate-work",
            json={
                "title": "Legacy stale-source packet",
                "requestedOutcome": "Show stale source guard in legacy projection.",
                "source": "operator",
                "sourceArtifactPath": "_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-06-28-manager-control-plane/prd.md",
                "sourceArtifactType": "manual_note",
                "riskLevel": "low",
                "priority": "normal",
            },
        )
        assert create_response.status_code == 200
        candidate_id = create_response.json()["data"]["id"]

        projection_response = client.get("/pipeline-control-plane/projection")
        assert projection_response.status_code == 200
        projection = projection_response.json()["data"]
        packet = next(packet for packet in projection["workPackets"] if packet["packetId"] == f"candidate_work:{candidate_id}")
        assert packet["truthLabel"] == "stale"
        assert "superseded by the July 1 authoritative PRD" in packet["blocker"]
        detail = next(detail for detail in projection["selectedPacketDetails"] if detail["packetId"] == packet["packetId"])
        assert detail["truthLabel"] == "stale"
        assert "superseded by the July 1 authoritative PRD" in detail["blocker"]
        assert detail["sourceRefs"] == []


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
        assert packet["lifecycleState"]["source"] == "execution_attempt"
        assert packet["lifecycleState"]["stage"] == "execute"
        assert packet["lifecycleState"]["owner"] == "blocked"
        assert packet["lifecycleState"]["status"] == "failed"
        assert packet["lifecycleState"]["authoritativeRef"] == f"attempt:{attempt['attemptId']}"
        assert packet["lifecycleState"]["attemptRef"] == f"attempt:{attempt['attemptId']}"
        assert f"attempt:{attempt['attemptId']}" in packet["lifecycleState"]["derivedFromRefs"]
        assert all(ref.startswith("event:") for ref in packet["lifecycleState"]["transitionEventRefs"])
        assert packet["lifecycleState"]["latestTransitionEventRef"] in packet["lifecycleState"]["transitionEventRefs"]
        assert packet["lifecycleState"]["workerLaunchAllowed"] is False
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


def test_operator_owned_rework_exit_stops_automation_until_reenter_capture(tmp_path, monkeypatch) -> None:
    db_name = "operator-owned-work-packet.db"
    db_path = _db_path(tmp_path, db_name)
    with _client(tmp_path, monkeypatch, db_name) as client:
        work_item = _create_work_item(client, title="Operator-owned refinement packet")
        attempt_response = client.post(
            f"/work-items/{work_item['id']}/execution-attempts",
            json={"taskKind": "path_scope_check", "actorLabel": "Operator"},
        )
        assert attempt_response.status_code == 200
        attempt = attempt_response.json()["data"]
        failed_attempt_response = client.post(
            f"/work-items/{work_item['id']}/execution-attempts/{attempt['attemptId']}/lifecycle",
            json={"status": "failed", "reason": "Stale failed attempt before operator-owned exit."},
        )
        assert failed_attempt_response.status_code == 200
        _update_work_item_fixture(
            db_path,
            work_item["id"],
            state="needs_rework",
            lane="corrective_loop",
            status_summary="Needs operator refinement before automation continues.",
            next_step="Operator refines the packet.",
        )

        missing_note_response = client.post(
            f"/work-items/{work_item['id']}/actions",
            json={"action": "operator_owned_exit"},
        )
        assert missing_note_response.status_code == 409
        assert "requires an operator note" in missing_note_response.text

        exit_response = client.post(
            f"/work-items/{work_item['id']}/actions",
            json={
                "action": "operator_owned_exit",
                "note": "Idea is too broad; operator will split it in Obsidian before re-entry.",
                "actorLabel": "Operator",
            },
        )
        assert exit_response.status_code == 200
        exited = exit_response.json()["data"]
        assert exited["state"] == "operator_owned"
        assert exited["lane"] is None
        assert exited["blockedReason"] == "Idea is too broad; operator will split it in Obsidian before re-entry."
        assert exited["needsAttention"] is True
        assert exited["attentionReason"] == "Idea is too broad; operator will split it in Obsidian before re-entry."
        assert exited["nextStep"] == "Update input and re-enter capture"

        packet_response = client.get(f"/work-packets/work_item:{work_item['id']}")
        assert packet_response.status_code == 200
        packet = packet_response.json()["data"]
        assert packet["currentStage"] == "capture"
        assert packet["currentOwner"] == "operator"
        assert packet["status"] == "deferred"
        assert "work_item.operator_owned" in packet["routeSummary"]["reasonCodes"]
        assert "execution_attempt.failed" not in packet["routeSummary"]["reasonCodes"]
        assert packet["lifecycleState"]["source"] == "work_item"
        assert packet["lifecycleState"]["stage"] == "capture"
        assert packet["lifecycleState"]["owner"] == "operator"
        assert packet["lifecycleState"]["status"] == "deferred"
        assert packet["lifecycleState"]["authoritativeRef"] == f"work_item:{work_item['id']}"
        assert packet["lifecycleState"]["attemptRef"] is None
        assert packet["lifecycleState"]["sourceMutationAllowed"] is False
        assert packet["lifecycleState"]["providerCallsAllowed"] is False
        assert packet["lifecycleState"]["workerLaunchAllowed"] is False
        assert packet["lifecycleState"]["githubMutationAllowed"] is False
        assert packet["lifecycleState"]["cleanupAllowed"] is False
        assert packet["learnRefill"]["operatorOwnedExits"][0]["evidenceRefs"]
        assert packet["learnRefill"]["operatorOwnedExits"][0]["stopStateKind"] == "operator_owned_exit"
        assert len(packet["loopStopStates"]) == 1
        stop_state = packet["loopStopStates"][0]
        assert stop_state["kind"] == "operator_owned"
        assert stop_state["severity"] == "blocking"
        assert stop_state["sourceMutationAllowed"] is False
        assert stop_state["providerCallsAllowed"] is False
        assert stop_state["workerLaunchAllowed"] is False
        assert stop_state["githubMutationAllowed"] is False
        assert stop_state["cleanupAllowed"] is False
        assert "Do not dispatch workers" in stop_state["stopLine"]
        assert packet["recoveryActions"] == [
            {
                "actionId": "reenter-capture",
                "actionType": "reenter_capture",
                "label": "Re-enter capture",
                "availability": "available",
                "consequence": "Return the operator-refined packet to Capture for normal triage without replaying stale automation.",
                "resultingStage": "capture",
                "resultingOwner": "kendall",
                "evidenceRefs": [ref["refId"] for ref in packet["evidenceRefs"]],
            }
        ]
        blocked_retry_response = client.post(f"/work-items/{work_item['id']}/retry")
        assert blocked_retry_response.status_code == 409
        assert "must re-enter Capture before retry" in blocked_retry_response.text

        reenter_missing_note_response = client.post(
            f"/work-items/{work_item['id']}/actions",
            json={"action": "reenter_capture"},
        )
        assert reenter_missing_note_response.status_code == 409
        assert "requires an operator note" in reenter_missing_note_response.text

        reenter_response = client.post(
            f"/work-items/{work_item['id']}/actions",
            json={
                "action": "reenter_capture",
                "note": "Operator split the input and it is ready for capture.",
                "actorLabel": "Operator",
            },
        )
        assert reenter_response.status_code == 200
        reentered = reenter_response.json()["data"]
        assert reentered["state"] == "queued"
        assert reentered["lane"] == "intake"
        assert reentered["blockedReason"] is None
        assert reentered["nextStep"] == "Move into triage"


def test_done_delivery_work_packet_outranks_historical_execution_attempts(tmp_path, monkeypatch) -> None:
    db_name = "done-delivery-attempt-precedence.db"
    db_path = _db_path(tmp_path, db_name)
    with _client(tmp_path, monkeypatch, db_name) as client:
        work_item_response = client.post(
            "/work-items",
            json={
                "title": "Delivered packet with old failed attempt",
                "requestedOutcome": "Delivery state remains authoritative after old execution attempts.",
                "source": "pytest",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "sourceArtifactPath": "docs/delivered-with-old-attempt.md",
                    "pullRequestUrl": "https://github.com/example/repo/pull/4242",
                    "pullRequestStatus": "ready",
                    "ciStatus": "passed",
                    "mergeStatus": "ready",
                },
            },
        )
        assert work_item_response.status_code == 200
        work_item = work_item_response.json()["data"]

        attempt_response = client.post(
            f"/work-items/{work_item['id']}/execution-attempts",
            json={"taskKind": "path_scope_check", "actorLabel": "Operator"},
        )
        assert attempt_response.status_code == 200
        attempt = attempt_response.json()["data"]
        failed_attempt_response = client.post(
            f"/work-items/{work_item['id']}/execution-attempts/{attempt['attemptId']}/lifecycle",
            json={"status": "failed", "reason": "Historical failed attempt before delivery."},
        )
        assert failed_attempt_response.status_code == 200

        _update_work_item_fixture(
            db_path,
            work_item["id"],
            state="done",
            lane="review",
            status_summary="Delivered with PR evidence.",
            next_step=None,
        )

        packet_response = client.get(f"/work-packets/work_item:{work_item['id']}")
        assert packet_response.status_code == 200
        packet = packet_response.json()["data"]
        assert packet["currentStage"] == "deliver"
        assert packet["currentOwner"] == "github"
        assert packet["status"] == "complete"
        assert "work_item.done" in packet["routeSummary"]["reasonCodes"]
        assert "delivery.evidence_present" in packet["routeSummary"]["reasonCodes"]
        assert "execution_attempt.failed" not in packet["routeSummary"]["reasonCodes"]
        assert packet["lifecycleState"]["source"] == "delivery_evidence"
        assert packet["lifecycleState"]["authoritativeRef"] == f"work_item:{work_item['id']}"
        assert packet["lifecycleState"]["attemptRef"] is None
        assert packet["executionAttempts"][0]["status"] == "failed"


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


def test_work_item_memory_proposal_persists_review_state_and_surfaces_in_packet(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "work-packet-memory-proposals.db") as client:
        work_item = _create_work_item(client, title="Obsidian memory review")

        create_response = client.post(
            f"/work-items/{work_item['id']}/memory-proposals",
            json={
                "proposalId": "mp-20260625T000000Z",
                "label": "Memory proposal pending review",
                "summary": "Example Co repeatedly asks for a one-page implementation checklist.",
                "sourceRefs": ["obsidian:00-inbox-new-customer-insight"],
                "evidenceRefs": ["evidence:read-only-proof"],
                "targetVaultPath": "Obsidian/Kendall_Nxt/Inbox/mp-20260625T000000Z.md",
                "targetVaultFolder": "01 Dashboard Queue/AI Drafts",
                "proposalType": "new_note",
                "suggestedContentSummary": "Create a Kendall-authored draft for operator review.",
                "patchSummary": "Metadata-only proposal preview; no note content copied.",
                "sensitivity": "medium",
                "freshness": "fresh",
                "contradictionStatus": "none",
                "confidence": "high",
                "operatorAction": "defer",
                "decisionNeededContext": "Operator must review before any draft write-back.",
                "backupRecoveryPath": "No mutation performed; rerun read-only proof if stale.",
                "writeBackStatus": "review_gated",
            },
        )

        assert create_response.status_code == 200
        created = create_response.json()["data"]
        assert created["proposalId"] == "mp-20260625T000000Z"
        assert created["writeBackAllowed"] is False
        assert created["sourceRefs"] == ["obsidian:00-inbox-new-customer-insight"]
        assert created["evidenceRefs"] == ["evidence:read-only-proof"]
        assert "rawContent" not in created

        packet_response = client.get(f"/work-packets/work_item:{work_item['id']}")
        assert packet_response.status_code == 200
        packet = packet_response.json()["data"]
        assert packet["currentStage"] == "learn"
        assert packet["currentOwner"] == "memory_review"
        assert packet["status"] == "waiting"
        assert len(packet["memoryProposals"]) == 1
        proposal = packet["memoryProposals"][0]
        assert proposal["proposalId"] == "mp-20260625T000000Z"
        assert proposal["targetVaultFolder"] == "01 Dashboard Queue/AI Drafts"
        assert proposal["writeBackAllowed"] is False
        assert proposal["writeBackStatus"] == "review_gated"

        update_response = client.patch(
            f"/work-items/{work_item['id']}/memory-proposals/mp-20260625T000000Z",
            json={
                "status": "approved",
                "operatorAction": "approve",
                "decisionNeededContext": "Approved for a future gated draft preview only.",
                "writeBackStatus": "approved_for_future",
            },
        )
        assert update_response.status_code == 200
        updated = update_response.json()["data"]
        assert updated["status"] == "approved"
        assert updated["operatorAction"] == "approve"
        assert updated["writeBackAllowed"] is False
        assert updated["writeBackStatus"] == "approved_for_future"

        packet_after_update = client.get(f"/work-packets/work_item:{work_item['id']}").json()["data"]
        assert packet_after_update["memoryProposals"][0]["status"] == "approved"
        assert packet_after_update["memoryProposals"][0]["operatorAction"] == "approve"


def test_approved_memory_proposal_writes_ai_draft_to_configured_queue(tmp_path, monkeypatch) -> None:
    config_path, vault_root, backup_root = _write_obsidian_memory_config(tmp_path)
    monkeypatch.setenv("SUPERVISOR_OBSIDIAN_MEMORY_CONFIG", config_path)
    with _client(tmp_path, monkeypatch, "work-packet-memory-proposal-ai-draft.db") as client:
        work_item = _create_work_item(client, title="Obsidian AI draft write")
        create_response = client.post(
            f"/work-items/{work_item['id']}/memory-proposals",
            json={
                "proposalId": "mp-ai-draft",
                "label": "Memory proposal AI draft",
                "summary": "Metadata-only summary for the queued draft.",
                "sourceRefs": ["obsidian:00 Inbox/new-customer-insight.md"],
                "evidenceRefs": ["evidence:read-only-proof:00 Inbox/new-customer-insight.md"],
                "targetVaultPath": "01 Dashboard Queue/AI Drafts/memory-proposal-ai-draft-mp-ai-draft.md",
                "targetVaultFolder": "01 Dashboard Queue/AI Drafts",
                "proposalType": "new_note",
                "suggestedContentSummary": "Create a Kendall-authored draft for operator review.",
                "patchSummary": "Metadata-only proposal preview; no raw source note content copied.",
                "sensitivity": "medium",
                "freshness": "fresh",
                "contradictionStatus": "none",
                "confidence": "high",
                "operatorAction": "defer",
                "decisionNeededContext": "Operator must review before any draft write-back.",
                "backupRecoveryPath": "No mutation performed; rerun read-only proof if stale.",
                "writeBackStatus": "review_gated",
                "writeBackAllowed": False,
            },
        )
        assert create_response.status_code == 200
        approve_response = client.patch(
            f"/work-items/{work_item['id']}/memory-proposals/mp-ai-draft",
            json={
                "status": "approved",
                "operatorAction": "approve",
                "decisionNeededContext": "Approved for a future gated draft preview only.",
                "writeBackStatus": "approved_for_future",
                "writeBackAllowed": False,
            },
        )
        assert approve_response.status_code == 200

        draft_response = client.post(
            f"/work-items/{work_item['id']}/memory-proposals/mp-ai-draft/ai-draft",
            json={"actorLabel": "Operator"},
        )

        assert draft_response.status_code == 200
        proposal = draft_response.json()["data"]
        assert proposal["writeBackAllowed"] is False
        assert proposal["targetVaultPath"] == "01 Dashboard Queue/AI Drafts/memory-proposal-ai-draft-mp-ai-draft.md"
        assert "AI draft written to 01 Dashboard Queue/AI Drafts/memory-proposal-ai-draft-mp-ai-draft.md" in proposal["patchSummary"]
        assert "canonical notes remain human-owned" in proposal["decisionNeededContext"]
        assert "restore from" in proposal["backupRecoveryPath"]

        draft_path = vault_root / "01 Dashboard Queue" / "AI Drafts" / "memory-proposal-ai-draft-mp-ai-draft.md"
        assert draft_path.exists()
        draft_text = draft_path.read_text(encoding="utf-8")
        assert "proposal_id: mp-ai-draft" in draft_text
        assert "retention_class: metadata_only" in draft_text
        assert "raw_payload_retained: false" in draft_text
        assert "source_content_copied: false" in draft_text
        assert "obsidian:00 Inbox/new-customer-insight.md" in draft_text
        assert "Create a Kendall-authored draft for operator review." in draft_text
        assert not (vault_root / "00 Inbox" / "memory-proposal-ai-draft-mp-ai-draft.md").exists()
        assert any(backup_root.iterdir())

        packet = client.get(f"/work-packets/work_item:{work_item['id']}").json()["data"]
        packet_proposal = packet["memoryProposals"][0]
        assert packet_proposal["targetVaultPath"] == proposal["targetVaultPath"]
        assert packet_proposal["writeBackAllowed"] is False

        duplicate_response = client.post(
            f"/work-items/{work_item['id']}/memory-proposals/mp-ai-draft/ai-draft",
            json={"actorLabel": "Operator"},
        )
        assert duplicate_response.status_code == 200
        assert "AI draft already exists" in duplicate_response.json()["data"]["patchSummary"]


def test_ai_draft_write_blocks_without_config_or_approval(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "work-packet-memory-proposal-ai-draft-blocked.db") as client:
        work_item = _create_work_item(client, title="Blocked Obsidian AI draft write")
        create_response = client.post(
            f"/work-items/{work_item['id']}/memory-proposals",
            json={
                "proposalId": "mp-ai-draft-blocked",
                "label": "Blocked memory proposal AI draft",
                "summary": "Metadata-only summary.",
                "sourceRefs": ["obsidian:00 Inbox/new-customer-insight.md"],
                "evidenceRefs": ["evidence:read-only-proof:00 Inbox/new-customer-insight.md"],
                "targetVaultFolder": "01 Dashboard Queue/AI Drafts",
                "proposalType": "new_note",
                "suggestedContentSummary": "Create a Kendall-authored draft for operator review.",
                "sensitivity": "medium",
                "freshness": "fresh",
                "contradictionStatus": "none",
                "confidence": "high",
                "operatorAction": "defer",
                "backupRecoveryPath": "No mutation performed.",
                "writeBackStatus": "review_gated",
                "writeBackAllowed": False,
            },
        )
        assert create_response.status_code == 200

        unapproved_response = client.post(
            f"/work-items/{work_item['id']}/memory-proposals/mp-ai-draft-blocked/ai-draft",
            json={"actorLabel": "Operator"},
        )
        assert unapproved_response.status_code == 400
        assert "missing_approved_status" in unapproved_response.json()["detail"]["error"]["message"]

        approve_response = client.patch(
            f"/work-items/{work_item['id']}/memory-proposals/mp-ai-draft-blocked",
            json={
                "status": "approved",
                "operatorAction": "approve",
                "writeBackStatus": "approved_for_future",
                "writeBackAllowed": False,
            },
        )
        assert approve_response.status_code == 200

        missing_config_response = client.post(
            f"/work-items/{work_item['id']}/memory-proposals/mp-ai-draft-blocked/ai-draft",
            json={"actorLabel": "Operator"},
        )
        assert missing_config_response.status_code == 400
        assert "SUPERVISOR_OBSIDIAN_MEMORY_CONFIG is not configured" in missing_config_response.json()["detail"]["error"]["message"]


def test_llm_wiki_readiness_is_derived_from_approved_memory_metadata(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "work-packet-llm-wiki-readiness.db") as client:
        work_item_response = client.post(
            "/work-items",
            json={
                "title": "LLM-Wiki derived readiness",
                "requestedOutcome": "Show derived readiness from approved memory metadata.",
                "source": "pytest",
                "riskLevel": "low",
                "metadata": {
                    "workPacketSourceRefs": [
                        {
                            "refId": "source:obsidian-approved",
                            "sourceType": "obsidian",
                            "label": "Approved Obsidian source",
                            "pathOrUrl": "00 Inbox/new-customer-insight.md",
                            "freshness": "fresh",
                            "accessState": "allowed",
                        }
                    ]
                },
            },
        )
        assert work_item_response.status_code == 200
        work_item = work_item_response.json()["data"]
        create_response = client.post(
            f"/work-items/{work_item['id']}/memory-proposals",
            json={
                "proposalId": "mp-llm-wiki-ready",
                "label": "LLM-Wiki ready proposal",
                "summary": "Metadata-only summary for derived index readiness.",
                "sourceRefs": ["obsidian:00 Inbox/new-customer-insight.md"],
                "evidenceRefs": ["evidence:read-only-proof:00 Inbox/new-customer-insight.md"],
                "targetVaultPath": "01 Dashboard Queue/AI Drafts/llm-wiki-ready-proposal-mp-llm-wiki-ready.md",
                "targetVaultFolder": "01 Dashboard Queue/AI Drafts",
                "proposalType": "new_note",
                "suggestedContentSummary": "Create a Kendall-authored draft for operator review.",
                "sensitivity": "medium",
                "freshness": "fresh",
                "contradictionStatus": "none",
                "confidence": "high",
                "operatorAction": "defer",
                "backupRecoveryPath": "No mutation performed.",
                "writeBackStatus": "review_gated",
                "writeBackAllowed": False,
            },
        )
        assert create_response.status_code == 200
        approve_response = client.patch(
            f"/work-items/{work_item['id']}/memory-proposals/mp-llm-wiki-ready",
            json={
                "status": "approved",
                "operatorAction": "approve",
                "writeBackStatus": "approved_for_future",
                "writeBackAllowed": False,
            },
        )
        assert approve_response.status_code == 200

        packet = client.get(f"/work-packets/work_item:{work_item['id']}").json()["data"]
        readiness = packet["alphaMemorySourceStatus"]["llmWikiReadiness"]
        assert readiness["decisionState"] == "ready"
        assert readiness["canonicality"] == "derived_disposable_rebuildable"
        assert readiness["retentionClass"] == "metadata_only"
        assert readiness["memoryProposalRefs"] == ["mp-llm-wiki-ready"]
        assert readiness["allowedInputs"] == ["memory_proposal:mp-llm-wiki-ready"]
        assert readiness["blockedReasons"] == []
        assert readiness["canonicalMutationAllowed"] is False
        assert readiness["sourceMutationAllowed"] is False
        assert readiness["providerCallsAllowed"] is False
        assert readiness["durableWriteAllowed"] is False
        assert "never overrides Obsidian" in readiness["boundarySummary"]
        preview = readiness["rebuildPreview"]
        assert preview["previewId"] == f"llm-wiki-rebuild-preview:work_item:{work_item['id']}"
        assert preview["operationMode"] == "read_only"
        assert preview["retentionClass"] == "metadata_only"
        assert preview["memoryProposalRefs"] == ["mp-llm-wiki-ready"]
        assert "memory_proposal:mp-llm-wiki-ready" in preview["inputRefs"]
        assert "obsidian:00 Inbox/new-customer-insight.md" in preview["inputRefs"]
        assert "evidence:read-only-proof:00 Inbox/new-customer-insight.md" in preview["inputRefs"]
        assert "Derived LLM-Wiki index preview" in preview["plannedOutputScope"]
        assert "do not write LLM-Wiki index" in preview["stopLine"]
        assert preview["canonicalMutationAllowed"] is False
        assert preview["sourceMutationAllowed"] is False
        assert preview["providerCallsAllowed"] is False
        assert preview["workerLaunchAllowed"] is False
        assert preview["githubCallsAllowed"] is False
        assert preview["networkEgressAllowed"] is False
        assert preview["durableWriteAllowed"] is False
        plan = readiness["rebuildDryRunPlan"]
        assert plan["planId"] == f"llm-wiki-rebuild-dry-run-plan:work_item:{work_item['id']}"
        assert plan["operationMode"] == "dry_run"
        assert plan["retentionClass"] == "metadata_only"
        assert plan["memoryProposalRefs"] == ["mp-llm-wiki-ready"]
        assert "memory_proposal:mp-llm-wiki-ready" in plan["inputRefs"]
        assert "approved-memory-proposals" in plan["plannedDerivedSections"]
        assert plan["disposableTargetNamespace"] == f"derived://llm-wiki/dry-run/work_item:{work_item['id']}"
        assert any("do not write LLM-Wiki index" in stop_line for stop_line in plan["stopLines"])
        assert "regenerate" in plan["discardRecoveryPath"]
        assert plan["canonicalMutationAllowed"] is False
        assert plan["sourceMutationAllowed"] is False
        assert plan["providerCallsAllowed"] is False
        assert plan["workerLaunchAllowed"] is False
        assert plan["githubCallsAllowed"] is False
        assert plan["networkEgressAllowed"] is False
        assert plan["durableWriteAllowed"] is False
        assert plan["writePerformed"] is False
        assert plan["backupCreated"] is False


def test_llm_wiki_readiness_blocks_unapproved_or_derived_only_sources(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "work-packet-llm-wiki-readiness-blocked.db") as client:
        work_item_response = client.post(
            "/work-items",
            json={
                "title": "LLM-Wiki blocked readiness",
                "requestedOutcome": "Keep derived-only memory from becoming trusted memory.",
                "source": "pytest",
                "riskLevel": "low",
                "metadata": {
                    "workPacketSourceRefs": [
                        {
                            "refId": "source:llm-wiki-derived",
                            "sourceType": "llm_wiki",
                            "label": "Derived LLM-Wiki digest",
                            "freshness": "fresh",
                            "accessState": "allowed",
                        }
                    ]
                },
            },
        )
        assert work_item_response.status_code == 200
        work_item = work_item_response.json()["data"]

        packet_without_proposals = client.get(f"/work-packets/work_item:{work_item['id']}").json()["data"]
        not_configured = packet_without_proposals["alphaMemorySourceStatus"]["llmWikiReadiness"]
        assert not_configured["decisionState"] == "blocked"
        assert "source_ref.derived_non_canonical.source:llm-wiki-derived" in not_configured["blockedReasons"]
        assert "llm_wiki.no_memory_proposal_metadata" in not_configured["blockedReasons"]
        assert not_configured["durableWriteAllowed"] is False
        assert not_configured["rebuildPreview"] is None
        assert not_configured["rebuildDryRunPlan"] is None

        create_response = client.post(
            f"/work-items/{work_item['id']}/memory-proposals",
            json={
                "proposalId": "mp-llm-wiki-blocked",
                "label": "Blocked LLM-Wiki proposal",
                "summary": "Metadata-only summary that still needs review.",
                "sourceRefs": ["obsidian:00 Inbox/new-customer-insight.md"],
                "evidenceRefs": ["evidence:read-only-proof:00 Inbox/new-customer-insight.md"],
                "targetVaultFolder": "01 Dashboard Queue/AI Drafts",
                "proposalType": "new_note",
                "suggestedContentSummary": "Create a Kendall-authored draft for operator review.",
                "sensitivity": "medium",
                "freshness": "fresh",
                "contradictionStatus": "none",
                "confidence": "high",
                "operatorAction": "defer",
                "backupRecoveryPath": "No mutation performed.",
                "writeBackStatus": "review_gated",
                "writeBackAllowed": False,
            },
        )
        assert create_response.status_code == 200

        packet_with_pending = client.get(f"/work-packets/work_item:{work_item['id']}").json()["data"]
        blocked = packet_with_pending["alphaMemorySourceStatus"]["llmWikiReadiness"]
        assert blocked["decisionState"] == "blocked"
        assert "source_ref.derived_non_canonical.source:llm-wiki-derived" in blocked["blockedReasons"]
        assert "memory_proposal.not_approved.mp-llm-wiki-blocked" in blocked["blockedReasons"]
        assert blocked["canonicalMutationAllowed"] is False
        assert blocked["rebuildPreview"] is None
        assert blocked["rebuildDryRunPlan"] is None


def test_approved_llm_wiki_rebuild_writes_disposable_derived_artifact(tmp_path, monkeypatch) -> None:
    config_path, vault_root, backup_root = _write_obsidian_memory_config(tmp_path)
    monkeypatch.setenv("SUPERVISOR_OBSIDIAN_MEMORY_CONFIG", config_path)
    with _client(tmp_path, monkeypatch, "work-packet-llm-wiki-rebuild-write.db") as client:
        work_item_response = client.post(
            "/work-items",
            json={
                "title": "LLM-Wiki disposable rebuild write",
                "requestedOutcome": "Write a derived LLM-Wiki artifact after approval.",
                "source": "pytest",
                "riskLevel": "low",
                "metadata": {
                    "workPacketSourceRefs": [
                        {
                            "refId": "obsidian:00 Inbox/new-customer-insight.md",
                            "sourceType": "obsidian",
                            "label": "Approved Obsidian note",
                            "freshness": "fresh",
                            "accessState": "allowed",
                        }
                    ]
                },
            },
        )
        assert work_item_response.status_code == 200
        work_item = work_item_response.json()["data"]
        create_response = client.post(
            f"/work-items/{work_item['id']}/memory-proposals",
            json={
                "proposalId": "mp-llm-wiki-write",
                "label": "LLM-Wiki rebuild write",
                "summary": "Approved metadata summary for the derived LLM-Wiki artifact.",
                "sourceRefs": ["obsidian:00 Inbox/new-customer-insight.md"],
                "evidenceRefs": ["evidence:read-only-proof:00 Inbox/new-customer-insight.md"],
                "targetVaultFolder": "01 Dashboard Queue/AI Drafts",
                "proposalType": "new_note",
                "suggestedContentSummary": "Create a derived index entry from approved metadata only.",
                "patchSummary": "Metadata-only derived rebuild preview; no raw source note content copied.",
                "sensitivity": "medium",
                "freshness": "fresh",
                "contradictionStatus": "none",
                "confidence": "high",
                "operatorAction": "defer",
                "decisionNeededContext": "Operator must approve before disposable LLM-Wiki rebuild write.",
                "backupRecoveryPath": "No mutation performed yet.",
                "writeBackStatus": "review_gated",
                "writeBackAllowed": False,
            },
        )
        assert create_response.status_code == 200
        approve_response = client.patch(
            f"/work-items/{work_item['id']}/memory-proposals/mp-llm-wiki-write",
            json={
                "status": "approved",
                "operatorAction": "approve",
                "decisionNeededContext": "Approved for disposable LLM-Wiki rebuild artifact only.",
                "writeBackStatus": "approved_for_future",
                "writeBackAllowed": False,
            },
        )
        assert approve_response.status_code == 200

        write_response = client.post(
            f"/work-items/{work_item['id']}/memory-proposals/mp-llm-wiki-write/llm-wiki-rebuild",
            json={"approvalRef": "approval:operator:llm-wiki-rebuild-2026-06-26", "actorLabel": "Operator"},
        )

        assert write_response.status_code == 200
        proposal = write_response.json()["data"]
        assert proposal["writeBackAllowed"] is False
        assert proposal["targetVaultFolder"] == "01 Dashboard Queue/LLM Wiki Derived"
        assert proposal["targetVaultPath"] == "01 Dashboard Queue/LLM Wiki Derived/llm-wiki-derived-llm-wiki-rebuild-write-mp-llm-wiki-write.md"
        assert "LLM-Wiki derived artifact written" in proposal["patchSummary"]
        assert "Obsidian remains canonical" in proposal["decisionNeededContext"]
        assert "restore from" in proposal["backupRecoveryPath"]

        artifact_path = vault_root / "01 Dashboard Queue" / "LLM Wiki Derived" / "llm-wiki-derived-llm-wiki-rebuild-write-mp-llm-wiki-write.md"
        assert artifact_path.exists()
        artifact_text = artifact_path.read_text(encoding="utf-8")
        assert "status: llm-wiki-derived" in artifact_text
        assert "proposal_id: mp-llm-wiki-write" in artifact_text
        assert 'approval_ref: "approval:operator:llm-wiki-rebuild-2026-06-26"' in artifact_text
        assert "canonicality: derived_disposable_rebuildable" in artifact_text
        assert "raw_payload_retained: false" in artifact_text
        assert "source_content_copied: false" in artifact_text
        assert "write_back_allowed: false" in artifact_text
        assert "approved-memory-proposals" in artifact_text
        assert "Create a derived index entry from approved metadata only." in artifact_text
        assert not (vault_root / "00 Inbox" / "llm-wiki-derived-llm-wiki-rebuild-write-mp-llm-wiki-write.md").exists()
        assert any(backup_root.iterdir())

        duplicate_response = client.post(
            f"/work-items/{work_item['id']}/memory-proposals/mp-llm-wiki-write/llm-wiki-rebuild",
            json={"approvalRef": "approval:operator:llm-wiki-rebuild-2026-06-26", "actorLabel": "Operator"},
        )
        assert duplicate_response.status_code == 200
        assert "already exists" in duplicate_response.json()["data"]["patchSummary"]

        search_response = client.get(
            f"/work-items/{work_item['id']}/memory-proposals/mp-llm-wiki-write/llm-wiki-artifact",
            params={"query": "derived index"},
        )
        assert search_response.status_code == 200
        search_result = search_response.json()["data"]
        assert search_result["targetVaultPath"] == proposal["targetVaultPath"]
        assert search_result["query"] == "derived index"
        assert search_result["matched"] is True
        assert search_result["retentionClass"] == "metadata_only"
        assert search_result["rawPayloadRetained"] is False
        assert search_result["sourceContentCopied"] is False
        assert search_result["canonicalMutationAllowed"] is False
        assert search_result["sourceMutationAllowed"] is False
        assert search_result["metadata"]["status"] == "llm-wiki-derived"
        assert any("Derived Index" in excerpt or "derived index" in excerpt.lower() for excerpt in search_result["excerpts"])


def test_llm_wiki_rebuild_write_blocks_without_approval_config_or_safe_readiness(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "work-packet-llm-wiki-rebuild-write-blocked.db") as client:
        work_item_response = client.post(
            "/work-items",
            json={
                "title": "Blocked LLM-Wiki disposable rebuild",
                "requestedOutcome": "Block unsafe derived rebuild writes.",
                "source": "pytest",
                "riskLevel": "low",
                "metadata": {
                    "workPacketSourceRefs": [
                        {
                            "refId": "obsidian:00 Inbox/new-customer-insight.md",
                            "sourceType": "obsidian",
                            "label": "Approved Obsidian note",
                            "freshness": "fresh",
                            "accessState": "allowed",
                        }
                    ]
                },
            },
        )
        assert work_item_response.status_code == 200
        work_item = work_item_response.json()["data"]
        create_response = client.post(
            f"/work-items/{work_item['id']}/memory-proposals",
            json={
                "proposalId": "mp-llm-wiki-blocked-write",
                "label": "Blocked LLM-Wiki rebuild write",
                "summary": "Metadata summary.",
                "sourceRefs": ["obsidian:00 Inbox/new-customer-insight.md"],
                "evidenceRefs": ["evidence:read-only-proof:00 Inbox/new-customer-insight.md"],
                "targetVaultFolder": "01 Dashboard Queue/AI Drafts",
                "proposalType": "new_note",
                "suggestedContentSummary": "Create a derived index entry from approved metadata only.",
                "sensitivity": "medium",
                "freshness": "fresh",
                "contradictionStatus": "none",
                "confidence": "high",
                "operatorAction": "defer",
                "backupRecoveryPath": "No mutation performed.",
                "writeBackStatus": "review_gated",
                "writeBackAllowed": False,
            },
        )
        assert create_response.status_code == 200

        missing_approval_response = client.post(
            f"/work-items/{work_item['id']}/memory-proposals/mp-llm-wiki-blocked-write/llm-wiki-rebuild",
            json={"approvalRef": "", "actorLabel": "Operator"},
        )
        assert missing_approval_response.status_code == 400
        assert "explicit operator approval ref" in missing_approval_response.json()["detail"]["error"]["message"]

        missing_target_read_response = client.get(
            f"/work-items/{work_item['id']}/memory-proposals/mp-llm-wiki-blocked-write/llm-wiki-artifact",
            params={"query": "metadata"},
        )
        assert missing_target_read_response.status_code == 400
        assert "SUPERVISOR_OBSIDIAN_MEMORY_CONFIG is not configured" in missing_target_read_response.json()["detail"]["error"]["message"]

        unapproved_response = client.post(
            f"/work-items/{work_item['id']}/memory-proposals/mp-llm-wiki-blocked-write/llm-wiki-rebuild",
            json={"approvalRef": "approval:operator:test", "actorLabel": "Operator"},
        )
        assert unapproved_response.status_code == 400
        assert "missing_approved_status" in unapproved_response.json()["detail"]["error"]["message"]

        approve_response = client.patch(
            f"/work-items/{work_item['id']}/memory-proposals/mp-llm-wiki-blocked-write",
            json={"status": "approved", "operatorAction": "approve", "writeBackStatus": "approved_for_future", "writeBackAllowed": False},
        )
        assert approve_response.status_code == 200
        missing_config_response = client.post(
            f"/work-items/{work_item['id']}/memory-proposals/mp-llm-wiki-blocked-write/llm-wiki-rebuild",
            json={"approvalRef": "approval:operator:test", "actorLabel": "Operator"},
        )
        assert missing_config_response.status_code == 400
        assert "SUPERVISOR_OBSIDIAN_MEMORY_CONFIG is not configured" in missing_config_response.json()["detail"]["error"]["message"]

    config_path, _vault_root, _backup_root = _write_obsidian_memory_config(tmp_path)
    monkeypatch.setenv("SUPERVISOR_OBSIDIAN_MEMORY_CONFIG", config_path)
    with _client(tmp_path, monkeypatch, "work-packet-llm-wiki-rebuild-derived-blocked.db") as client:
        work_item_response = client.post(
            "/work-items",
            json={
                "title": "Derived source blocked LLM-Wiki rebuild",
                "requestedOutcome": "Block derived-only source from rebuilding itself.",
                "source": "pytest",
                "riskLevel": "low",
                "metadata": {
                    "workPacketSourceRefs": [
                        {
                            "refId": "source:llm-wiki-derived",
                            "sourceType": "llm_wiki",
                            "label": "Derived LLM-Wiki digest",
                            "freshness": "fresh",
                            "accessState": "allowed",
                        }
                    ]
                },
            },
        )
        assert work_item_response.status_code == 200
        work_item = work_item_response.json()["data"]
        create_response = client.post(
            f"/work-items/{work_item['id']}/memory-proposals",
            json={
                "proposalId": "mp-llm-wiki-derived-blocked",
                "label": "Derived LLM-Wiki rebuild write",
                "summary": "Metadata summary.",
                "sourceRefs": ["source:llm-wiki-derived"],
                "evidenceRefs": ["evidence:derived"],
                "targetVaultFolder": "01 Dashboard Queue/AI Drafts",
                "proposalType": "new_note",
                "suggestedContentSummary": "Attempt derived index entry.",
                "sensitivity": "medium",
                "freshness": "fresh",
                "contradictionStatus": "none",
                "confidence": "high",
                "status": "approved",
                "operatorAction": "approve",
                "backupRecoveryPath": "No mutation performed.",
                "writeBackStatus": "approved_for_future",
                "writeBackAllowed": False,
            },
        )
        assert create_response.status_code == 200
        blocked_response = client.post(
            f"/work-items/{work_item['id']}/memory-proposals/mp-llm-wiki-derived-blocked/llm-wiki-rebuild",
            json={"approvalRef": "approval:operator:test", "actorLabel": "Operator"},
        )
        assert blocked_response.status_code == 400
        assert "source_ref.derived_non_canonical.source:llm-wiki-derived" in blocked_response.json()["detail"]["error"]["message"]


def test_work_item_accepts_proof_derived_dashboard_proposal_payload(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "work-packet-kom-proof-proposal.db") as client:
        work_item = _create_work_item(client, title="KOM proof-derived proposal review")
        payload = {
            "proposalId": "mp-20260626T003931Z",
            "label": "Example Co onboarding signal",
            "status": "pending_human_approval",
            "summary": "The customer repeatedly asks for a one-page implementation checklist.",
            "sourceRefs": ["obsidian:00 Inbox/new-customer-insight.md"],
            "evidenceRefs": ["evidence:read-only-proof:00 Inbox/new-customer-insight.md"],
            "targetVaultPath": "01 Dashboard Queue/AI Drafts/example-co-onboarding-signal-mp-20260626T003931Z.md",
            "targetVaultFolder": "01 Dashboard Queue/AI Drafts",
            "proposalType": "new_note",
            "suggestedContentSummary": "Create a Kendall-authored dashboard draft for operator review.",
            "patchSummary": "Metadata-only proposal preview; no raw source note content copied.",
            "sensitivity": "medium",
            "freshness": "fresh",
            "contradictionStatus": "none",
            "confidence": "medium",
            "operatorAction": "defer",
            "decisionNeededContext": "Operator must review this proposal before any future draft write-back; canonical Obsidian notes remain human-owned.",
            "backupRecoveryPath": "No mutation performed. If a future write-back is approved, create backup and rollback evidence before writing an AI draft.",
            "writeBackStatus": "review_gated",
            "writeBackAllowed": False,
        }

        create_response = client.post(f"/work-items/{work_item['id']}/memory-proposals", json=payload)

        assert create_response.status_code == 200
        created = create_response.json()["data"]
        assert created["proposalId"] == payload["proposalId"]
        assert created["sourceRefs"] == payload["sourceRefs"]
        assert created["evidenceRefs"] == payload["evidenceRefs"]
        assert created["targetVaultPath"] == payload["targetVaultPath"]
        assert created["targetVaultFolder"] == "01 Dashboard Queue/AI Drafts"
        assert created["sensitivity"] == "medium"
        assert created["freshness"] == "fresh"
        assert created["confidence"] == "medium"
        assert created["writeBackAllowed"] is False
        assert "rawContent" not in created

        packet = client.get(f"/work-packets/work_item:{work_item['id']}").json()["data"]
        assert packet["currentOwner"] == "memory_review"
        assert packet["status"] == "waiting"
        assert len(packet["memoryProposals"]) == 1
        packet_proposal = packet["memoryProposals"][0]
        assert packet_proposal["proposalId"] == payload["proposalId"]
        assert packet_proposal["sourceRefs"] == payload["sourceRefs"]
        assert packet_proposal["evidenceRefs"] == payload["evidenceRefs"]
        assert packet_proposal["writeBackStatus"] == "review_gated"
        assert packet_proposal["writeBackAllowed"] is False


def test_memory_proposal_schema_is_repaired_for_existing_sqlite_database(tmp_path, monkeypatch) -> None:
    db_name = "work-packet-memory-proposal-legacy-schema.db"
    db_path = _db_path(tmp_path, db_name)
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            create table memory_proposals (
                id varchar(36) primary key,
                work_item_id varchar(36),
                proposal_id varchar(120),
                label varchar(255),
                summary text
            )
            """
        )
        conn.execute(
            """
            insert into memory_proposals (id, work_item_id, proposal_id, label, summary)
            values ('legacy-row', 'legacy-work-item', 'legacy-proposal', 'Legacy proposal', null)
            """
        )
        conn.commit()

    with _client(tmp_path, monkeypatch, db_name) as client:
        columns = _sqlite_table_columns(db_path, "memory_proposals")
        assert {
            "source_refs_json",
            "evidence_refs_json",
            "target_vault_folder",
            "proposal_type",
            "suggested_content_summary",
            "sensitivity",
            "freshness",
            "contradiction_status",
            "confidence",
            "operator_action",
            "backup_recovery_path",
            "write_back_status",
            "write_back_allowed",
        }.issubset(columns)
        assert _sqlite_has_unique_index(db_path, "memory_proposals", ("work_item_id", "proposal_id"))

        work_item = _create_work_item(client, title="Migrated Obsidian memory review")
        create_response = client.post(
            f"/work-items/{work_item['id']}/memory-proposals",
            json={
                "proposalId": "mp-after-schema-repair",
                "label": "Memory proposal after schema repair",
                "summary": "Metadata-only summary after legacy schema repair.",
                "sourceRefs": ["obsidian:source"],
                "evidenceRefs": ["evidence:proof"],
                "targetVaultFolder": "01 Dashboard Queue/AI Drafts",
                "proposalType": "new_note",
                "suggestedContentSummary": "Metadata-only draft summary.",
                "sensitivity": "low",
                "freshness": "fresh",
                "contradictionStatus": "none",
                "confidence": "medium",
                "operatorAction": "defer",
                "backupRecoveryPath": "No mutation performed.",
                "writeBackStatus": "review_gated",
            },
        )
        assert create_response.status_code == 200
        packet = client.get(f"/work-packets/work_item:{work_item['id']}").json()["data"]
        assert packet["memoryProposals"][0]["proposalId"] == "mp-after-schema-repair"
        assert packet["memoryProposals"][0]["writeBackAllowed"] is False

    with sqlite3.connect(db_path) as conn:
        legacy = conn.execute(
            """
            select status, summary, source_refs_json, evidence_refs_json, target_vault_folder,
                   proposal_type, sensitivity, freshness, contradiction_status, confidence,
                   operator_action, backup_recovery_path, write_back_status, write_back_allowed
            from memory_proposals
            where proposal_id = 'legacy-proposal'
            """
        ).fetchone()
    assert legacy == (
        "pending_human_approval",
        "",
        "[]",
        "[]",
        "",
        "new_note",
        "medium",
        "fresh",
        "none",
        "medium",
        "defer",
        "No mutation performed.",
        "review_gated",
        0,
    )


def test_memory_proposal_duplicate_ids_are_rejected_per_work_item(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "work-packet-memory-proposal-duplicates.db") as client:
        work_item = _create_work_item(client, title="Duplicate Obsidian memory review")
        payload = {
            "proposalId": "mp-duplicate",
            "label": "Memory proposal pending review",
            "summary": "Metadata-only summary.",
            "sourceRefs": ["obsidian:source"],
            "evidenceRefs": ["evidence:proof"],
            "targetVaultFolder": "01 Dashboard Queue/AI Drafts",
            "proposalType": "new_note",
            "suggestedContentSummary": "Metadata-only draft summary.",
            "sensitivity": "low",
            "freshness": "fresh",
            "contradictionStatus": "none",
            "confidence": "medium",
            "operatorAction": "defer",
            "backupRecoveryPath": "No mutation performed.",
            "writeBackStatus": "review_gated",
        }

        first_response = client.post(f"/work-items/{work_item['id']}/memory-proposals", json=payload)
        assert first_response.status_code == 200

        duplicate_response = client.post(f"/work-items/{work_item['id']}/memory-proposals", json=payload)
        assert duplicate_response.status_code == 409
        assert duplicate_response.json()["detail"]["error"]["code"] == "memory_proposal_conflict"

        update_response = client.patch(
            f"/work-items/{work_item['id']}/memory-proposals/mp-duplicate",
            json={"status": "approved", "operatorAction": "approve", "writeBackStatus": "approved_for_future"},
        )
        assert update_response.status_code == 200


def test_memory_proposal_rejects_unsafe_future_approval_updates(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "work-packet-memory-proposal-unsafe-approval.db") as client:
        work_item = _create_work_item(client, title="Unsafe Obsidian memory approval")
        base_payload = {
            "label": "Memory proposal pending review",
            "summary": "Metadata-only summary.",
            "sourceRefs": ["obsidian:source"],
            "evidenceRefs": ["evidence:proof"],
            "targetVaultFolder": "01 Dashboard Queue/AI Drafts",
            "proposalType": "new_note",
            "suggestedContentSummary": "Metadata-only draft summary.",
            "sensitivity": "low",
            "freshness": "fresh",
            "contradictionStatus": "none",
            "confidence": "medium",
            "operatorAction": "defer",
            "backupRecoveryPath": "No mutation performed.",
            "writeBackStatus": "review_gated",
        }
        cases = [
            ("mp-stale-approval", {"freshness": "stale"}),
            ("mp-contradictory-approval", {"contradictionStatus": "confirmed"}),
        ]

        for proposal_id, overrides in cases:
            create_response = client.post(
                f"/work-items/{work_item['id']}/memory-proposals",
                json={**base_payload, **overrides, "proposalId": proposal_id},
            )
            assert create_response.status_code == 200

            update_response = client.patch(
                f"/work-items/{work_item['id']}/memory-proposals/{proposal_id}",
                json={
                    "status": "approved",
                    "operatorAction": "approve",
                    "writeBackStatus": "approved_for_future",
                    "decisionNeededContext": "Attempted unsafe future approval.",
                },
            )
            assert update_response.status_code == 400
            assert update_response.json()["detail"]["error"]["code"] == "memory_proposal_review_rejected"

            packet = client.get(f"/work-packets/work_item:{work_item['id']}").json()["data"]
            proposal = next(item for item in packet["memoryProposals"] if item["proposalId"] == proposal_id)
            assert proposal["status"] == "pending_human_approval"
            assert proposal["operatorAction"] == "defer"
            assert proposal["writeBackStatus"] == "review_gated"
            assert proposal["writeBackAllowed"] is False


def test_memory_proposal_rejects_raw_content_missing_refs_and_write_back_authority(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "work-packet-memory-proposal-rejections.db") as client:
        work_item = _create_work_item(client, title="Rejected Obsidian memory review")
        valid_payload = {
            "proposalId": "mp-rejected-test",
            "label": "Memory proposal pending review",
            "summary": "Metadata-only summary.",
            "sourceRefs": ["obsidian:source"],
            "evidenceRefs": ["evidence:proof"],
            "targetVaultFolder": "01 Dashboard Queue/AI Drafts",
            "proposalType": "new_note",
            "suggestedContentSummary": "Metadata-only draft summary.",
            "sensitivity": "low",
            "freshness": "fresh",
            "contradictionStatus": "none",
            "confidence": "medium",
            "operatorAction": "defer",
            "backupRecoveryPath": "No mutation performed.",
            "writeBackStatus": "review_gated",
        }

        raw_content_response = client.post(
            f"/work-items/{work_item['id']}/memory-proposals",
            json={**valid_payload, "proposalId": "mp-raw", "rawContent": "full source note"},
        )
        assert raw_content_response.status_code == 422

        missing_refs_response = client.post(
            f"/work-items/{work_item['id']}/memory-proposals",
            json={**valid_payload, "proposalId": "mp-missing-refs", "sourceRefs": []},
        )
        assert missing_refs_response.status_code == 422

        write_back_response = client.post(
            f"/work-items/{work_item['id']}/memory-proposals",
            json={**valid_payload, "proposalId": "mp-write", "writeBackAllowed": True},
        )
        assert write_back_response.status_code == 422


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
                "sourceArtifactPath": "_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-06-28-manager-control-plane/prd.md",
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
                        "refId": "fixture:source:superseded-prd",
                        "sourceType": "bmad_artifact",
                        "label": "Superseded manager-control-plane PRD",
                        "pathOrUrl": "_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-06-28-manager-control-plane/prd.md",
                        "freshness": "fresh",
                        "accessState": "allowed",
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
        canonical_ref = blocked_source_refs[f"work_item:{blocked_item['id']}"]
        assert canonical_ref["accessState"] == "blocked"
        assert canonical_ref["freshness"] == "stale"
        assert canonical_ref["pathOrUrl"] is None
        assert "superseded by the July 1 authoritative PRD" in canonical_ref["blockedReason"]
        assert blocked_source_refs["fixture:source:stale"]["freshness"] == "stale"
        assert blocked_source_refs["fixture:source:missing"]["accessState"] == "missing"
        assert blocked_source_refs["fixture:source:excluded"]["accessState"] == "excluded"
        assert blocked_source_refs["fixture:source:excluded"]["pathOrUrl"] is None
        assert blocked_source_refs["fixture:source:blocked"]["accessState"] == "blocked"
        assert blocked_source_refs["fixture:source:superseded-prd"]["accessState"] == "blocked"
        assert blocked_source_refs["fixture:source:superseded-prd"]["freshness"] == "stale"
        assert blocked_source_refs["fixture:source:superseded-prd"]["pathOrUrl"] is None
        assert "superseded by the July 1 authoritative PRD" in blocked_source_refs["fixture:source:superseded-prd"]["blockedReason"]
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
        assert blocked_source_refs["metadata_source:8"]["sourceType"] == "manual"
        assert blocked_source_refs["metadata_source:8"]["accessState"] == "blocked"
        assert "malformed source ref" in blocked_source_refs["metadata_source:8"]["label"]
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
        assert "source_ref.invalid_or_blocked.fixture:source:superseded-prd" in alpha_status["blockedReasons"]
        assert "source_ref.stale.fixture:source:superseded-prd" in alpha_status["blockedReasons"]
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
        assert done_packet["lifecycleState"]["source"] == "delivery_evidence"
        assert done_packet["lifecycleState"]["authoritativeRef"] == f"work_item:{done_item['id']}"
        assert done_packet["lifecycleState"]["stage"] == "deliver"
        assert done_packet["lifecycleState"]["owner"] == "github"
        assert done_packet["lifecycleState"]["status"] == "complete"
        assert f"delivery:{done_item['id']}" in done_packet["lifecycleState"]["derivedFromRefs"]
        assert done_packet["lifecycleState"]["githubMutationAllowed"] is False
        assert done_packet["lifecycleState"]["cleanupAllowed"] is False
        assert any(ref["evidenceType"] == "gate" and ref["refId"] == f"delivery:{done_item['id']}" for ref in done_packet["evidenceRefs"])
        assert any(
            ref["artifactType"] == "pull_request" and ref["pathOrUrl"] == "https://github.com/example/repo/pull/42"
            for ref in done_packet["artifactRefs"]
        )


def test_pipeline_dashboard_projection_endpoint_projects_live_work_packets(tmp_path, monkeypatch) -> None:
    db_name = "pipeline-projection.db"
    with _client(tmp_path, monkeypatch, db_name) as client:
        work_item = _create_work_item(client, title="Live projection packet")

        response = client.get("/pipeline-control-plane/projection")
        assert response.status_code == 200
        projection = response.json()["data"]

        assert projection["schemaVersion"] == "pipeline-dashboard-projection/v0"
        assert projection["sourceLabel"] == "live"
        assert projection["freshnessState"] == "live"
        assert projection["fixtureMode"]["enabled"] is False
        assert projection["truthSummary"]["fixtureBacked"] is False
        assert len(projection["stageSummaries"]) == 10
        packet = next(packet for packet in projection["workPackets"] if packet["packetId"] == f"work_item:{work_item['id']}")
        assert packet["title"] == "Live projection packet"
        assert packet["truthLabel"] == "live"
        assert packet["metadataOnly"] is True
        assert packet["sourceRef"] is None
        assert packet["currentStage"] in {"capture", "classify", "route", "shape", "needs_approval", "execute", "review", "promote", "deliver", "learn"}
        detail = next(detail for detail in projection["selectedPacketDetails"] if detail["packetId"] == packet["packetId"])
        assert detail["metadataOnly"] is True
        assert detail["sourceRefs"] == []

def test_work_packet_transition_events_replay_work_item_and_subscription_launch_events(tmp_path, monkeypatch) -> None:
    db_name = "work-packet-transition-event-replay.db"
    db_path = _db_path(tmp_path, db_name)
    with _client(tmp_path, monkeypatch, db_name) as client:
        work_item = _create_work_item(client, title="Transition replay packet")
        _insert_workflow_event_fixture(
            db_path,
            work_item["id"],
            event_id="event-work-item-ready",
            event_type="work_item.ready",
            summary="Work item moved to ready.",
            payload={"state": "ready", "lane": "utility"},
            created_at="2026-06-28 00:00:01.000000",
        )
        _insert_workflow_event_fixture(
            db_path,
            work_item["id"],
            event_id="event-recipe-ready",
            event_type="recipe.ready",
            summary="Recipe moved to ready.",
            payload={"state": "ready", "lane": "local_patch_draft"},
            created_at="2026-06-28 00:00:01.250000",
        )
        for event_id, event_type in [
            ("event-work-item-assigned", "work_item.assigned"),
            ("event-work-item-unassigned", "work_item.unassigned"),
            ("event-work-item-escalated", "work_item.escalated"),
        ]:
            _insert_workflow_event_fixture(
                db_path,
                work_item["id"],
                event_id=event_id,
                event_type=event_type,
                summary="Work item bookkeeping changed without a state transition.",
                payload={"state": "ready", "lane": "utility", "assigneeLabel": "Operator"},
                created_at="2026-06-28 00:00:01.500000",
            )
        _insert_workflow_event_fixture(
            db_path,
            work_item["id"],
            event_id="event-supervised-codex-started",
            event_type="execution_attempt.supervised_codex_launch_started",
            summary="Supervised Codex launch started.",
            payload={
                "attemptId": "attempt-supervised-codex",
                "selectedLane": "codex_cli_worker",
                "status": "completed",
            },
            created_at="2026-06-28 00:00:01.750000",
        )
        for event_id, event_type, summary in [
            (
                "event-subscription-z-started",
                "execution_attempt.subscription_launch_fixture_started",
                "Subscription-agent artifact-only fixture started.",
            ),
            (
                "event-subscription-b-timeout-policy",
                "execution_attempt.subscription_launch_fixture_timeout_policy_recorded",
                "Subscription-agent timeout policy recorded.",
            ),
            (
                "event-subscription-c-cancellation-policy",
                "execution_attempt.subscription_launch_fixture_cancellation_policy_recorded",
                "Subscription-agent cancellation policy recorded.",
            ),
            (
                "event-subscription-d-rollback-disabled",
                "execution_attempt.subscription_launch_fixture_rollback_disabled_recorded",
                "Subscription-agent rollback-disabled policy recorded.",
            ),
        ]:
            _insert_workflow_event_fixture(
                db_path,
                work_item["id"],
                event_id=event_id,
                event_type=event_type,
                summary=summary,
                payload={
                    "executionAttemptId": "attempt-subscription-fixture",
                    "approvalBinding": {"lane": "subscription_agent"},
                },
                created_at="2026-06-28 00:00:02.000000",
            )
        _insert_workflow_event_fixture(
            db_path,
            work_item["id"],
            event_id="event-subscription-completed",
            event_type="execution_attempt.subscription_launch_fixture_completed",
            summary="Subscription-agent artifact-only fixture completed.",
            payload={
                "executionAttemptId": "attempt-subscription-fixture",
                "attemptStatus": "completed",
                "approvalBinding": {"lane": "subscription_agent"},
            },
            created_at="2026-06-28 00:00:02.000000",
        )

        packet_response = client.get(f"/work-packets/work_item:{work_item['id']}")
        assert packet_response.status_code == 200
        packet = packet_response.json()["data"]
        transition_by_type = {transition["eventType"]: transition for transition in packet["transitionEvents"]}

        ready_transition = transition_by_type["work_item.ready"]
        assert ready_transition["targetStage"] == "human_gate"
        assert ready_transition["targetOwner"] == "operator"
        assert ready_transition["targetStatus"] == "waiting"
        assert ready_transition["evidenceRefs"] == ["event:event-work-item-ready"]
        recipe_transition = transition_by_type["recipe.ready"]
        assert recipe_transition["targetStage"] == "human_gate"
        assert recipe_transition["targetOwner"] == "operator"
        assert recipe_transition["targetStatus"] == "waiting"
        assert recipe_transition["evidenceRefs"] == ["event:event-recipe-ready"]
        for bookkeeping_event_type in ["work_item.assigned", "work_item.unassigned", "work_item.escalated"]:
            assert bookkeeping_event_type not in transition_by_type

        supervised_transition = transition_by_type["execution_attempt.supervised_codex_launch_started"]
        assert supervised_transition["targetStage"] == "execute"
        assert supervised_transition["targetOwner"] == "codex_worker"
        assert supervised_transition["targetStatus"] == "active"
        assert "attempt:attempt-supervised-codex" in supervised_transition["evidenceRefs"]

        subscription_transition = transition_by_type["execution_attempt.subscription_launch_fixture_completed"]
        assert subscription_transition["targetStage"] == "review"
        assert subscription_transition["targetOwner"] == "kendall"
        assert subscription_transition["targetStatus"] == "complete"
        assert "event:event-subscription-completed" in subscription_transition["evidenceRefs"]
        assert "attempt:attempt-subscription-fixture" in subscription_transition["evidenceRefs"]
        subscription_order = [
            transition["eventType"]
            for transition in packet["transitionEvents"]
            if transition["eventType"].startswith("execution_attempt.subscription_launch_fixture_")
        ]
        assert subscription_order == [
            "execution_attempt.subscription_launch_fixture_started",
            "execution_attempt.subscription_launch_fixture_timeout_policy_recorded",
            "execution_attempt.subscription_launch_fixture_cancellation_policy_recorded",
            "execution_attempt.subscription_launch_fixture_rollback_disabled_recorded",
            "execution_attempt.subscription_launch_fixture_completed",
        ]

        packet_evidence_ref_ids = {ref["refId"] for ref in packet["evidenceRefs"]}
        assert "event:event-work-item-ready" in packet_evidence_ref_ids
        assert "event:event-subscription-completed" in packet_evidence_ref_ids

def test_work_packet_list_replays_gate_state_from_descending_events(tmp_path, monkeypatch) -> None:
    db_name = "work-packet-list-event-order.db"
    db_path = _db_path(tmp_path, db_name)
    with _client(tmp_path, monkeypatch, db_name) as client:
        work_item = _create_work_item(client, title="List replay ordering packet")
        _insert_workflow_event_fixture(
            db_path,
            work_item["id"],
            event_id="event-list-triaged",
            event_type="work_item.triaged",
            summary="Work item moved to triaged.",
            payload={"state": "triaged"},
            created_at="2027-06-28 00:00:01.000000",
        )
        _insert_workflow_event_fixture(
            db_path,
            work_item["id"],
            event_id="event-list-ready",
            event_type="work_item.ready",
            summary="Work item moved to ready.",
            payload={"state": "ready"},
            created_at="2027-06-28 00:00:02.000000",
        )
        _update_work_item_fixture(db_path, work_item["id"], state="ready")

        list_response = client.get("/work-packets")
        assert list_response.status_code == 200
        list_packet = next(packet for packet in list_response.json()["data"] if packet["packetId"] == f"work_item:{work_item['id']}")
        single_packet = client.get(f"/work-packets/work_item:{work_item['id']}").json()["data"]

        for packet in [list_packet, single_packet]:
            validation = packet["gateStateValidation"]
            assert validation["status"] == "matched"
            assert validation["latestEventType"] == "work_item.ready"
            assert validation["derivedStage"] == "human_gate"
            assert validation["derivedOwner"] == "operator"
            assert validation["derivedStatus"] == "waiting"
            assert validation["mismatchReasons"] == []

        list_event_types = [transition["eventType"] for transition in list_packet["transitionEvents"]]
        assert list_event_types.index("work_item.triaged") < list_event_types.index("work_item.ready")

def test_work_packet_gate_state_validation_matches_event_replay_without_mutation(tmp_path, monkeypatch) -> None:
    db_name = "work-packet-gate-replay-match.db"
    with _client(tmp_path, monkeypatch, db_name) as client:
        from supervisor.api.main import service

        service._repo_is_dirty = lambda: False  # type: ignore[method-assign]
        work_item_response = client.post(
            "/work-items",
            json={
                "title": "Gate replay matched packet",
                "requestedOutcome": "Validate stored gate state against ordered events.",
                "source": "pytest",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "sourceArtifactPath": "docs/gate-replay.md",
                },
            },
        )
        assert work_item_response.status_code == 200
        work_item = work_item_response.json()["data"]

        attempt_response = client.post(f"/work-items/{work_item['id']}/execution-attempts", json={})
        assert attempt_response.status_code == 200
        attempt = attempt_response.json()["data"]
        approval_response = client.post(
            f"/work-items/{work_item['id']}/execution-attempts/{attempt['attemptId']}/lifecycle",
            json={
                "status": "approved",
                "reason": "operator gate approval",
                "routeDecisionId": attempt["routeDecisionId"],
                "workerId": attempt["workerId"],
                "lane": attempt["lane"],
                "authorityMode": attempt["authorityMode"],
            },
        )
        assert approval_response.status_code == 200
        before_events = client.get(f"/work-items/{work_item['id']}/events").json()["data"]

        packet_response = client.get(f"/work-packets/work_item:{work_item['id']}")
        assert packet_response.status_code == 200
        packet = packet_response.json()["data"]
        validation = packet["gateStateValidation"]

        assert validation["status"] == "matched"
        assert validation["storedStage"] == "human_gate"
        assert validation["derivedStage"] == "human_gate"
        assert validation["storedOwner"] == "operator"
        assert validation["derivedOwner"] == "operator"
        assert validation["storedStatus"] == "waiting"
        assert validation["derivedStatus"] == "waiting"
        assert validation["latestEventType"] == "execution_attempt.approved"
        assert "execution_attempt.approved" in validation["replayedEventTypes"]
        assert validation["mismatchReasons"] == []
        assert validation["blockedReasons"] == []
        assert validation["readOnly"] is True
        assert validation["sourceMutationAllowed"] is False
        assert validation["providerCallsAllowed"] is False
        assert validation["workerLaunchAllowed"] is False
        assert client.get(f"/work-items/{work_item['id']}/events").json()["data"] == before_events

def test_work_packet_gate_state_validation_blocks_mismatch_from_event_replay(tmp_path, monkeypatch) -> None:
    db_name = "work-packet-gate-replay-mismatch.db"
    db_path = _db_path(tmp_path, db_name)
    with _client(tmp_path, monkeypatch, db_name) as client:
        from supervisor.api.main import service

        service._repo_is_dirty = lambda: False  # type: ignore[method-assign]
        work_item_response = client.post(
            "/work-items",
            json={
                "title": "Gate replay mismatch packet",
                "requestedOutcome": "Report stored gate state drift as blocked validation.",
                "source": "pytest",
                "riskLevel": "low",
                "metadata": {
                    "executionRecipeId": "dashboard-test-coverage",
                    "sourceArtifactPath": "docs/gate-replay.md",
                },
            },
        )
        assert work_item_response.status_code == 200
        work_item = work_item_response.json()["data"]
        attempt_response = client.post(f"/work-items/{work_item['id']}/execution-attempts", json={})
        attempt = attempt_response.json()["data"]
        approval_response = client.post(
            f"/work-items/{work_item['id']}/execution-attempts/{attempt['attemptId']}/lifecycle",
            json={
                "status": "approved",
                "reason": "operator gate approval",
                "routeDecisionId": attempt["routeDecisionId"],
                "workerId": attempt["workerId"],
                "lane": attempt["lane"],
                "authorityMode": attempt["authorityMode"],
            },
        )
        assert approval_response.status_code == 200
        _update_execution_attempt_fixture(db_path, attempt["attemptId"], status="running")

        packet_response = client.get(f"/work-packets/work_item:{work_item['id']}")
        assert packet_response.status_code == 200
        validation = packet_response.json()["data"]["gateStateValidation"]

        assert validation["status"] == "blocked"
        assert validation["storedStage"] == "execute"
        assert validation["derivedStage"] == "human_gate"
        assert validation["storedStatus"] == "active"
        assert validation["derivedStatus"] == "waiting"
        assert any("stored stage execute" in reason for reason in validation["mismatchReasons"])
        assert any("stored status active" in reason for reason in validation["mismatchReasons"])

def test_work_packet_gate_state_validation_blocks_inaccessible_refs_with_explicit_states(tmp_path, monkeypatch) -> None:
    db_name = "work-packet-gate-replay-refs.db"
    db_path = _db_path(tmp_path, db_name)
    with _client(tmp_path, monkeypatch, db_name) as client:
        work_item = _create_work_item(client, title="Gate replay inaccessible refs packet")
        _update_work_item_fixture(
            db_path,
            work_item["id"],
            metadata_json={
                "sourceArtifactPath": "docs/direct-work.md",
                "workPacketSourceRefs": [
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
                        "refId": "fixture:source:unsupported",
                        "sourceType": "private_dump",
                        "label": "Unsupported private dump",
                        "pathOrUrl": "file:///private/raw-source.md",
                        "freshness": "fresh",
                        "accessState": "allowed",
                    },
                ],
            },
        )

        packet_response = client.get(f"/work-packets/work_item:{work_item['id']}")
        assert packet_response.status_code == 200
        packet = packet_response.json()["data"]
        validation = packet["gateStateValidation"]
        ref_states = {ref["refId"]: ref for ref in validation["refStates"] if ref["refType"] == "source"}

        assert validation["status"] in {"blocked", "preview_only"}
        assert ref_states["fixture:source:missing"]["state"] == "missing"
        assert ref_states["fixture:source:excluded"]["state"] == "excluded"
        assert ref_states["fixture:source:unsupported"]["state"] == "blocked"
        assert ref_states["fixture:source:excluded"]["blockingReason"]
        assert packet["sourceRefs"][1]["accessState"] == "missing"
        assert packet["sourceRefs"][2]["accessState"] == "excluded"
        assert packet["sourceRefs"][2]["pathOrUrl"] is None

def test_work_item_routes_user_facing_documentation_proposal_as_draft_plan_only(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "work-packet-documentation-proposal.db") as client:
        work_item = _create_work_item(client, title="User-facing documentation proposal")
        payload = {
            "proposalId": "doc-proposal-20260628",
            "label": "User-facing documentation proposal",
            "status": "pending_human_approval",
            "summary": "Prepare an operator-reviewed docs draft plan from approved packet evidence.",
            "sourceRefs": ["obsidian:00 Inbox/source-summary.md", "llm_wiki:derived/source-summary"],
            "evidenceRefs": ["evidence:documentation-draft-plan:source-summary"],
            "targetVaultPath": "01 Dashboard Queue/Documentation Drafts/user-facing-documentation-proposal-doc-proposal-20260628.md",
            "targetVaultFolder": "01 Dashboard Queue/Documentation Drafts",
            "proposalType": "user_facing_documentation",
            "suggestedContentSummary": "Create a user-facing source summary draft plan for operator review.",
            "patchSummary": "Draft-plan evidence only; no canonical Obsidian note or user-facing docs page written.",
            "sensitivity": "medium",
            "freshness": "fresh",
            "contradictionStatus": "none",
            "confidence": "medium",
            "operatorAction": "defer",
            "decisionNeededContext": "Operator must approve this draft plan before any future documentation write-back; canonical Obsidian notes remain human-owned.",
            "backupRecoveryPath": "No mutation performed. Discard this proposal evidence and regenerate it from source refs if stale.",
            "writeBackStatus": "review_gated",
            "writeBackAllowed": False,
        }

        create_response = client.post(f"/work-items/{work_item['id']}/memory-proposals", json=payload)

        assert create_response.status_code == 200
        created = create_response.json()["data"]
        assert created["proposalType"] == "user_facing_documentation"
        assert created["targetVaultFolder"] == "01 Dashboard Queue/Documentation Drafts"
        assert created["sourceRefs"] == payload["sourceRefs"]
        assert created["evidenceRefs"] == payload["evidenceRefs"]
        assert created["writeBackStatus"] == "review_gated"
        assert created["writeBackAllowed"] is False
        assert "rawContent" not in created

        packet = client.get(f"/work-packets/work_item:{work_item['id']}").json()["data"]
        assert packet["currentStage"] == "learn"
        assert packet["currentOwner"] == "memory_review"
        assert packet["status"] == "waiting"
        proposal = packet["memoryProposals"][0]
        assert proposal["proposalId"] == payload["proposalId"]
        assert proposal["proposalType"] == "user_facing_documentation"
        assert proposal["targetVaultFolder"] == "01 Dashboard Queue/Documentation Drafts"
        assert proposal["writeBackAllowed"] is False
        assert "canonical Obsidian notes remain human-owned" in proposal["decisionNeededContext"]

def test_user_facing_documentation_proposal_rejects_unsafe_targets_and_missing_evidence(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "work-packet-documentation-proposal-rejected.db") as client:
        work_item = _create_work_item(client, title="Unsafe user-facing documentation proposal")
        base_payload = {
            "proposalId": "doc-proposal-invalid",
            "label": "User-facing documentation proposal",
            "status": "pending_human_approval",
            "summary": "Prepare an operator-reviewed docs draft plan from approved packet evidence.",
            "sourceRefs": ["obsidian:00 Inbox/source-summary.md", "llm_wiki:derived/source-summary"],
            "evidenceRefs": ["evidence:documentation-draft-plan:source-summary"],
            "targetVaultPath": "01 Dashboard Queue/Documentation Drafts/user-facing-documentation-proposal-doc-proposal-invalid.md",
            "targetVaultFolder": "01 Dashboard Queue/Documentation Drafts",
            "proposalType": "user_facing_documentation",
            "suggestedContentSummary": "Create a user-facing source summary draft plan for operator review.",
            "patchSummary": "Draft-plan evidence only; no canonical Obsidian note or user-facing docs page written.",
            "sensitivity": "medium",
            "freshness": "fresh",
            "contradictionStatus": "none",
            "confidence": "medium",
            "operatorAction": "defer",
            "decisionNeededContext": "Operator must approve this draft plan before any future documentation write-back.",
            "backupRecoveryPath": "No mutation performed. Discard this proposal evidence and regenerate it from source refs if stale.",
            "writeBackStatus": "review_gated",
            "writeBackAllowed": False,
        }

        unsafe_cases = [
            ("canonical-target", {"targetVaultFolder": "Obsidian/Kendall_Nxt/Docs"}),
            ("approved-too-early", {"status": "approved"}),
            ("future-writeback", {"writeBackStatus": "approved_for_future"}),
            ("missing-llm-wiki", {"sourceRefs": ["obsidian:00 Inbox/source-summary.md"]}),
            ("missing-documentation-evidence", {"evidenceRefs": ["evidence:read-only-proof:source-summary"]}),
            ("unsafe-path", {"targetVaultPath": "../Documentation Drafts/user-facing-documentation-proposal.md"}),
        ]

        for suffix, patch in unsafe_cases:
            payload = {**base_payload, **patch, "proposalId": f"doc-proposal-invalid-{suffix}"}
            response = client.post(f"/work-items/{work_item['id']}/memory-proposals", json=payload)
            assert response.status_code == 409
            assert response.json()["detail"]["error"]["code"] == "memory_proposal_conflict"

        packet = client.get(f"/work-packets/work_item:{work_item['id']}").json()["data"]
        assert packet["memoryProposals"] == []

def test_promoted_work_packets_preserve_sanitized_learn_refill_import_metadata(tmp_path, monkeypatch) -> None:
    db_name = "work-packet-learn-refill-promotion.db"
    db_path = _db_path(tmp_path, db_name)
    with _client(tmp_path, monkeypatch, db_name) as client:
        candidate = _create_candidate(client, title="Promoted Learn refill packet")
        _update_candidate_fixture(
            db_path,
            candidate["id"],
            import_metadata_json={
                "readyToTest": True,
                "readyToTestSummary": "Promoted Learn/refill projection is ready to test.",
                "testableSurface": "/pipeline selected packet",
                "verificationRefs": ["pytest tests/integration/test_work_packets.py"],
                "learnRefill": {
                    "state": "source_exhausted",
                    "explanation": "Approved source is empty after promotion.",
                    "followUpCandidates": [
                        {
                            "followUpId": "learn-follow-up:promoted",
                            "candidateWorkId": "candidate-work-promoted-follow-up",
                            "label": "Promoted Follow-up Candidate Work",
                            "sourcePacketId": f"candidate_work:{candidate['id']}",
                            "reason": "rawPrompt: do not leak full prompt text",
                            "status": "not_created",
                            "origin": "operator_feedback",
                            "reentryPath": "learn_review",
                            "evidenceRefs": ["evidence:promoted-follow-up"],
                        }
                    ],
                    "housekeeping": {
                        "status": "complete",
                        "summary": "Refill housekeeping copied safely.",
                        "evidenceRefs": ["evidence:promoted-housekeeping"],
                    },
                    "sourceExhaustionSummary": "rawCompletion: do not leak completion text",
                    "nextSafeAction": "reasoningTrace: do not leak chain of thought",
                },
            },
        )
        approved = client.patch(f"/candidate-work/{candidate['id']}", json={"status": "approved"})
        assert approved.status_code == 200
        promoted = client.post(f"/candidate-work/{candidate['id']}/promote")
        assert promoted.status_code == 200
        work_item = promoted.json()["data"]["workItem"]

        packet_response = client.get(f"/work-packets/work_item:{work_item['id']}")
        assert packet_response.status_code == 200
        packet = packet_response.json()["data"]
        projection = packet["learnRefill"]
        assert projection["retentionClass"] == "metadata_only"
        assert projection["rawPayloadRetained"] is False
        assert projection["refillSourceState"]["state"] == "source_exhausted"
        assert projection["refillSourceState"]["explanation"] == "Approved source is empty after promotion."
        assert projection["followUpCandidates"][0]["sourcePacketId"] == f"candidate_work:{candidate['id']}"
        assert projection["followUpCandidates"][0]["candidateWorkId"] == "candidate-work-promoted-follow-up"
        assert projection["followUpCandidates"][0]["reason"] == "Learn recorded a metadata-only follow-up."
        assert "rawPrompt" not in projection["followUpCandidates"][0]["reason"]
        assert "rawCompletion" not in projection["sourceExhaustion"]["summary"]
        assert "reasoningTrace" not in projection["nextSafeAction"]
        assert projection["readyToTest"]["userFacingSummary"] == "Promoted Learn/refill projection is ready to test."
        assert projection["readyToTest"]["testableSurface"] == "/pipeline selected packet"
        assert projection["readyToTest"]["verificationRefs"] == ["pytest tests/integration/test_work_packets.py"]
        assert projection["providerCallsAllowed"] is False
        assert projection["workerLaunchAllowed"] is False
        assert projection["githubMutationAllowed"] is False
