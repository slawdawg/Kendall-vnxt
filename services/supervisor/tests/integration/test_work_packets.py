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


def _update_workflow_event_fixture(db_path: str, event_id: str, **fields: object) -> None:
    assignments = []
    values = []
    for key, value in fields.items():
        assignments.append(f"{key} = ?")
        values.append(json.dumps(value) if key == "payload" else value)
    values.append(event_id)
    with sqlite3.connect(db_path) as conn:
        conn.execute(f"update workflow_events set {', '.join(assignments)} where id = ?", values)
        conn.commit()


def _sqlite_table_columns(db_path: str, table_name: str) -> set[str]:
    with sqlite3.connect(db_path) as conn:
        return {row[1] for row in conn.execute(f"pragma table_info({table_name})").fetchall()}


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
        assert candidate_packet["transitionEvents"] == []
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
        same_timestamp = "2026-06-28 00:00:00.000000"
        planned_event = next(event for event in before_events if event["eventType"] == "execution_attempt.planned")
        failed_event = next(event for event in before_events if event["eventType"] == "execution_attempt.failed")
        _update_workflow_event_fixture(db_path, planned_event["id"], created_at=same_timestamp)
        _update_workflow_event_fixture(db_path, failed_event["id"], created_at=same_timestamp)
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
        transition_events = packet["transitionEvents"]
        assert transition_events
        event_types = [transition["eventType"] for transition in transition_events]
        assert "execution_attempt.planned" in event_types
        assert "execution_attempt.failed" in event_types
        durable_event_ids = {f"event:{event['id']}" for event in before_events}
        failed_transition = next(transition for transition in transition_events if transition["eventType"] == "execution_attempt.failed")
        assert event_types.index("execution_attempt.planned") < event_types.index("execution_attempt.failed")
        assert failed_transition["sourceStage"] == "shape"
        assert failed_transition["sourceOwner"] == "kendall"
        assert failed_transition["sourceStatus"] == "waiting"
        assert failed_transition["targetStage"] == "execute"
        assert failed_transition["targetOwner"] == "blocked"
        assert failed_transition["targetStatus"] == "failed"
        assert failed_transition["sourceEventId"] in {event["id"] for event in before_events}
        assert failed_transition["evidenceRefs"][0] in durable_event_ids
        assert f"attempt:{attempt['attemptId']}" in failed_transition["evidenceRefs"]
        assert failed_transition["durable"] is True
        assert all("workspaceIsolationPlan" not in transition for transition in transition_events)
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
