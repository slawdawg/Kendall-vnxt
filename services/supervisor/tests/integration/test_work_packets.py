import json
import os
import sqlite3
import sys
from pathlib import Path
from asyncio import run as asyncio_run
from concurrent.futures import ThreadPoolExecutor

import pytest
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
        "refId": "prd:_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-pipeline-execution-loop-reliability/prd.md",
        "sourceType": "prd",
        "pathOrUrl": "_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-pipeline-execution-loop-reliability/prd.md",
        "title": "Pipeline execution loop reliability",
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
        terminal_scrollback_summary_response = client.post(
            "/pipeline-control-plane/work-packets",
            json={
                "packetId": "packet-terminal-scrollback-summary",
                "title": "Terminal scrollback summary should be blocked",
                "sourceRef": source_ref,
                "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                "payloadSummary": "terminal scrollback retained in lifecycle metadata",
                "evidenceRefs": ["story:terminal-scrollback"],
            },
        )
        assert terminal_scrollback_summary_response.status_code == 400
        for index, marker in enumerate(
            [
                "raw prompts",
                "raw completion",
                "provider payloads",
                "reasoning traces",
                "secret_key",
                "credential_id",
                "terminal scrollbacks",
                "tmux_scrollback",
                "pane scrollback",
                "raw transcript",
            ]
        ):
            unsafe_create_summary_response = client.post(
                "/pipeline-control-plane/work-packets",
                json={
                    "packetId": f"packet-unsafe-create-summary-{index}",
                    "title": "Unsafe create summary should be blocked",
                    "sourceRef": source_ref,
                    "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                    "payloadSummary": f"{marker} retained in lifecycle metadata",
                    "evidenceRefs": [f"story:unsafe-create-summary-{index}"],
                },
            )
            assert unsafe_create_summary_response.status_code == 400
            unsafe_transition_summary_response = client.post(
                "/pipeline-control-plane/work-packets/packet-story-1-1/transitions",
                json={
                    "targetStage": "classify",
                    "expectedCurrentEventId": current_event_id,
                    "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                    "payloadSummary": f"{marker} retained in lifecycle metadata",
                    "evidenceRefs": [f"story:unsafe-transition-summary-{index}"],
                },
            )
            assert unsafe_transition_summary_response.status_code == 400
            unsafe_transition_ref_response = client.post(
                "/pipeline-control-plane/work-packets/packet-story-1-1/transitions",
                json={
                    "targetStage": "classify",
                    "expectedCurrentEventId": current_event_id,
                    "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                    "payloadSummary": "Unsafe transition evidence ref should be blocked.",
                    "evidenceRefs": [f"evidence:{marker.replace(' ', '-')}"],
                },
            )
            assert unsafe_transition_ref_response.status_code == 400
        after_unsafe_response = client.get("/pipeline-control-plane/work-packets/packet-story-1-1")
        assert after_unsafe_response.status_code == 200
        assert after_unsafe_response.json()["data"]["currentEventId"] == current_event_id
        assert len(after_unsafe_response.json()["data"]["history"]) == 1

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
        blocked_tmux_ref_response = client.post(
            "/pipeline-control-plane/work-packets/packet-story-1-1/transitions",
            json={
                "targetStage": "capture",
                "expectedCurrentEventId": latest["currentEventId"],
                "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                "payloadSummary": "Tmux evidence ref should not be accepted.",
                "evidenceRefs": ["tmux-pane-scrollback:do-not-store"],
            },
        )
        assert blocked_tmux_ref_response.status_code == 400

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


def test_authoritative_work_packet_multi_stage_movement_proves_live_projection(tmp_path, monkeypatch) -> None:
    db_name = "authoritative-work-packet-multi-stage-movement.db"
    db_path = _db_path(tmp_path, db_name)
    source_ref = {
        "refId": "prd:_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-pipeline-execution-loop-reliability/prd.md",
        "sourceType": "prd",
        "pathOrUrl": "_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-pipeline-execution-loop-reliability/prd.md",
        "title": "Pipeline execution loop reliability",
    }
    representative_path = ["capture", "classify", "route", "shape", "needs_approval", "execute", "review"]
    proof_refs = ["story:1-4", "story:5-1", "proof:multi-stage-backend-movement", "proof:representative-execution-loop"]

    with _client(tmp_path, monkeypatch, db_name) as client:
        create_response = client.post(
            "/pipeline-control-plane/work-packets",
            json={
                "packetId": "packet-story-1-4-multi-stage-proof",
                "title": "Multi-stage backend movement proof",
                "initialStage": "capture",
                "status": "waiting",
                "truthLabel": "source_owned",
                "sourceRef": source_ref,
                "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                "idempotencyKey": "story-1-4-create-multi-stage-proof",
                "payloadSummary": "Created from the authoritative pipeline execution-loop PRD.",
                "evidenceRefs": [*proof_refs, "stage:capture"],
            },
        )
        assert create_response.status_code == 200
        current_event_id = create_response.json()["data"]["currentEventId"]
        transition_event_ids = []
        for previous_stage, target_stage in zip(representative_path, representative_path[1:]):
            transition_response = client.post(
                "/pipeline-control-plane/work-packets/packet-story-1-4-multi-stage-proof/transitions",
                json={
                    "targetStage": target_stage,
                    "expectedCurrentEventId": current_event_id,
                    "status": "active",
                    "truthLabel": "source_owned",
                    "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                    "idempotencyKey": f"story-1-4-transition-{target_stage}",
                    "causationId": current_event_id,
                    "payloadSummary": f"Accepted transition from {previous_stage} to {target_stage}.",
                    "evidenceRefs": [*proof_refs, f"stage:{target_stage}"],
                },
            )
            assert transition_response.status_code == 200
            transition_packet = transition_response.json()["data"]
            current_event_id = transition_packet["currentEventId"]
            transition_event_ids.append(current_event_id)
        assert transition_event_ids

    with _client(tmp_path, monkeypatch, db_name) as restarted_client:
        refreshed_response = restarted_client.get("/pipeline-control-plane/work-packets/packet-story-1-4-multi-stage-proof")
        assert refreshed_response.status_code == 200
        refreshed = refreshed_response.json()["data"]
        assert refreshed["currentStage"] == "review"
        assert refreshed["status"] == "active"
        assert refreshed["currentEventId"] == transition_event_ids[-1]
        assert [event["targetStage"] for event in refreshed["history"]] == representative_path
        assert [event["eventType"] for event in refreshed["history"]] == ["packet.created", *(["packet.stage_transitioned"] * 6)]
        assert [event["previousStage"] for event in refreshed["history"][1:]] == representative_path[:-1]
        assert all(event["sourceRef"] == source_ref for event in refreshed["history"])
        assert all(event["metadataOnly"] is True for event in refreshed["history"])
        assert all(event["payloadSummary"] and len(event["payloadSummary"]) <= 500 for event in refreshed["history"])

        projection_response = restarted_client.get("/pipeline-control-plane/projection")
        assert projection_response.status_code == 200
        projection = projection_response.json()["data"]
        assert projection["sourceLabel"] == "live"
        assert projection["freshnessState"] == "live"
        assert projection["fixtureMode"]["enabled"] is False
        assert projection["fixtureMode"]["canSatisfyLiveProof"] is False
        assert projection["backendReachability"]["state"] == "reachable"
        assert projection["truthSummary"]["fixtureBacked"] is False
        assert projection["truthSummary"]["stale"] is False
        projected_packet = next(packet for packet in projection["workPackets"] if packet["packetId"] == "packet-story-1-4-multi-stage-proof")
        selected_detail = next(detail for detail in projection["selectedPacketDetails"] if detail["packetId"] == "packet-story-1-4-multi-stage-proof")
        assert projected_packet["currentStage"] == "review"
        assert projected_packet["status"] == "active"
        assert projected_packet["truthLabel"] == "live"
        assert projected_packet["sourceRef"] == source_ref
        assert projected_packet["metadataOnly"] is True
        assert selected_detail["currentStage"] == "review"
        assert selected_detail["status"] == "active"
        assert selected_detail["truthLabel"] == "live"
        assert selected_detail["sourceRefs"] == [source_ref]
        assert selected_detail["latestTransitionEventRef"] == f"event:{transition_event_ids[-1]}"
        assert selected_detail["recentTransitionEventRefs"] == [f"event:{event_id}" for event_id in transition_event_ids[-5:]]
        assert selected_detail["latestMovementSummary"] == "Accepted transition from execute to review."
        assert selected_detail["canSatisfyLiveMovementProof"] is True
        assert selected_detail["metadataOnly"] is True
        for evidence_ref in [
            "proof:multi-stage-backend-movement",
            "proof:representative-execution-loop",
            "stage:capture",
            "stage:route",
            "stage:execute",
            "stage:review",
            "story:1-4",
            "story:5-1",
        ]:
            assert evidence_ref in selected_detail["evidenceRefs"]
            assert evidence_ref in projection["evidenceRefs"]
        retained_text = " ".join(
            [
                *selected_detail["evidenceRefs"],
                *projection["evidenceRefs"],
                *(event["payloadSummary"] for event in refreshed["history"]),
            ]
        ).lower()
        for unsafe_marker in [
            "raw prompt",
            "raw completion",
            "provider payload",
            "reasoning trace",
            "secret",
            "credential",
            "terminal scrollback",
            "tmux scrollback",
            "pane scrollback",
            "raw transcript",
        ]:
            assert unsafe_marker not in retained_text

        same_stage_review_response = restarted_client.post(
            "/pipeline-control-plane/work-packets/packet-story-1-4-multi-stage-proof/transitions",
            json={
                "targetStage": "review",
                "expectedCurrentEventId": current_event_id,
                "status": "blocked",
                "truthLabel": "source_owned",
                "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                "idempotencyKey": "story-1-4-transition-review-same-stage",
                "causationId": current_event_id,
                "payloadSummary": "Review remains blocked without counting as a new movement event.",
                "evidenceRefs": [*proof_refs, "stage:review-blocked"],
            },
        )
        assert same_stage_review_response.status_code == 200
        current_event_id = same_stage_review_response.json()["data"]["currentEventId"]
        same_stage_projection_response = restarted_client.get("/pipeline-control-plane/projection")
        assert same_stage_projection_response.status_code == 200
        same_stage_projection = same_stage_projection_response.json()["data"]
        same_stage_detail = next(detail for detail in same_stage_projection["selectedPacketDetails"] if detail["packetId"] == "packet-story-1-4-multi-stage-proof")
        assert same_stage_detail["currentStage"] == "review"
        assert same_stage_detail["status"] == "blocked"
        assert same_stage_detail["latestTransitionEventRef"] == f"event:{transition_event_ids[-1]}"
        assert same_stage_detail["latestMovementSummary"] == "Accepted transition from execute to review."
        assert same_stage_detail["canSatisfyLiveMovementProof"] is True

        for previous_stage, target_stage in [("review", "promote"), ("promote", "deliver"), ("deliver", "learn")]:
            terminal_transition_response = restarted_client.post(
                "/pipeline-control-plane/work-packets/packet-story-1-4-multi-stage-proof/transitions",
                json={
                    "targetStage": target_stage,
                    "expectedCurrentEventId": current_event_id,
                    "status": "active",
                    "truthLabel": "source_owned",
                    "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                    "idempotencyKey": f"story-1-4-transition-terminal-{target_stage}",
                    "causationId": current_event_id,
                    "payloadSummary": f"Accepted transition from {previous_stage} to {target_stage}.",
                    "evidenceRefs": [*proof_refs, f"stage:{target_stage}"],
                },
            )
            assert terminal_transition_response.status_code == 200
            current_event_id = terminal_transition_response.json()["data"]["currentEventId"]

        terminal_projection_response = restarted_client.get("/pipeline-control-plane/projection")
        assert terminal_projection_response.status_code == 200
        terminal_projection = terminal_projection_response.json()["data"]
        terminal_detail = next(detail for detail in terminal_projection["selectedPacketDetails"] if detail["packetId"] == "packet-story-1-4-multi-stage-proof")
        assert terminal_detail["currentStage"] == "learn"
        assert terminal_detail["latestTransitionEventRef"] == f"event:{current_event_id}"
        assert terminal_detail["canSatisfyLiveMovementProof"] is False

        with sqlite3.connect(db_path) as conn:
            conn.execute(
                "update authoritative_work_packet_lifecycle_events set payload_summary = ?, evidence_refs_json = ? where id = ?",
                (
                    "raw transcript and secret_key from old retained data should be redacted on projection.",
                    json.dumps(["story:1-4", "raw transcript:legacy", "secret_key:legacy"]),
                    current_event_id,
                ),
            )
            conn.commit()

        redacted_projection_response = restarted_client.get("/pipeline-control-plane/projection")
        assert redacted_projection_response.status_code == 200
        redacted_projection = redacted_projection_response.json()["data"]
        redacted_detail = next(detail for detail in redacted_projection["selectedPacketDetails"] if detail["packetId"] == "packet-story-1-4-multi-stage-proof")
        assert redacted_detail["latestMovementSummary"] == "Redacted metadata-only lifecycle summary."
        assert "raw transcript:legacy" not in redacted_detail["evidenceRefs"]
        assert "secret_key:legacy" not in redacted_detail["evidenceRefs"]
        assert "raw transcript:legacy" not in redacted_projection["evidenceRefs"]
        assert "secret_key:legacy" not in redacted_projection["evidenceRefs"]


def test_pipeline_dashboard_projection_returns_truthful_empty_and_live_packet_states(tmp_path, monkeypatch) -> None:
    db_name = "pipeline-dashboard-projection.db"
    source_ref = {
        "refId": "prd:_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-pipeline-execution-loop-reliability/prd.md",
        "sourceType": "prd",
        "pathOrUrl": "_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-pipeline-execution-loop-reliability/prd.md",
        "title": "Pipeline execution loop reliability",
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
            "sourceStates",
            "workPackets",
            "selectedPacketDetails",
            "managerSummary",
            "workerSummary",
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
        assert empty_projection["sourceStates"] == []
        assert empty_projection["managerSummary"]["stateSource"] == "supervisor_projection"
        assert empty_projection["managerSummary"]["reliabilityState"] == "healthy_idle"
        assert empty_projection["managerSummary"]["freshnessState"] == "live"
        assert empty_projection["managerSummary"]["activeLeaseCount"] is None
        assert empty_projection["managerSummary"]["activeWorkerCount"] is None
        assert empty_projection["managerSummary"]["warmWorkerCount"] is None
        assert empty_projection["managerSummary"]["healthySourceCount"] == 0
        assert empty_projection["managerSummary"]["exhaustedSourceCount"] == 0
        assert empty_projection["managerSummary"]["unknownSourceCount"] == 0
        assert empty_projection["managerSummary"]["inactivityReason"] == "healthy_empty"
        assert empty_projection["managerSummary"]["evidenceRefs"] == []
        assert empty_projection["workerSummary"]["stateSource"] == "unknown"
        assert empty_projection["workerSummary"]["freshnessState"] == "unknown"
        assert empty_projection["workerSummary"]["warmCount"] is None
        assert empty_projection["workerSummary"]["activeCount"] is None
        assert empty_projection["workerSummary"]["workerRefs"] == []
        assert empty_projection["workerSummary"]["evidenceRefs"] == []
        assert empty_projection["reliabilityProblems"] == []
        assert empty_projection["queueSummary"]["emptyReason"] == "healthy_empty"
        assert empty_projection["queueSummary"]["dispatchableCount"] == 0
        assert empty_projection["queueSummary"]["blockedCount"] == 0
        assert empty_projection["queueSummary"]["gatedCount"] == 0
        assert empty_projection["queueSummary"]["closedCount"] == 0
        assert empty_projection["queueSummary"]["staleCount"] == 0
        assert empty_projection["queueSummary"]["refillingCount"] == 0
        assert empty_projection["queueSummary"]["unknownCount"] == 0
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
        transition_response = client.post(
            "/pipeline-control-plane/work-packets/packet-story-2-4-real-proof/transitions",
            json={
                "targetStage": "review",
                "expectedCurrentEventId": create_response.json()["data"]["currentEventId"],
                "status": "active",
                "truthLabel": "source_owned",
                "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                "idempotencyKey": "projection-transition-story-1-3-review",
                "payloadSummary": "Accepted transition to review for live movement proof.",
                "evidenceRefs": ["event:review", "story:1-3"],
            },
        )
        assert transition_response.status_code == 200
        review_event_ref = f"event:{transition_response.json()['data']['currentEventId']}"

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
        assert projection["evidenceRefs"] == ["event:review", "proof:pipeline-real-workpacket", "story:1-3", "story:2-4"]
        assert projection["queueSummary"]["activeCount"] == 1
        assert projection["queueSummary"]["dispatchableCount"] == 0
        assert projection["queueSummary"]["blockedCount"] == 0
        assert projection["queueSummary"]["gatedCount"] == 0
        assert projection["queueSummary"]["closedCount"] == 0
        assert projection["queueSummary"]["staleCount"] == 0
        assert projection["queueSummary"]["refillingCount"] == 0
        assert projection["queueSummary"]["unknownCount"] == 0
        assert projection["managerSummary"]["stateSource"] == "supervisor_projection"
        assert projection["managerSummary"]["reliabilityState"] == "running"
        assert projection["managerSummary"]["freshnessState"] == "live"
        assert projection["managerSummary"]["activeLeaseCount"] is None
        assert projection["managerSummary"]["activeWorkerCount"] is None
        assert projection["managerSummary"]["warmWorkerCount"] is None
        assert projection["managerSummary"]["dispatchableQueueCount"] == 0
        assert projection["managerSummary"]["healthySourceCount"] == 1
        assert projection["managerSummary"]["exhaustedSourceCount"] == 0
        assert projection["managerSummary"]["unknownSourceCount"] == 0
        assert projection["managerSummary"]["inactivityReason"] is None
        assert projection["managerSummary"]["evidenceRefs"] == ["event:review", "proof:pipeline-real-workpacket", "story:1-3", "story:2-4"]
        assert {packet["packetId"] for packet in projection["workPackets"]} == {detail["packetId"] for detail in projection["selectedPacketDetails"]}
        projected_packet = next(packet for packet in projection["workPackets"] if packet["packetId"] == "packet-story-2-4-real-proof")
        assert projected_packet["title"] == "Projection packet"
        assert projected_packet["currentStage"] == "review"
        assert projected_packet["status"] == "active"
        assert projected_packet["truthLabel"] == "live"
        assert projected_packet["sourceRef"] == source_ref
        assert projected_packet["blocker"] is None
        assert projected_packet["nextAction"] == "Advance toward Promote."
        assert projected_packet["evidenceRefs"] == ["event:review", "proof:pipeline-real-workpacket", "story:1-3", "story:2-4"]
        assert projected_packet["metadataOnly"] is True
        selected_detail = next(detail for detail in projection["selectedPacketDetails"] if detail["packetId"] == "packet-story-2-4-real-proof")
        assert selected_detail["sourceRefs"] == [source_ref]
        assert selected_detail["evidenceRefs"] == ["event:review", "proof:pipeline-real-workpacket", "story:1-3", "story:2-4"]
        assert selected_detail["currentStage"] == "review"
        assert selected_detail["status"] == "active"
        assert selected_detail["truthLabel"] == "live"
        assert selected_detail["latestTransitionEventRef"] == review_event_ref
        assert selected_detail["recentTransitionEventRefs"] == [review_event_ref]
        assert selected_detail["latestMovementSummary"] == "Accepted transition to review for live movement proof."
        assert selected_detail["canSatisfyLiveMovementProof"] is True
        assert selected_detail["blocker"] is None
        assert selected_detail["nextAction"] == "Advance toward Promote."
        assert selected_detail["metadataOnly"] is True
        review_summary = next(stage for stage in projection["stageSummaries"] if stage["stage"] == "review")
        assert review_summary["packetCount"] == 1
        assert review_summary["sourceLabel"] == "live"
        assert review_summary["freshnessState"] == "live"

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
        assert refreshed_detail["evidenceRefs"] == ["event:review", "proof:pipeline-real-workpacket", "story:1-3", "story:2-4"]
        assert refreshed_detail["latestTransitionEventRef"] == review_event_ref
        assert refreshed_detail["canSatisfyLiveMovementProof"] is True
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
        same_stage_response = client.post(
            "/pipeline-control-plane/work-packets/packet-story-2-4-fresh/transitions",
            json={
                "targetStage": "route",
                "expectedCurrentEventId": fresh_create_response.json()["data"]["currentEventId"],
                "status": "waiting",
                "truthLabel": "source_owned",
                "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                "idempotencyKey": "projection-transition-story-1-3-same-stage",
                "payloadSummary": "Same-stage refresh should not satisfy live movement proof.",
                "evidenceRefs": ["event:same-stage", "story:1-3"],
            },
        )
        assert same_stage_response.status_code == 200
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
        assert mixed_projection["queueSummary"]["activeCount"] == 1
        assert mixed_projection["queueSummary"]["dispatchableCount"] == 1
        assert mixed_projection["queueSummary"]["gatedCount"] == 1
        assert mixed_projection["queueSummary"]["closedCount"] == 0
        assert mixed_projection["queueSummary"]["staleCount"] == 0
        assert mixed_projection["queueSummary"]["refillingCount"] == 0
        assert mixed_projection["queueSummary"]["unknownCount"] == 0
        assert mixed_projection["managerSummary"]["dispatchableQueueCount"] == 1
        assert mixed_projection["managerSummary"]["reliabilityState"] == "running"
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
        assert mixed_fresh_detail["latestTransitionEventRef"] is None
        assert mixed_fresh_detail["recentTransitionEventRefs"] == []
        assert mixed_fresh_detail["latestMovementSummary"] is None
        assert mixed_fresh_detail["canSatisfyLiveMovementProof"] is False
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
        assert blocked_projection["queueSummary"]["gatedCount"] == 1
        assert blocked_projection["managerSummary"]["inactivityReason"] == "blocked"
        assert blocked_projection["managerSummary"]["reliabilityState"] == "blocked"

        with sqlite3.connect(_db_path(tmp_path, db_name)) as conn:
            conn.execute("update authoritative_work_packets set updated_at = CURRENT_TIMESTAMP where id in (?, ?)", ("packet-story-2-4-real-proof", "packet-story-2-4-fresh"))
            conn.commit()

        fresh_blocked_response = client.get("/pipeline-control-plane/projection")
        assert fresh_blocked_response.status_code == 200
        fresh_blocked_projection = fresh_blocked_response.json()["data"]
        assert fresh_blocked_projection["sourceLabel"] == "live"
        assert fresh_blocked_projection["queueSummary"]["dispatchableCount"] == 0
        assert fresh_blocked_projection["queueSummary"]["blockedCount"] == 2
        assert fresh_blocked_projection["queueSummary"]["gatedCount"] == 1
        assert fresh_blocked_projection["managerSummary"]["inactivityReason"] == "blocked"
        assert fresh_blocked_projection["managerSummary"]["reliabilityState"] == "blocked"
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
        assert failed_projection["queueSummary"]["gatedCount"] == 1
        assert failed_projection["queueSummary"]["closedCount"] == 0
        assert failed_projection["queueSummary"]["emptyReason"] == "blocked"
        failed_packet = next(packet for packet in failed_projection["workPackets"] if packet["packetId"] == "packet-story-2-4-real-proof")
        failed_detail = next(detail for detail in failed_projection["selectedPacketDetails"] if detail["packetId"] == "packet-story-2-4-real-proof")
        assert failed_packet["blocker"] == "Packet status is failed."
        assert failed_detail["latestTransitionEventRef"] == review_event_ref
        assert failed_detail["canSatisfyLiveMovementProof"] is False

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

        closed_no_source_exhaustion_response = client.get("/pipeline-control-plane/projection")
        assert closed_no_source_exhaustion_response.status_code == 200
        closed_no_source_exhaustion_projection = closed_no_source_exhaustion_response.json()["data"]
        assert closed_no_source_exhaustion_projection["sourceLabel"] == "live"
        assert closed_no_source_exhaustion_projection["freshnessState"] == "live"
        assert closed_no_source_exhaustion_projection["truthSummary"]["backendEmpty"] is False
        assert len(closed_no_source_exhaustion_projection["workPackets"]) == 3
        assert closed_no_source_exhaustion_projection["queueSummary"]["dispatchableCount"] == 0
        assert closed_no_source_exhaustion_projection["queueSummary"]["blockedCount"] == 0
        assert closed_no_source_exhaustion_projection["queueSummary"]["gatedCount"] == 0
        assert closed_no_source_exhaustion_projection["queueSummary"]["closedCount"] == 3
        assert closed_no_source_exhaustion_projection["queueSummary"]["staleCount"] == 0
        assert closed_no_source_exhaustion_projection["queueSummary"]["refillingCount"] == 0
        assert closed_no_source_exhaustion_projection["queueSummary"]["unknownCount"] == 0
        assert closed_no_source_exhaustion_projection["queueSummary"]["emptyReason"] == "unknown"
        assert closed_no_source_exhaustion_projection["queueSummary"]["sourceExhausted"] is False
        assert closed_no_source_exhaustion_projection["managerSummary"]["inactivityReason"] == "unknown"
        assert closed_no_source_exhaustion_projection["managerSummary"]["reliabilityState"] == "unknown"
        assert closed_no_source_exhaustion_projection["managerSummary"]["sourceExhausted"] is False
        assert closed_no_source_exhaustion_projection["managerSummary"]["dispatchableQueueCount"] == 0
        assert closed_no_source_exhaustion_projection["managerSummary"]["blockedQueueCount"] == 0
        assert closed_no_source_exhaustion_projection["managerSummary"]["closedQueueCount"] == 3
        assert closed_no_source_exhaustion_projection["sourceStates"]
        assert all(source_state["state"] != "exhausted" for source_state in closed_no_source_exhaustion_projection["sourceStates"])
        complete_detail = next(detail for detail in closed_no_source_exhaustion_projection["selectedPacketDetails"] if detail["packetId"] == "packet-story-2-4-real-proof")
        assert complete_detail["latestTransitionEventRef"] == review_event_ref
        assert complete_detail["canSatisfyLiveMovementProof"] is False

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
        assert unavailable_projection["managerSummary"]["reliabilityState"] == "unavailable"
        assert unavailable_projection["managerSummary"]["activeLeaseCount"] is None
        assert unavailable_projection["managerSummary"]["dispatchableQueueCount"] is None
        assert unavailable_projection["managerSummary"]["healthySourceCount"] is None
        assert unavailable_projection["managerSummary"]["unknownSourceCount"] is None
        assert unavailable_projection["managerSummary"]["evidenceRefs"] == []
        assert unavailable_projection["workerSummary"]["stateSource"] == "unavailable"
        assert unavailable_projection["workerSummary"]["freshnessState"] == "unavailable"
        assert unavailable_projection["workerSummary"]["warmCount"] is None
        assert unavailable_projection["workerSummary"]["evidenceRefs"] == []
        assert unavailable_projection["reliabilityProblems"] == []
        assert unavailable_projection["queueSummary"]["emptyReason"] == "backend_unavailable"
        assert unavailable_projection["queueSummary"]["dispatchableCount"] is None


def test_pipeline_dashboard_projection_proves_zero_packet_source_exhaustion(tmp_path, monkeypatch) -> None:
    db_name = "pipeline-dashboard-zero-packet-source-exhausted.db"
    db_path = _db_path(tmp_path, db_name)
    with _client(tmp_path, monkeypatch, db_name) as client:
        no_record_response = client.get("/pipeline-control-plane/projection")
        assert no_record_response.status_code == 200
        no_record_projection = no_record_response.json()["data"]
        assert no_record_projection["workPackets"] == []
        assert no_record_projection["sourceStates"] == []
        assert no_record_projection["truthSummary"]["emptyReason"] == "healthy_empty"
        assert no_record_projection["queueSummary"]["sourceExhausted"] is False
        assert no_record_projection["managerSummary"]["sourceExhausted"] is False

        no_evidence_response = client.post(
            "/candidate-work",
            json={
                "title": "No-evidence source-state-only record",
                "requestedOutcome": "Record source exhaustion metadata without creating visible pipeline work.",
                "source": "operator",
                "sourceArtifactPath": "docs/operator-note.md",
                "sourceArtifactType": "manual_note",
                "riskLevel": "low",
                "priority": "normal",
                "importMetadata": {
                    "projectionVisibility": "source_state_only",
                    "pipelineSourceState": {
                        "sourceId": "prd:pipeline:empty:no-evidence",
                        "sourceRef": "prd:pipeline:empty:no-evidence",
                        "sourceKind": "prd",
                        "state": "exhausted",
                        "summary": "Approved source is empty, but evidence is missing.",
                        "evidenceRefs": [],
                    },
                },
            },
        )
        assert no_evidence_response.status_code == 200
        no_evidence_projection_response = client.get("/pipeline-control-plane/projection")
        assert no_evidence_projection_response.status_code == 200
        no_evidence_projection = no_evidence_projection_response.json()["data"]
        assert no_evidence_projection["workPackets"] == []
        assert no_evidence_projection["sourceStates"] == []
        assert no_evidence_projection["truthSummary"]["emptyReason"] == "healthy_empty"
        assert no_evidence_projection["queueSummary"]["sourceExhausted"] is False

        exhausted_response = client.post(
            "/candidate-work",
            json={
                "title": "Source-state-only exhausted record",
                "requestedOutcome": "Record source exhaustion metadata without creating visible pipeline work.",
                "source": "operator",
                "sourceArtifactPath": "_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-pipeline-execution-loop-reliability/prd.md",
                "sourceArtifactType": "manual_note",
                "riskLevel": "low",
                "priority": "normal",
                "importMetadata": {
                    "projectionVisibility": "source_state_only",
                    "pipelineSourceState": {
                        "sourceId": "prd:pipeline-execution-loop-reliability",
                        "sourceRef": "prd:pipeline-execution-loop-reliability",
                        "sourceKind": "prd",
                        "state": "exhausted",
                        "summary": "Approved source work is exhausted after refill.",
                        "evidenceRefs": ["evidence:source-exhausted", "tmux-pane-scrollback:must-not-project"],
                    },
                },
            },
        )
        assert exhausted_response.status_code == 200

        projection_response = client.get("/pipeline-control-plane/projection")
        assert projection_response.status_code == 200
        projection = projection_response.json()["data"]
        assert projection["sourceLabel"] == "live"
        assert projection["freshnessState"] == "live"
        assert projection["workPackets"] == []
        assert projection["selectedPacketDetails"] == []
        assert projection["truthSummary"]["backendEmpty"] is True
        assert projection["truthSummary"]["emptyReason"] == "source_exhausted"
        assert projection["queueSummary"]["dispatchableCount"] == 0
        assert projection["queueSummary"]["sourceExhausted"] is True
        assert projection["queueSummary"]["emptyReason"] == "source_exhausted"
        assert projection["managerSummary"]["sourceExhausted"] is True
        assert projection["managerSummary"]["inactivityReason"] == "source_exhausted"
        assert projection["managerSummary"]["reliabilityState"] == "source_exhausted"
        assert projection["managerSummary"]["exhaustedSourceCount"] == 1
        assert projection["managerSummary"]["evidenceRefs"] == ["evidence:source-exhausted"]
        assert projection["evidenceRefs"] == ["evidence:source-exhausted"]
        assert "tmux-pane-scrollback:must-not-project" not in projection["evidenceRefs"]
        assert len(projection["sourceStates"]) == 1
        source_state = projection["sourceStates"][0]
        assert source_state["sourceId"] == "prd:pipeline-execution-loop-reliability"
        assert source_state["sourceRef"] == "prd:pipeline-execution-loop-reliability"
        assert source_state["sourceKind"] == "prd"
        assert source_state["state"] == "exhausted"
        assert source_state["summary"] == "Approved source work is exhausted after refill."
        assert source_state["evidenceRefs"] == ["evidence:source-exhausted"]
        assert source_state["metadataOnly"] is True
        candidate_response = client.get("/candidate-work")
        assert candidate_response.status_code == 200
        retained_candidate = next(candidate for candidate in candidate_response.json()["data"] if candidate["id"] == exhausted_response.json()["data"]["id"])
        retained_metadata_text = json.dumps(retained_candidate["importMetadata"])
        assert "tmux-pane-scrollback:must-not-project" not in retained_metadata_text

        _update_candidate_fixture(db_path, exhausted_response.json()["data"]["id"], updated_at="2026-07-04 00:00:00.000000")
        stale_projection_response = client.get("/pipeline-control-plane/projection")
        assert stale_projection_response.status_code == 200
        stale_projection = stale_projection_response.json()["data"]
        assert stale_projection["sourceLabel"] == "stale"
        assert stale_projection["freshnessState"] == "stale"
        assert stale_projection["truthSummary"]["emptyReason"] == "projection_stale"
        assert stale_projection["queueSummary"]["sourceExhausted"] is False
        assert stale_projection["managerSummary"]["sourceExhausted"] is False
        assert stale_projection["managerSummary"]["reliabilityState"] == "degraded"
        assert stale_projection["managerSummary"]["exhaustedSourceCount"] == 1

        approved_response = client.patch(f"/candidate-work/{exhausted_response.json()['data']['id']}", json={"status": "approved"})
        assert approved_response.status_code == 200
        promote_response = client.post(f"/candidate-work/{exhausted_response.json()['data']['id']}/promote")
        assert promote_response.status_code == 400
        assert "metadata-only Candidate Work cannot be promoted" in promote_response.text


def test_pipeline_dashboard_projection_uses_non_exhausted_source_state_only_reasons(tmp_path, monkeypatch) -> None:
    db_name = "pipeline-dashboard-zero-packet-source-state-reasons.db"
    with _client(tmp_path, monkeypatch, db_name) as client:
        blocked_response = client.post(
            "/candidate-work",
            json={
                "title": "Source-state-only blocked record",
                "requestedOutcome": "Record blocked source metadata without creating visible pipeline work.",
                "source": "operator",
                "sourceArtifactPath": "docs/operator-note.md",
                "sourceArtifactType": "manual_note",
                "riskLevel": "low",
                "priority": "normal",
                "importMetadata": {
                    "projectionVisibility": "source_state_only",
                    "pipelineSourceState": {
                        "sourceId": "manual:blocked-source",
                        "sourceRef": "manual:blocked-source",
                        "sourceKind": "bmad_story",
                        "state": "blocked",
                        "summary": "Source is blocked by operator-owned input.",
                        "evidenceRefs": ["evidence:blocked-source"],
                    },
                },
            },
        )
        assert blocked_response.status_code == 200
        blocked_projection_response = client.get("/pipeline-control-plane/projection")
        assert blocked_projection_response.status_code == 200
        blocked_projection = blocked_projection_response.json()["data"]
        assert blocked_projection["workPackets"] == []
        assert blocked_projection["sourceStates"][0]["state"] == "blocked"
        assert blocked_projection["sourceStates"][0]["sourceKind"] == "bmad_story"
        assert blocked_projection["queueSummary"]["blockedCount"] == 1
        assert blocked_projection["queueSummary"]["emptyReason"] == "blocked"
        assert blocked_projection["managerSummary"]["inactivityReason"] == "blocked"
        assert blocked_projection["managerSummary"]["reliabilityState"] == "blocked"
        assert blocked_projection["queueSummary"]["sourceExhausted"] is False

        rejected_response = client.patch(f"/candidate-work/{blocked_response.json()['data']['id']}", json={"status": "rejected"})
        assert rejected_response.status_code == 200
        rejected_projection_response = client.get("/pipeline-control-plane/projection")
        assert rejected_projection_response.status_code == 200
        rejected_projection = rejected_projection_response.json()["data"]
        assert rejected_projection["workPackets"] == []
        assert rejected_projection["sourceStates"] == []
        assert rejected_projection["queueSummary"]["blockedCount"] == 0
        assert rejected_projection["queueSummary"]["emptyReason"] == "healthy_empty"
        assert rejected_projection["managerSummary"]["reliabilityState"] == "healthy_idle"

    with _client(tmp_path, monkeypatch, "pipeline-dashboard-zero-packet-refilling-source.db") as client:
        refilling_response = client.post(
            "/candidate-work",
            json={
                "title": "Source-state-only refilling record",
                "requestedOutcome": "Record refilling source metadata without creating visible pipeline work.",
                "source": "operator",
                "sourceArtifactPath": "docs/operator-note.md",
                "sourceArtifactType": "manual_note",
                "riskLevel": "low",
                "priority": "normal",
                "importMetadata": {
                    "projectionVisibility": "source_state_only",
                    "pipelineSourceState": {
                        "sourceId": "manual:refilling-source",
                        "sourceRef": "manual:refilling-source",
                        "sourceKind": "manual",
                        "state": "refilling",
                        "summary": "Source refill is running.",
                        "evidenceRefs": ["evidence:refilling-source"],
                    },
                },
            },
        )
        assert refilling_response.status_code == 200
        refilling_projection_response = client.get("/pipeline-control-plane/projection")
        assert refilling_projection_response.status_code == 200
        refilling_projection = refilling_projection_response.json()["data"]
        assert refilling_projection["workPackets"] == []
        assert refilling_projection["sourceStates"][0]["state"] == "refilling"
        assert refilling_projection["queueSummary"]["refillingCount"] == 1
        assert refilling_projection["queueSummary"]["emptyReason"] == "refilling"
        assert refilling_projection["managerSummary"]["inactivityReason"] == "refilling"
        assert refilling_projection["managerSummary"]["reliabilityState"] == "refilling"
        assert refilling_projection["queueSummary"]["sourceExhausted"] is False


def test_pipeline_dashboard_projection_aggregates_worker_summary_only_metadata(tmp_path, monkeypatch) -> None:
    db_name = "pipeline-dashboard-worker-summary-only.db"
    db_path = _db_path(tmp_path, db_name)
    with _client(tmp_path, monkeypatch, db_name) as client:
        worker_response = client.post(
            "/candidate-work",
            json={
                "title": "Worker-summary-only metadata",
                "requestedOutcome": "Record worker reliability metadata without creating visible or dispatchable work.",
                "source": "operator",
                "sourceArtifactPath": "docs/operator-note.md",
                "sourceArtifactType": "manual_note",
                "riskLevel": "low",
                "priority": "normal",
                "importMetadata": {
                    "projectionVisibility": "worker_summary_only",
                    "pipelineWorkerState": {
                        "workerId": "codex-2",
                        "state": "stalled",
                        "summary": "Worker has not reported progress inside the expected window.",
                        "evidenceRefs": ["worker:codex-2", "tmux-pane-scrollback:must-not-project"],
                    },
                },
            },
        )
        assert worker_response.status_code == 200

        projection_response = client.get("/pipeline-control-plane/projection")
        assert projection_response.status_code == 200
        projection = projection_response.json()["data"]
        assert projection["workPackets"] == []
        assert projection["queueSummary"]["dispatchableCount"] == 0
        assert projection["queueSummary"]["emptyReason"] == "healthy_empty"
        assert projection["managerSummary"]["reliabilityState"] == "healthy_idle"
        assert projection["workerSummary"]["stateSource"] == "manager_summary"
        assert projection["workerSummary"]["freshnessState"] == "live"
        assert projection["workerSummary"]["warmCount"] == 0
        assert projection["workerSummary"]["activeCount"] == 0
        assert projection["workerSummary"]["stalledCount"] == 1
        assert projection["workerSummary"]["unknownCount"] == 0
        assert projection["workerSummary"]["workerRefs"] == ["worker:codex-2"]
        assert projection["workerSummary"]["evidenceRefs"] == ["worker:codex-2"]
        assert "tmux-pane-scrollback:must-not-project" not in projection["evidenceRefs"]
        candidate_response = client.get("/candidate-work")
        assert candidate_response.status_code == 200
        retained_candidate = next(candidate for candidate in candidate_response.json()["data"] if candidate["id"] == worker_response.json()["data"]["id"])
        retained_metadata_text = json.dumps(retained_candidate["importMetadata"])
        assert "tmux-pane-scrollback:must-not-project" not in retained_metadata_text

        invalid_response = client.post(
            "/candidate-work",
            json={
                "title": "Invalid anonymous worker metadata",
                "requestedOutcome": "Invalid worker metadata should not inflate worker counts.",
                "source": "operator",
                "sourceArtifactPath": "docs/operator-note.md",
                "sourceArtifactType": "manual_note",
                "riskLevel": "low",
                "priority": "normal",
                "importMetadata": {
                    "projectionVisibility": "worker_summary_only",
                    "pipelineWorkerState": {
                        "workerId": "rawPrompt-secret-worker",
                        "state": "active",
                        "evidenceRefs": ["terminal-output:must-not-project"],
                    },
                },
            },
        )
        assert invalid_response.status_code == 200
        invalid_candidate_response = client.get("/candidate-work")
        assert invalid_candidate_response.status_code == 200
        invalid_retained_candidate = next(candidate for candidate in invalid_candidate_response.json()["data"] if candidate["id"] == invalid_response.json()["data"]["id"])
        invalid_retained_metadata_text = json.dumps(invalid_retained_candidate["importMetadata"])
        assert "rawPrompt-secret-worker" not in invalid_retained_metadata_text

        duplicate_response = client.post(
            "/candidate-work",
            json={
                "title": "Duplicate worker metadata",
                "requestedOutcome": "Latest worker metadata should win for the same worker.",
                "source": "operator",
                "sourceArtifactPath": "docs/operator-note.md",
                "sourceArtifactType": "manual_note",
                "riskLevel": "low",
                "priority": "normal",
                "importMetadata": {
                    "projectionVisibility": "worker_summary_only",
                    "pipelineWorkerStates": [
                        {"workerId": "codex-3", "state": "warm", "evidenceRefs": ["worker:codex-3:warm"]},
                        {"workerId": "codex-3", "state": "active", "evidenceRefs": ["worker:codex-3:active"]},
                    ],
                },
            },
        )
        assert duplicate_response.status_code == 200

        deduped_projection_response = client.get("/pipeline-control-plane/projection")
        assert deduped_projection_response.status_code == 200
        deduped_projection = deduped_projection_response.json()["data"]
        assert deduped_projection["workerSummary"]["warmCount"] == 0
        assert deduped_projection["workerSummary"]["activeCount"] == 1
        assert deduped_projection["workerSummary"]["stalledCount"] == 1
        assert deduped_projection["workerSummary"]["unknownCount"] == 0
        assert deduped_projection["workerSummary"]["workerRefs"] == ["worker:codex-2", "worker:codex-3"]
        assert "terminal-output:must-not-project" not in deduped_projection["workerSummary"]["evidenceRefs"]

        aggregate_response = client.post(
            "/candidate-work",
            json={
                "title": "Aggregate worker metadata with per-worker state",
                "requestedOutcome": "Aggregate worker counts should not be replaced by a matching per-worker state.",
                "source": "operator",
                "sourceArtifactPath": "docs/operator-note.md",
                "sourceArtifactType": "manual_note",
                "riskLevel": "low",
                "priority": "normal",
                "importMetadata": {
                    "projectionVisibility": "worker_summary_only",
                    "pipelineWorkerSummary": {
                        "activeCount": 5,
                        "workerRefs": ["worker:codex-4"],
                        "evidenceRefs": ["worker:codex-4:aggregate"],
                    },
                    "pipelineWorkerState": {
                        "workerId": "codex-4",
                        "state": "warm",
                        "evidenceRefs": ["worker:codex-4:state"],
                    },
                },
            },
        )
        assert aggregate_response.status_code == 200
        aggregate_projection_response = client.get("/pipeline-control-plane/projection")
        assert aggregate_projection_response.status_code == 200
        aggregate_projection = aggregate_projection_response.json()["data"]
        assert aggregate_projection["workerSummary"]["activeCount"] == 6
        assert aggregate_projection["workerSummary"]["warmCount"] == 1
        assert aggregate_projection["workerSummary"]["stalledCount"] == 1
        assert "worker:codex-4:aggregate" in aggregate_projection["workerSummary"]["evidenceRefs"]
        assert "worker:codex-4:state" in aggregate_projection["workerSummary"]["evidenceRefs"]

        _update_candidate_fixture(db_path, worker_response.json()["data"]["id"], updated_at="2026-07-04 00:00:00.000000")
        _update_candidate_fixture(db_path, duplicate_response.json()["data"]["id"], updated_at="2026-07-04 00:00:00.000000")
        _update_candidate_fixture(db_path, aggregate_response.json()["data"]["id"], updated_at="2026-07-04 00:00:00.000000")
        stale_projection_response = client.get("/pipeline-control-plane/projection")
        assert stale_projection_response.status_code == 200
        stale_projection = stale_projection_response.json()["data"]
        assert stale_projection["workerSummary"]["freshnessState"] == "stale"

        promote_response = client.patch(f"/candidate-work/{worker_response.json()['data']['id']}", json={"status": "approved"})
        assert promote_response.status_code == 200
        blocked_promote_response = client.post(f"/candidate-work/{worker_response.json()['data']['id']}/promote")
        assert blocked_promote_response.status_code == 400
        assert "metadata-only Candidate Work cannot be promoted" in blocked_promote_response.text


def test_pipeline_dashboard_projection_detects_idle_with_ready_work(tmp_path, monkeypatch) -> None:
    db_name = "pipeline-dashboard-idle-with-ready-work.db"
    source_ref = {
        "refId": "prd:_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-pipeline-execution-loop-reliability/prd.md",
        "sourceType": "prd",
        "pathOrUrl": "_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-pipeline-execution-loop-reliability/prd.md",
        "title": "Pipeline execution loop reliability",
    }
    with _client(tmp_path, monkeypatch, db_name) as client:
        create_response = client.post(
            "/pipeline-control-plane/work-packets",
            json={
                "packetId": "packet-idle-ready-work",
                "title": "Ready work with idle workers",
                "initialStage": "route",
                "status": "waiting",
                "truthLabel": "source_owned",
                "sourceRef": source_ref,
                "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                "idempotencyKey": "idle-ready-work-create",
                "payloadSummary": "Created waiting route packet for idle-with-ready-work proof.",
                "evidenceRefs": ["story:3-3", "proof:idle-ready-work"],
            },
        )
        assert create_response.status_code == 200

        projection_response = client.get("/pipeline-control-plane/projection")
        assert projection_response.status_code == 200
        projection = projection_response.json()["data"]
        assert projection["queueSummary"]["dispatchableCount"] == 1
        assert projection["workerSummary"]["activeCount"] is None
        assert projection["reliabilityProblems"] == [
            {
                "problemId": "problem:idle-with-ready-work",
                "kind": "idle_with_ready_work",
                "severity": "attention",
                "likelyIssue": "manager",
                "summary": "Dispatchable work exists, but no active or progressing worker is visible in backend projection metadata.",
                "evidenceRefs": ["queue:dispatchable", "worker:no-live-progress"],
                "metadataOnly": True,
            }
        ]

    with _client(tmp_path, monkeypatch, "pipeline-dashboard-idle-with-ready-work-active-worker.db") as client:
        create_response = client.post(
            "/pipeline-control-plane/work-packets",
            json={
                "packetId": "packet-ready-work-active-worker",
                "title": "Ready work with active worker",
                "initialStage": "route",
                "status": "waiting",
                "truthLabel": "source_owned",
                "sourceRef": source_ref,
                "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                "idempotencyKey": "ready-work-active-worker-create",
                "payloadSummary": "Created waiting route packet for active-worker proof.",
                "evidenceRefs": ["story:3-3", "proof:active-worker"],
            },
        )
        assert create_response.status_code == 200
        worker_response = client.post(
            "/candidate-work",
            json={
                "title": "Active worker metadata",
                "requestedOutcome": "Record active worker metadata without creating visible work.",
                "source": "operator",
                "sourceArtifactPath": "docs/operator-note.md",
                "sourceArtifactType": "manual_note",
                "riskLevel": "low",
                "priority": "normal",
                "importMetadata": {
                    "projectionVisibility": "worker_summary_only",
                    "pipelineWorkerState": {
                        "workerId": "codex-2",
                        "state": "active",
                        "evidenceRefs": ["worker:codex-2"],
                    },
                },
            },
        )
        assert worker_response.status_code == 200
        projection_response = client.get("/pipeline-control-plane/projection")
        assert projection_response.status_code == 200
        projection = projection_response.json()["data"]
        assert projection["queueSummary"]["dispatchableCount"] == 1
        assert projection["workerSummary"]["activeCount"] == 1
        assert projection["reliabilityProblems"] == []

    with _client(tmp_path, monkeypatch, "pipeline-dashboard-idle-with-ready-work-waiting-worker.db") as client:
        create_response = client.post(
            "/pipeline-control-plane/work-packets",
            json={
                "packetId": "packet-ready-work-waiting-worker",
                "title": "Ready work with waiting worker",
                "initialStage": "route",
                "status": "waiting",
                "truthLabel": "source_owned",
                "sourceRef": source_ref,
                "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                "idempotencyKey": "ready-work-waiting-worker-create",
                "payloadSummary": "Created waiting route packet for waiting-worker proof.",
                "evidenceRefs": ["story:3-3", "proof:waiting-worker"],
            },
        )
        assert create_response.status_code == 200
        worker_response = client.post(
            "/candidate-work",
            json={
                "title": "Waiting worker metadata",
                "requestedOutcome": "Record waiting worker metadata without creating visible work.",
                "source": "operator",
                "sourceArtifactPath": "docs/operator-note.md",
                "sourceArtifactType": "manual_note",
                "riskLevel": "low",
                "priority": "normal",
                "importMetadata": {
                    "projectionVisibility": "worker_summary_only",
                    "pipelineWorkerState": {
                        "workerId": "codex-3",
                        "state": "waiting",
                        "evidenceRefs": ["worker:codex-3"],
                    },
                },
            },
        )
        assert worker_response.status_code == 200
        projection_response = client.get("/pipeline-control-plane/projection")
        assert projection_response.status_code == 200
        projection = projection_response.json()["data"]
        assert projection["queueSummary"]["dispatchableCount"] == 1
        assert projection["workerSummary"]["waitingCount"] == 1
        assert projection["reliabilityProblems"][0]["kind"] == "idle_with_ready_work"
        assert projection["reliabilityProblems"][0]["likelyIssue"] == "worker"

    stale_db_name = "pipeline-dashboard-idle-with-ready-work-stale-worker.db"
    stale_db_path = _db_path(tmp_path, stale_db_name)
    with _client(tmp_path, monkeypatch, stale_db_name) as client:
        create_response = client.post(
            "/pipeline-control-plane/work-packets",
            json={
                "packetId": "packet-ready-work-stale-worker",
                "title": "Ready work with stale active worker metadata",
                "initialStage": "route",
                "status": "waiting",
                "truthLabel": "source_owned",
                "sourceRef": source_ref,
                "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                "idempotencyKey": "ready-work-stale-worker-create",
                "payloadSummary": "Created waiting route packet for stale-worker proof.",
                "evidenceRefs": ["story:3-3", "proof:stale-worker"],
            },
        )
        assert create_response.status_code == 200
        worker_response = client.post(
            "/candidate-work",
            json={
                "title": "Stale active worker metadata",
                "requestedOutcome": "Record stale active worker metadata without creating visible work.",
                "source": "operator",
                "sourceArtifactPath": "docs/operator-note.md",
                "sourceArtifactType": "manual_note",
                "riskLevel": "low",
                "priority": "normal",
                "importMetadata": {
                    "projectionVisibility": "worker_summary_only",
                    "pipelineWorkerState": {
                        "workerId": "codex-4",
                        "state": "active",
                        "evidenceRefs": ["worker:codex-4"],
                    },
                },
            },
        )
        assert worker_response.status_code == 200
        _update_candidate_fixture(stale_db_path, worker_response.json()["data"]["id"], updated_at="2026-07-04 00:00:00.000000")
        projection_response = client.get("/pipeline-control-plane/projection")
        assert projection_response.status_code == 200
        projection = projection_response.json()["data"]
        assert projection["queueSummary"]["dispatchableCount"] == 1
        assert projection["workerSummary"]["freshnessState"] == "stale"
        assert projection["workerSummary"]["activeCount"] == 1
        assert projection["reliabilityProblems"][0]["kind"] == "idle_with_ready_work"
        assert projection["reliabilityProblems"][0]["likelyIssue"] == "worker"

    with _client(tmp_path, monkeypatch, "pipeline-dashboard-idle-with-ready-work-anonymous-summary.db") as client:
        create_response = client.post(
            "/pipeline-control-plane/work-packets",
            json={
                "packetId": "packet-ready-work-anonymous-worker-summary",
                "title": "Ready work with anonymous worker summary",
                "initialStage": "route",
                "status": "waiting",
                "truthLabel": "source_owned",
                "sourceRef": source_ref,
                "actor": {"actorType": "manager", "actorId": "manager-test", "actorLabel": "Manager"},
                "idempotencyKey": "ready-work-anonymous-worker-summary-create",
                "payloadSummary": "Created waiting route packet for anonymous-summary proof.",
                "evidenceRefs": ["story:3-3", "proof:anonymous-worker-summary"],
            },
        )
        assert create_response.status_code == 200
        worker_response = client.post(
            "/candidate-work",
            json={
                "title": "Anonymous worker summary",
                "requestedOutcome": "Record aggregate worker metadata without safe identity or evidence.",
                "source": "operator",
                "sourceArtifactPath": "docs/operator-note.md",
                "sourceArtifactType": "manual_note",
                "riskLevel": "low",
                "priority": "normal",
                "importMetadata": {
                    "projectionVisibility": "worker_summary_only",
                    "pipelineWorkerSummary": {
                        "activeCount": 1,
                    },
                },
            },
        )
        assert worker_response.status_code == 200
        assert worker_response.json()["data"]["importMetadata"]["pipelineWorkerSummary"] == {}
        projection_response = client.get("/pipeline-control-plane/projection")
        assert projection_response.status_code == 200
        projection = projection_response.json()["data"]
        assert projection["queueSummary"]["dispatchableCount"] == 1
        assert projection["workerSummary"]["activeCount"] is None
        assert projection["reliabilityProblems"][0]["kind"] == "idle_with_ready_work"
        assert projection["reliabilityProblems"][0]["likelyIssue"] == "manager"


def test_pipeline_dashboard_projection_projects_gated_controls_as_metadata_only(tmp_path, monkeypatch) -> None:
    db_name = "pipeline-dashboard-gated-controls.db"
    with _client(tmp_path, monkeypatch, db_name) as client:
        gated_response = client.post(
            "/candidate-work",
            json={
                "title": "Worker kill gated control",
                "requestedOutcome": "Show worker kill as gated reliability metadata only.",
                "source": "operator",
                "sourceArtifactPath": "docs/operator-note.md",
                "sourceArtifactType": "manual_note",
                "riskLevel": "low",
                "priority": "normal",
                "importMetadata": {
                    "projectionVisibility": "gated_control_only",
                    "pipelineGatedControl": {
                        "controlId": "control:kill-codex-2",
                        "operation": "kill_worker",
                        "status": "gated",
                        "authorityFamily": "worker-process-control",
                        "stopLine": "Do not kill workers from pipeline reliability metadata.",
                        "nextAction": "Request explicit worker-control approval before any kill action.",
                        "packetId": "packet-needs-worker-attention",
                        "workerRefs": ["worker:codex-2"],
                        "evidenceRefs": ["control:kill-codex-2", "worker:codex-2"],
                        "command": "tmux kill-session must not persist",
                    },
                },
            },
        )
        assert gated_response.status_code == 200
        gated_metadata = gated_response.json()["data"]["importMetadata"]["pipelineGatedControl"]
        assert "command" not in gated_metadata
        assert gated_metadata["metadataOnly"] is True

        unsafe_response = client.post(
            "/candidate-work",
            json={
                "title": "Unsafe provider gated control",
                "requestedOutcome": "Unsafe refs are stripped from gated control metadata.",
                "source": "operator",
                "sourceArtifactPath": "docs/operator-note.md",
                "sourceArtifactType": "manual_note",
                "riskLevel": "low",
                "priority": "normal",
                "importMetadata": {
                    "projectionVisibility": "gated_control_only",
                    "pipelineGatedControl": {
                        "controlId": "control:provider-call",
                        "operation": "provider_call",
                        "status": "action_needed",
                        "authorityFamily": "local-provider-execution",
                        "stopLine": "Provider calls remain gated until provider-specific approval exists.",
                        "nextAction": "Request provider approval with rollback and redaction policy.",
                        "workerRefs": ["worker:codex-3", "terminal-output:must-not-project"],
                        "evidenceRefs": ["provider-payload:must-not-project", "control:provider-call"],
                        "script": "tmux kill-session must not persist",
                    },
                },
            },
        )
        assert unsafe_response.status_code == 200
        unsafe_metadata = unsafe_response.json()["data"]["importMetadata"]["pipelineGatedControl"]
        assert "script" not in unsafe_metadata
        malformed_response = client.post(
            "/candidate-work",
            json={
                "title": "Malformed gated control",
                "requestedOutcome": "Malformed gated control metadata does not break projection.",
                "source": "operator",
                "sourceArtifactPath": "docs/operator-note.md",
                "sourceArtifactType": "manual_note",
                "riskLevel": "low",
                "priority": "normal",
                "importMetadata": {
                    "projectionVisibility": "gated_control_only",
                    "pipelineGatedControl": {
                        "controlId": "control:bad-operation",
                        "operation": "run_shell",
                        "status": "running",
                        "authorityFamily": "shell-execution",
                        "stopLine": "Do not execute shell commands from projection metadata.",
                        "nextAction": "Ignore malformed control metadata.",
                    },
                },
            },
        )
        assert malformed_response.status_code == 200
        executable_text_response = client.post(
            "/candidate-work",
            json={
                "title": "Executable text gated control",
                "requestedOutcome": "Executable text is stripped from gated control metadata.",
                "source": "operator",
                "sourceArtifactPath": "docs/operator-note.md",
                "sourceArtifactType": "manual_note",
                "riskLevel": "low",
                "priority": "normal",
                "importMetadata": {
                    "projectionVisibility": "gated_control_only",
                    "pipelineGatedControl": {
                        "controlId": "control:executable-text",
                        "operation": "terminal_access",
                        "status": "blocked",
                        "authorityFamily": "terminal-access",
                        "stopLine": "Run tmux capture-pane now.",
                        "nextAction": "Run gh pr merge now.",
                        "evidenceRefs": ["control:executable-text"],
                    },
                },
            },
        )
        assert executable_text_response.status_code == 200
        executable_metadata = executable_text_response.json()["data"]["importMetadata"]["pipelineGatedControl"]
        assert "stopLine" not in executable_metadata
        assert "nextAction" not in executable_metadata
        duplicate_response = client.post(
            "/candidate-work",
            json={
                "title": "Duplicate gated controls",
                "requestedOutcome": "Multiple fallback-only gated controls receive distinct ids.",
                "source": "operator",
                "sourceArtifactPath": "docs/operator-note.md",
                "sourceArtifactType": "manual_note",
                "riskLevel": "low",
                "priority": "normal",
                "importMetadata": {
                    "projectionVisibility": "gated_control_only",
                    "pipelineGatedControls": [
                        {
                            "operation": "terminal_access",
                            "status": "gated",
                            "authorityFamily": "terminal-access",
                            "stopLine": "Terminal access remains gated by explicit operator approval.",
                            "nextAction": "Request terminal-access approval before reading pane output.",
                            "evidenceRefs": ["control:terminal-access"],
                        },
                        {
                            "operation": "raw_payload_retention",
                            "status": "blocked",
                            "authorityFamily": "raw-payload-retention",
                            "stopLine": "Raw payload retention remains blocked by metadata-only policy.",
                            "nextAction": "Use metadata refs instead of retaining raw payloads.",
                            "evidenceRefs": ["control:raw-payload-retention"],
                        },
                    ],
                },
            },
        )
        assert duplicate_response.status_code == 200

        projection_response = client.get("/pipeline-control-plane/projection")
        assert projection_response.status_code == 200
        projection = projection_response.json()["data"]
        projected_controls = projection["gatedControls"]
        assert len(projected_controls) == 4
        assert len({control["controlId"] for control in projected_controls}) == 4
        projected_by_id = {control["controlId"]: control for control in projected_controls}
        assert projected_by_id["control:kill-codex-2"] == {
            "controlId": "control:kill-codex-2",
            "operation": "kill_worker",
            "status": "gated",
            "authorityFamily": "worker-process-control",
            "stopLine": "Do not kill workers from pipeline reliability metadata.",
            "nextAction": "Request explicit worker-control approval before any kill action.",
            "packetId": "packet-needs-worker-attention",
            "workerRefs": ["worker:codex-2"],
            "evidenceRefs": ["control:kill-codex-2", "worker:codex-2"],
            "metadataOnly": True,
        }
        assert projected_by_id["control:provider-call"] == {
            "controlId": "control:provider-call",
            "operation": "provider_call",
            "status": "action_needed",
            "authorityFamily": "local-provider-execution",
            "stopLine": "Provider calls remain gated until provider-specific approval exists.",
            "nextAction": "Request provider approval with rollback and redaction policy.",
            "packetId": None,
            "workerRefs": ["worker:codex-3"],
            "evidenceRefs": ["control:provider-call"],
            "metadataOnly": True,
        }
        assert sorted(control["operation"] for control in projected_controls) == [
            "kill_worker",
            "provider_call",
            "raw_payload_retention",
            "terminal_access",
        ]

        _update_candidate_fixture(
            _db_path(tmp_path, db_name),
            gated_response.json()["data"]["id"],
            updated_at="2026-07-04 00:00:00.000000",
        )
        stale_projection_response = client.get("/pipeline-control-plane/projection")
        assert stale_projection_response.status_code == 200
        stale_projection = stale_projection_response.json()["data"]
        assert "control:kill-codex-2" in {control["controlId"] for control in stale_projection["gatedControls"]}

        promote_response = client.patch(f"/candidate-work/{gated_response.json()['data']['id']}", json={"status": "approved"})
        assert promote_response.status_code == 200
        blocked_promote_response = client.post(f"/candidate-work/{gated_response.json()['data']['id']}/promote")
        assert blocked_promote_response.status_code == 400
        assert "metadata-only Candidate Work cannot be promoted" in blocked_promote_response.text

    stale_db_name = "pipeline-dashboard-stale-gated-controls.db"
    stale_db_path = _db_path(tmp_path, stale_db_name)
    with _client(tmp_path, monkeypatch, stale_db_name) as client:
        stale_response = client.post(
            "/candidate-work",
            json={
                "title": "Stale gated terminal access",
                "requestedOutcome": "Show stale terminal access as gated metadata only.",
                "source": "operator",
                "sourceArtifactPath": "docs/operator-note.md",
                "sourceArtifactType": "manual_note",
                "riskLevel": "low",
                "priority": "normal",
                "importMetadata": {
                    "projectionVisibility": "gated_control_only",
                    "pipelineGatedControl": {
                        "controlId": "control:stale-terminal-access",
                        "operation": "terminal_access",
                        "status": "gated",
                        "authorityFamily": "terminal-access",
                        "stopLine": "Terminal access remains gated by explicit operator approval.",
                        "nextAction": "Request terminal-access approval before reading pane output.",
                        "evidenceRefs": ["control:stale-terminal-access"],
                    },
                },
            },
        )
        assert stale_response.status_code == 200
        _update_candidate_fixture(stale_db_path, stale_response.json()["data"]["id"], updated_at="2026-07-04 00:00:00.000000")
        stale_projection_response = client.get("/pipeline-control-plane/projection")
        assert stale_projection_response.status_code == 200
        stale_projection = stale_projection_response.json()["data"]
        assert stale_projection["sourceLabel"] == "stale"
        assert stale_projection["freshnessState"] == "stale"
        assert stale_projection["gatedControls"][0]["operation"] == "terminal_access"
        assert stale_projection["gatedControls"][0]["metadataOnly"] is True


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
                "unblocker": "unknown",
                "readyToTest": None,
                "evidenceRefs": [],
                "updatedAt": create_response.json()["data"]["updatedAt"],
                "metadataOnly": True,
            }
        ]
        assert projection["selectedPacketDetails"][0]["sourceRefs"] == []
        assert projection["selectedPacketDetails"][0]["latestTransitionEventRef"] is None
        assert projection["selectedPacketDetails"][0]["recentTransitionEventRefs"] == []
        assert projection["selectedPacketDetails"][0]["latestMovementSummary"] is None
        assert projection["selectedPacketDetails"][0]["canSatisfyLiveMovementProof"] is False
        assert projection["sourceStates"] == [
            {
                "sourceId": f"candidate_work:{candidate_id}",
                "sourceRef": f"candidate_work:{candidate_id}",
                "sourceKind": "candidate_work",
                "state": "healthy",
                "summary": "Candidate Work: Legacy backend packet",
                "evidenceRefs": [],
                "updatedAt": create_response.json()["data"]["updatedAt"],
                "metadataOnly": True,
            }
        ]


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
        assert "superseded by the July 4 pipeline execution-loop reliability PRD" in packet["blocker"]
        detail = next(detail for detail in projection["selectedPacketDetails"] if detail["packetId"] == packet["packetId"])
        assert detail["truthLabel"] == "stale"
        assert "superseded by the July 4 pipeline execution-loop reliability PRD" in detail["blocker"]
        assert detail["sourceRefs"] == []
        source_state = next(source_state for source_state in projection["sourceStates"] if source_state["sourceRef"] == f"candidate_work:{candidate_id}")
        assert source_state["state"] == "blocked"
        assert "superseded by the July 4 pipeline execution-loop reliability PRD" in source_state["summary"]
        assert source_state["metadataOnly"] is True


def test_pipeline_dashboard_projection_counts_stale_legacy_queue_state(tmp_path, monkeypatch) -> None:
    db_name = "pipeline-dashboard-legacy-stale-queue-state.db"
    db_path = _db_path(tmp_path, db_name)
    with _client(tmp_path, monkeypatch, db_name) as client:
        create_response = client.post(
            "/candidate-work",
            json={
                "title": "Legacy stale queue packet",
                "requestedOutcome": "Show stale queue state without making the packet dispatchable.",
                "source": "operator",
                "sourceArtifactPath": "docs/operator-note.md",
                "sourceArtifactType": "manual_note",
                "riskLevel": "low",
                "priority": "normal",
            },
        )
        assert create_response.status_code == 200
        candidate_id = create_response.json()["data"]["id"]
        unknown_create_response = client.post(
            "/candidate-work",
            json={
                "title": "Legacy unknown queue packet",
                "requestedOutcome": "Show unknown queue state without making the packet dispatchable.",
                "source": "operator",
                "sourceArtifactPath": "docs/operator-note.md",
                "sourceArtifactType": "manual_note",
                "riskLevel": "low",
                "priority": "normal",
            },
        )
        assert unknown_create_response.status_code == 200
        unknown_candidate_id = unknown_create_response.json()["data"]["id"]
        _update_candidate_fixture(
            db_path,
            candidate_id,
            import_metadata_json={
                "workPacketSourceRefs": [
                    {
                        "refId": "fixture:source:stale-queue",
                        "sourceType": "research",
                        "label": "Stale research queue source",
                        "freshness": "stale",
                        "accessState": "allowed",
                    }
                ],
            },
        )
        _update_candidate_fixture(
            db_path,
            unknown_candidate_id,
            import_metadata_json={
                "workPacketSourceRefs": [
                    {
                        "refId": "fixture:source:unknown-queue",
                        "sourceType": "research",
                        "label": "Unknown research queue source",
                        "freshness": "unknown",
                        "accessState": "allowed",
                    }
                ],
            },
        )

        projection_response = client.get("/pipeline-control-plane/projection")
        assert projection_response.status_code == 200
        projection = projection_response.json()["data"]
        packet = next(packet for packet in projection["workPackets"] if packet["packetId"] == f"candidate_work:{candidate_id}")
        unknown_packet = next(packet for packet in projection["workPackets"] if packet["packetId"] == f"candidate_work:{unknown_candidate_id}")
        assert packet["truthLabel"] == "stale"
        assert unknown_packet["truthLabel"] == "live"
        assert projection["queueSummary"]["dispatchableCount"] == 0
        assert projection["queueSummary"]["staleCount"] == 1
        assert projection["queueSummary"]["unknownCount"] == 1
        assert projection["queueSummary"]["emptyReason"] == "unknown"
        stale_source = next(source_state for source_state in projection["sourceStates"] if source_state["sourceId"] == "fixture:source:stale-queue")
        unknown_source = next(source_state for source_state in projection["sourceStates"] if source_state["sourceId"] == "fixture:source:unknown-queue")
        assert stale_source["state"] == "stale"
        assert unknown_source["state"] == "unknown"


def test_pipeline_dashboard_projection_bridges_learn_refill_source_states(tmp_path, monkeypatch) -> None:
    db_name = "pipeline-dashboard-learn-refill-source-states.db"
    db_path = _db_path(tmp_path, db_name)
    with _client(tmp_path, monkeypatch, db_name) as client:
        refilling_candidate = _create_candidate(client, title="Refilling source packet")

        _update_candidate_fixture(
            db_path,
            refilling_candidate["id"],
            import_metadata_json={
                "evidenceRefs": ["evidence:refilling-source", "tmux-pane-scrollback:must-not-project"],
                "learnRefill": {
                    "state": "refilling",
                    "explanation": "Learn is creating follow-up Candidate Work.",
                },
            },
        )
        refilling_projection_response = client.get("/pipeline-control-plane/projection")
        assert refilling_projection_response.status_code == 200
        refilling_projection = refilling_projection_response.json()["data"]
        refilling_source_states = {source_state["sourceId"]: source_state for source_state in refilling_projection["sourceStates"]}
        refilling_source = refilling_source_states[f"candidate_work:{refilling_candidate['id']}"]
        assert refilling_source["state"] == "refilling"
        assert refilling_source["evidenceRefs"] == ["evidence:refilling-source"]
        assert "tmux-pane-scrollback:must-not-project" not in refilling_projection["evidenceRefs"]
        assert refilling_projection["queueSummary"]["dispatchableCount"] == 0
        assert refilling_projection["queueSummary"]["refillingCount"] == 1
        assert refilling_projection["queueSummary"]["sourceExhausted"] is False
        assert refilling_projection["queueSummary"]["emptyReason"] == "refilling"

        _update_candidate_fixture(db_path, refilling_candidate["id"], status="deferred")
        active_exhausted_candidate = _create_candidate(client, title="Active exhausted source packet")
        no_evidence_exhausted_candidate = _create_candidate(client, title="No-evidence exhausted source packet")
        _update_candidate_fixture(
            db_path,
            active_exhausted_candidate["id"],
            import_metadata_json={
                "evidenceRefs": ["evidence:active-source-exhausted"],
                "learnRefill": {
                    "state": "source_exhausted",
                    "explanation": "Approved source is empty after promotion.",
                },
            },
        )
        _update_candidate_fixture(
            db_path,
            no_evidence_exhausted_candidate["id"],
            status="deferred",
            import_metadata_json={
                "learnRefill": {
                    "state": "source_exhausted",
                    "explanation": "Source exhaustion without evidence must not drive queue truth.",
                },
            },
        )

        projection_response = client.get("/pipeline-control-plane/projection")
        assert projection_response.status_code == 200
        projection = projection_response.json()["data"]
        source_states = {source_state["sourceId"]: source_state for source_state in projection["sourceStates"]}
        refilling_source = source_states[f"candidate_work:{refilling_candidate['id']}"]
        active_exhausted_source = source_states[f"candidate_work:{active_exhausted_candidate['id']}"]
        no_evidence_source = source_states[f"candidate_work:{no_evidence_exhausted_candidate['id']}"]

        assert refilling_source["state"] == "refilling"
        assert refilling_source["evidenceRefs"] == ["evidence:refilling-source"]
        assert active_exhausted_source["state"] == "exhausted"
        assert active_exhausted_source["evidenceRefs"] == ["evidence:active-source-exhausted"]
        assert no_evidence_source["state"] == "healthy"
        assert no_evidence_source["evidenceRefs"] == []
        assert projection["queueSummary"]["dispatchableCount"] == 0
        assert projection["queueSummary"]["refillingCount"] == 0
        assert projection["queueSummary"]["closedCount"] == 2
        assert projection["queueSummary"]["unknownCount"] == 1
        assert projection["queueSummary"]["sourceExhausted"] is False
        assert projection["queueSummary"]["emptyReason"] == "unknown"
        assert projection["managerSummary"]["sourceExhausted"] is False
        assert projection["managerSummary"]["inactivityReason"] == "unknown"


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
        assert "superseded by the July 4 pipeline execution-loop reliability PRD" in canonical_ref["blockedReason"]
        assert blocked_source_refs["fixture:source:stale"]["freshness"] == "stale"
        assert blocked_source_refs["fixture:source:missing"]["accessState"] == "missing"
        assert blocked_source_refs["fixture:source:excluded"]["accessState"] == "excluded"
        assert blocked_source_refs["fixture:source:excluded"]["pathOrUrl"] is None
        assert blocked_source_refs["fixture:source:blocked"]["accessState"] == "blocked"
        assert blocked_source_refs["fixture:source:superseded-prd"]["accessState"] == "blocked"
        assert blocked_source_refs["fixture:source:superseded-prd"]["freshness"] == "stale"
        assert blocked_source_refs["fixture:source:superseded-prd"]["pathOrUrl"] is None
        assert "superseded by the July 4 pipeline execution-loop reliability PRD" in blocked_source_refs["fixture:source:superseded-prd"]["blockedReason"]
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
                    "readyToTest": {
                        "readyId": "ready:promoted-learn-refill",
                        "userFacingSummary": "Promoted Learn/refill projection is ready to test.",
                        "testableSurface": "/pipeline selected packet",
                        "verificationRefs": ["pytest tests/integration/test_work_packets.py", "terminal-output:must-not-project"],
                        "evidenceRefs": ["evidence:promoted-ready", "tmux-stdout:must-not-project"],
                    },
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
        assert projection["readyToTest"]["evidenceRefs"] == ["evidence:promoted-ready"]
        assert "terminal-output:must-not-project" not in json.dumps(projection["readyToTest"])
        assert "tmux-stdout:must-not-project" not in json.dumps(projection["readyToTest"])
        assert projection["providerCallsAllowed"] is False
        assert projection["workerLaunchAllowed"] is False
        assert projection["githubMutationAllowed"] is False

        dashboard_projection_response = client.get("/pipeline-control-plane/projection")
        assert dashboard_projection_response.status_code == 200
        dashboard_projection = dashboard_projection_response.json()["data"]
        dashboard_packet = next(
            packet
            for packet in dashboard_projection["workPackets"]
            if packet["packetId"] == f"work_item:{work_item['id']}"
        )
        dashboard_detail = next(
            detail
            for detail in dashboard_projection["selectedPacketDetails"]
            if detail["packetId"] == f"work_item:{work_item['id']}"
        )
        assert dashboard_packet["readyToTest"] == projection["readyToTest"]
        assert dashboard_detail["readyToTest"] == projection["readyToTest"]


def test_operational_actions_are_idempotent_and_preserve_ready_to_test_lineage(tmp_path, monkeypatch) -> None:
    db_name = "operational-actions.db"
    source_ref = {
        "refId": "workflow:operational-pipeline-action-loop",
        "sourceType": "workflow",
        "pathOrUrl": "docs/workflows/latest-prd-autonomous-bmad-loop-goal.md",
        "title": "Operational pipeline action loop",
    }
    ready_to_test = {
        "readyId": "ready:operational-action-loop",
        "userFacingSummary": "Operator action controls are ready to test.",
        "testableSurface": "/pipeline packet detail actions",
        "verificationRefs": ["test:operational-action-loop"],
        "evidenceRefs": ["evidence:operational-action-loop"],
    }

    with _client(tmp_path, monkeypatch, db_name) as client:
        create_response = client.post(
            "/pipeline-control-plane/work-packets",
            json={
                "packetId": "packet-operational-action-loop",
                "title": "Operational action loop packet",
                "initialStage": "review",
                "status": "waiting",
                "sourceRef": source_ref,
                "actor": {"actorType": "manager", "actorId": "test-manager", "actorLabel": "Test manager"},
                "idempotencyKey": "create-operational-action-loop",
                "correlationId": "corr-create-operational-action-loop",
                "evidenceRefs": ["test:operational-action-loop"],
                "readyToTest": ready_to_test,
            },
        )
        assert create_response.status_code == 200
        packet = create_response.json()["data"]

        projection_response = client.get("/pipeline-control-plane/projection")
        assert projection_response.status_code == 200
        projection = projection_response.json()["data"]
        assert projection["runtimeReadiness"]["operationalMode"] == "local_proof"
        detail = next(item for item in projection["selectedPacketDetails"] if item["packetId"] == packet["packetId"])
        assert detail["readyToTest"]["readyId"] == ready_to_test["readyId"]
        assert any(capability["actionId"] == "mark_tested" and capability["capabilityState"] == "available" for capability in detail["actionCapabilities"])

        action_payload = {
            "actionId": "mark_tested",
            "targetType": "work_packet",
            "targetId": packet["packetId"],
            "idempotencyKey": "test-action-operational-pass",
            "correlationId": "corr-operational-pass",
            "requestedBy": {"actorType": "operator", "actorId": "operator-test", "actorLabel": "Operator test"},
            "requestedAuthorityState": "needs_product_approval",
            "requestedRiskTier": "medium",
            "expectedCurrentEventId": packet["currentEventId"],
            "operatorIntentSummary": "Record the operator pass decision.",
            "evidenceRefs": ["evidence:operator-test-context"],
            "testResult": "pass",
        }
        approval_response = client.post(
            "/pipeline-control-plane/approvals",
            json={
                "actionId": "mark_tested",
                "targetType": "work_packet",
                "targetId": packet["packetId"],
                "requestedBy": action_payload["requestedBy"],
                "requestedAuthorityState": "needs_product_approval",
                "requestedRiskTier": "medium",
            },
        )
        assert approval_response.status_code == 200
        action_payload["approvalId"] = approval_response.json()["data"]["approvalId"]
        action_payload["expectedCurrentEventId"] = approval_response.json()["data"]["expectedCurrentEventId"]
        action_response = client.post("/pipeline-control-plane/actions", json=action_payload)
        assert action_response.status_code == 200
        action_result = action_response.json()["data"]
        assert action_result["outcome"] == "succeeded"
        assert action_result["resultingStage"] == "promote"
        assert action_result["resultingStatus"] == "waiting"

        duplicate_response = client.post("/pipeline-control-plane/actions", json=action_payload)
        assert duplicate_response.status_code == 200
        assert duplicate_response.json()["data"]["actionRecordId"] == action_result["actionRecordId"]

        conflicting_replay_response = client.post(
            "/pipeline-control-plane/actions",
            json={**action_payload, "testNotes": "Different metadata must not hijack the idempotency key."},
        )
        assert conflicting_replay_response.status_code == 400
        assert "idempotency key already belongs to different action metadata" in conflicting_replay_response.text

        blocked_response = client.post(
            "/pipeline-control-plane/actions",
            json={
                **action_payload,
                "actionId": "requeue",
                "idempotencyKey": "test-action-requeue-blocked",
                "correlationId": "corr-requeue-blocked",
                "requestedAuthorityState": "needs_authority_approval",
                "testResult": None,
                "approvalId": None,
                "expectedCurrentEventId": None,
                "evidenceRefs": ["evidence:operator-requested-requeue"],
            },
        )
        assert blocked_response.status_code == 400
        assert "server-issued approval" in blocked_response.text

        rework_create = client.post(
            "/pipeline-control-plane/work-packets",
            json={
                "packetId": "packet-operational-rework-parent",
                "title": "Operational rework parent",
                "initialStage": "review",
                "status": "waiting",
                "sourceRef": source_ref,
                "actor": {"actorType": "manager"},
                "idempotencyKey": "create-operational-rework-parent",
                "readyToTest": ready_to_test,
            },
        )
        assert rework_create.status_code == 200
        rework_parent = rework_create.json()["data"]
        rework_approval_response = client.post(
            "/pipeline-control-plane/approvals",
            json={
                "actionId": "request_rework",
                "targetType": "work_packet",
                "targetId": rework_parent["packetId"],
                "requestedBy": {"actorType": "operator", "actorId": "operator-test"},
                "requestedAuthorityState": "needs_product_approval",
                "requestedRiskTier": "medium",
            },
        )
        assert rework_approval_response.status_code == 200
        rework_approval = rework_approval_response.json()["data"]
        rework_response = client.post(
            "/pipeline-control-plane/actions",
            json={
                "actionId": "request_rework",
                "targetType": "work_packet",
                "targetId": rework_parent["packetId"],
                "idempotencyKey": "test-action-rework",
                "correlationId": "corr-operational-rework",
                "requestedBy": {"actorType": "operator", "actorId": "operator-test"},
                "requestedAuthorityState": "needs_product_approval",
                "requestedRiskTier": "medium",
                "approvalId": rework_approval["approvalId"],
                "expectedCurrentEventId": rework_approval["expectedCurrentEventId"],
                "operatorIntentSummary": "Route failed testing to rework.",
                "evidenceRefs": ["evidence:operator-rework-context"],
            },
        )
        assert rework_response.status_code == 200
        rework_result = rework_response.json()["data"]
        assert rework_result["outcome"] == "succeeded"
        assert rework_result["childPacketId"]
        child_response = client.get(f"/pipeline-control-plane/work-packets/{rework_result['childPacketId']}")
        assert child_response.status_code == 200
        child = child_response.json()["data"]
        assert child["parentPacketId"] == rework_parent["packetId"]
        assert child["lineageKind"] == "rework"
        assert child["currentStage"] == "shape"
        assert child["status"] == "waiting"


def test_mark_tested_fail_routes_parent_to_rework_child(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "operational-action-failed-test.db") as client:
        source_ref = {
            "refId": "prd:_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-operational-pipeline-action-loop/prd.md",
            "sourceType": "prd",
            "pathOrUrl": "_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-operational-pipeline-action-loop/prd.md",
            "title": "Operational pipeline action loop",
        }
        create_response = client.post(
            "/pipeline-control-plane/work-packets",
            json={
                "packetId": "packet-operational-failed-test",
                "title": "Operational failed-test packet",
                "initialStage": "review",
                "status": "waiting",
                "sourceRef": source_ref,
                "idempotencyKey": "create-operational-failed-test",
                "readyToTest": {
                    "readyId": "ready:failed-test",
                    "userFacingSummary": "Failed-test routing is ready to test.",
                    "testableSurface": "/pipeline packet detail",
                    "evidenceRefs": ["evidence:failed-test"],
                },
            },
        )
        assert create_response.status_code == 200
        packet = create_response.json()["data"]
        approval_response = client.post(
            "/pipeline-control-plane/approvals",
            json={
                "actionId": "mark_tested",
                "targetType": "work_packet",
                "targetId": packet["packetId"],
                "requestedBy": {"actorType": "operator", "actorId": "operator-test"},
                "requestedAuthorityState": "needs_product_approval",
                "requestedRiskTier": "medium",
            },
        )
        assert approval_response.status_code == 200
        approval = approval_response.json()["data"]
        action_response = client.post(
            "/pipeline-control-plane/actions",
            json={
                "actionId": "mark_tested",
                "targetType": "work_packet",
                "targetId": packet["packetId"],
                "idempotencyKey": "failed-test-routes-rework",
                "correlationId": "corr-failed-test-routes-rework",
                "requestedBy": {"actorType": "operator", "actorId": "operator-test"},
                "requestedAuthorityState": "needs_product_approval",
                "requestedRiskTier": "medium",
                "approvalId": approval["approvalId"],
                "expectedCurrentEventId": approval["expectedCurrentEventId"],
                "evidenceRefs": ["evidence:operator-test-context"],
                "testResult": "fail",
                "testNotes": "The operator test found a bounded failure.",
            },
        )
        assert action_response.status_code == 200
        result = action_response.json()["data"]
        assert result["outcome"] == "succeeded"
        assert result["resultingStatus"] == "deferred"
        assert result["childPacketId"]
        parent_response = client.get(f"/pipeline-control-plane/work-packets/{packet['packetId']}")
        assert parent_response.json()["data"]["operatorTestState"] == "rework"
        child_response = client.get(f"/pipeline-control-plane/work-packets/{result['childPacketId']}")
        assert child_response.json()["data"]["parentPacketId"] == packet["packetId"]


def test_server_bound_approval_requires_exact_fresh_unconsumed_binding(tmp_path, monkeypatch) -> None:
    db_name = "server-bound-approval.db"
    source_ref = {
        "refId": "workflow:server-bound-approval",
        "sourceType": "workflow",
        "pathOrUrl": "docs/workflows/execution-authority-boundary.md",
        "title": "Server-bound approval",
    }

    def create_packet(client, packet_id: str) -> dict:
        response = client.post(
            "/pipeline-control-plane/work-packets",
            json={
                "packetId": packet_id,
                "title": packet_id,
                "initialStage": "review",
                "status": "waiting",
                "sourceRef": source_ref,
                "readyToTest": {
                    "readyId": f"ready:{packet_id}",
                    "userFacingSummary": "Approval binding is ready to test.",
                    "testableSurface": "/pipeline packet detail",
                    "evidenceRefs": ["evidence:approval-binding"],
                },
            },
        )
        assert response.status_code == 200
        return response.json()["data"]

    def approval_payload(packet: dict, *, action_id: str = "mark_tested", actor_id: str = "operator-test") -> dict:
        return {
            "actionId": action_id,
            "targetType": "work_packet",
            "targetId": packet["packetId"],
            "requestedBy": {"actorType": "operator", "actorId": actor_id, "actorLabel": "Operator test"},
            "requestedAuthorityState": "needs_product_approval",
            "requestedRiskTier": "medium",
            "metadataOnly": True,
            "rawPayloadRetained": False,
        }

    def apply_payload(packet: dict, approval: dict, *, idempotency_key: str = "apply-approval") -> dict:
        return {
            "actionId": "mark_tested",
            "targetType": "work_packet",
            "targetId": packet["packetId"],
            "idempotencyKey": idempotency_key,
            "correlationId": f"corr:{idempotency_key}",
            "requestedBy": {"actorType": "operator", "actorId": "operator-test", "actorLabel": "Operator test"},
            "requestedAuthorityState": "needs_product_approval",
            "requestedRiskTier": "medium",
            "expectedCurrentEventId": approval["expectedCurrentEventId"],
            "operatorIntentSummary": "Record the operator test decision.",
            "evidenceRefs": ["evidence:operator-test-context"],
            "testResult": "pass",
            "approvalId": approval["approvalId"],
            "metadataOnly": True,
            "rawPayloadRetained": False,
        }

    with _client(tmp_path, monkeypatch, db_name) as client:
        packet = create_packet(client, "packet-server-bound-approval")
        approval_response = client.post("/pipeline-control-plane/approvals", json=approval_payload(packet))
        assert approval_response.status_code == 200
        approval = approval_response.json()["data"]
        assert approval["expectedCurrentEventId"] == packet["currentEventId"]
        assert approval["consumed"] is False
        assert approval["metadataOnly"] is True
        assert approval["rawPayloadRetained"] is False

        forged_prefix = apply_payload(packet, approval, idempotency_key="forged-prefix")
        forged_prefix.pop("approvalId")
        forged_prefix["evidenceRefs"] = ["evidence:product-test-approval"]
        forged_response = client.post("/pipeline-control-plane/actions", json=forged_prefix)
        assert forged_response.status_code == 400
        assert "approval evidence prefixes" in forged_response.text

        wrong_target = apply_payload(packet, approval, idempotency_key="wrong-target")
        wrong_target["targetId"] = "different-packet"
        assert client.post("/pipeline-control-plane/actions", json=wrong_target).status_code == 400

        wrong_actor = apply_payload(packet, approval, idempotency_key="wrong-actor")
        wrong_actor["requestedBy"]["actorId"] = "different-operator"
        assert client.post("/pipeline-control-plane/actions", json=wrong_actor).status_code == 400

        wrong_action = apply_payload(packet, approval, idempotency_key="wrong-action")
        wrong_action["actionId"] = "request_rework"
        assert client.post("/pipeline-control-plane/actions", json=wrong_action).status_code == 400

        wrong_risk = apply_payload(packet, approval, idempotency_key="wrong-risk")
        wrong_risk["requestedRiskTier"] = "high"
        assert client.post("/pipeline-control-plane/actions", json=wrong_risk).status_code == 400

        result_response = client.post("/pipeline-control-plane/actions", json=apply_payload(packet, approval))
        assert result_response.status_code == 200
        result = result_response.json()["data"]
        assert result["outcome"] == "succeeded"

        idempotent_response = client.post("/pipeline-control-plane/actions", json=apply_payload(packet, approval))
        assert idempotent_response.status_code == 200
        assert idempotent_response.json()["data"]["actionRecordId"] == result["actionRecordId"]

        replay_response = client.post(
            "/pipeline-control-plane/actions",
            json=apply_payload(packet, approval, idempotency_key="replay-after-consume"),
        )
        assert replay_response.status_code == 400
        assert "consumed" in replay_response.text

        stale_packet = create_packet(client, "packet-stale-approval")
        stale_approval = client.post("/pipeline-control-plane/approvals", json=approval_payload(stale_packet)).json()["data"]
        transition_response = client.post(
            f"/pipeline-control-plane/work-packets/{stale_packet['packetId']}/transitions",
            json={
                "targetStage": "promote",
                "expectedCurrentEventId": stale_packet["currentEventId"],
                "status": "waiting",
                "actor": {"actorType": "manager", "actorId": "manager-test"},
                "idempotencyKey": "advance-stale-approval-packet",
            },
        )
        assert transition_response.status_code == 200
        stale_apply = apply_payload(stale_packet, stale_approval, idempotency_key="stale-event")
        assert client.post("/pipeline-control-plane/actions", json=stale_apply).status_code == 400

        expired_packet = create_packet(client, "packet-expired-approval")
        expired_approval = client.post("/pipeline-control-plane/approvals", json=approval_payload(expired_packet)).json()["data"]
        with sqlite3.connect(_db_path(tmp_path, db_name)) as conn:
            conn.execute("update pipeline_operational_approvals set expires_at = '2000-01-01 00:00:00' where approval_id = ?", (expired_approval["approvalId"],))
            conn.commit()
        expired_apply = apply_payload(expired_packet, expired_approval, idempotency_key="expired-approval")
        expired_response = client.post("/pipeline-control-plane/actions", json=expired_apply)
        assert expired_response.status_code == 400
        assert "expired" in expired_response.text


def test_server_bound_approval_rejects_ineligible_actions_and_preserves_read_only_actions(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "server-bound-approval-eligibility.db") as client:
        source_ref = {
            "refId": "workflow:server-bound-read-only",
            "sourceType": "workflow",
            "pathOrUrl": "docs/workflows/execution-authority-boundary.md",
            "title": "Server-bound read-only actions",
        }
        create_response = client.post(
            "/pipeline-control-plane/work-packets",
            json={
                "packetId": "packet-read-only-actions",
                "title": "Read-only action packet",
                "initialStage": "review",
                "status": "waiting",
                "sourceRef": source_ref,
                "readyToTest": {
                    "readyId": "ready:read-only-actions",
                    "userFacingSummary": "Read-only actions are ready.",
                    "testableSurface": "/pipeline packet detail",
                    "evidenceRefs": ["evidence:read-only-actions"],
                },
            },
        )
        assert create_response.status_code == 200
        packet = create_response.json()["data"]
        initial_event_id = packet["currentEventId"]
        inspect_response = client.post(
            "/pipeline-control-plane/actions",
            json={
                "actionId": "inspect",
                "targetType": "work_packet",
                "targetId": packet["packetId"],
                "idempotencyKey": "inspect-read-only",
                "correlationId": "corr-inspect-read-only",
                "requestedBy": {"actorType": "operator", "actorId": "operator-test"},
                "requestedAuthorityState": "not_required",
                "requestedRiskTier": "low",
                "expectedCurrentEventId": initial_event_id,
                "evidenceRefs": ["evidence:read-only-inspect"],
            },
        )
        assert inspect_response.status_code == 200
        refresh_response = client.post(
            "/pipeline-control-plane/actions",
            json={
                "actionId": "refresh_projection",
                "targetType": "projection",
                "targetId": "projection",
                "idempotencyKey": "refresh-read-only",
                "correlationId": "corr-refresh-read-only",
                "requestedBy": {"actorType": "operator", "actorId": "operator-test"},
                "requestedAuthorityState": "not_required",
                "requestedRiskTier": "low",
                "evidenceRefs": ["evidence:read-only-refresh"],
            },
        )
        assert refresh_response.status_code == 200
        unchanged_packet = client.get(f"/pipeline-control-plane/work-packets/{packet['packetId']}").json()["data"]
        assert unchanged_packet["currentEventId"] == initial_event_id
        assert unchanged_packet["status"] == "waiting"

        response = client.post(
            "/pipeline-control-plane/approvals",
            json={
                "actionId": "inspect",
                "targetType": "projection",
                "targetId": "projection",
                "requestedBy": {"actorType": "operator", "actorId": "operator-test"},
                "requestedAuthorityState": "not_required",
                "requestedRiskTier": "low",
                "metadataOnly": True,
                "rawPayloadRetained": False,
            },
        )
        assert response.status_code == 422
        assert "mark_tested" in response.text or "request_rework" in response.text


def test_gated_actions_record_same_stage_events_and_reject_second_approval_for_old_event(tmp_path, monkeypatch) -> None:
    db_name = "server-bound-action-events.db"
    source_ref = {
        "refId": "workflow:server-bound-action-events",
        "sourceType": "workflow",
        "pathOrUrl": "docs/workflows/execution-authority-boundary.md",
        "title": "Server-bound action events",
    }

    def create_packet(client, packet_id: str, initial_stage: str = "review") -> dict:
        response = client.post(
            "/pipeline-control-plane/work-packets",
            json={
                "packetId": packet_id,
                "title": packet_id,
                "initialStage": initial_stage,
                "status": "waiting",
                "sourceRef": source_ref,
                "readyToTest": {
                    "readyId": f"ready:{packet_id}",
                    "userFacingSummary": "Gated action event testing is ready.",
                    "testableSurface": "/pipeline packet detail",
                    "evidenceRefs": ["evidence:action-event-testing"],
                },
            },
        )
        assert response.status_code == 200
        return response.json()["data"]

    def issue(client, packet: dict, action_id: str = "mark_tested") -> dict:
        response = client.post(
            "/pipeline-control-plane/approvals",
            json={
                "actionId": action_id,
                "targetType": "work_packet",
                "targetId": packet["packetId"],
                "requestedBy": {"actorType": "operator", "actorId": "operator-test"},
                "requestedAuthorityState": "needs_product_approval",
                "requestedRiskTier": "medium",
            },
        )
        assert response.status_code == 200
        return response.json()["data"]

    def apply(client, packet: dict, approval: dict, *, action_id: str = "mark_tested", result: str | None = "notes", key: str = "action"):
        return client.post(
            "/pipeline-control-plane/actions",
            json={
                "actionId": action_id,
                "targetType": "work_packet",
                "targetId": packet["packetId"],
                "idempotencyKey": key,
                "correlationId": f"corr:{key}",
                "requestedBy": {"actorType": "operator", "actorId": "operator-test"},
                "requestedAuthorityState": "needs_product_approval",
                "requestedRiskTier": "medium",
                "approvalId": approval["approvalId"],
                "expectedCurrentEventId": approval["expectedCurrentEventId"],
                "operatorIntentSummary": "Record a bounded operator action.",
                "evidenceRefs": ["evidence:operator-action-event"],
                "testResult": result,
            },
        )

    with _client(tmp_path, monkeypatch, db_name) as client:
        for packet_id, initial_stage, result, expected_event_type in [
            ("packet-pass-outside-review", "execute", "pass", "packet.operational_action_applied"),
            ("packet-failed-test-event", "review", "fail", "packet.operational_action_applied"),
            ("packet-notes-test-event", "review", "notes", "packet.operational_action_applied"),
        ]:
            packet = create_packet(client, packet_id, initial_stage)
            approval = issue(client, packet)
            response = apply(client, packet, approval, result=result, key=f"{packet_id}:apply")
            assert response.status_code == 200
            refreshed = client.get(f"/pipeline-control-plane/work-packets/{packet_id}").json()["data"]
            assert refreshed["currentEventId"] != packet["currentEventId"]
            assert refreshed["history"][-1]["eventType"] == expected_event_type

        packet = create_packet(client, "packet-two-approvals-one-event")
        first_approval = issue(client, packet)
        second_approval = issue(client, packet)
        first_response = apply(client, packet, first_approval, result="notes", key="two-approvals-first")
        assert first_response.status_code == 200
        second_response = apply(client, packet, second_approval, result="notes", key="two-approvals-second")
        assert second_response.status_code == 400
        assert "stale" in second_response.text


def test_concurrent_distinct_approvals_allow_one_packet_mutation(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "server-bound-concurrency.db") as client:
        source_ref = {
            "refId": "workflow:server-bound-concurrency",
            "sourceType": "workflow",
            "pathOrUrl": "docs/workflows/execution-authority-boundary.md",
            "title": "Server-bound concurrency",
        }
        packet = client.post(
            "/pipeline-control-plane/work-packets",
            json={
                "packetId": "packet-concurrent-distinct-approvals",
                "title": "Concurrent approval packet",
                "initialStage": "review",
                "status": "waiting",
                "sourceRef": source_ref,
                "readyToTest": {
                    "readyId": "ready:concurrent-distinct-approvals",
                    "userFacingSummary": "Concurrent approval testing is ready.",
                    "testableSurface": "/pipeline packet detail",
                    "evidenceRefs": ["evidence:concurrent-approvals"],
                },
            },
        ).json()["data"]

        def approval() -> dict:
            return client.post(
                "/pipeline-control-plane/approvals",
                json={
                    "actionId": "mark_tested",
                    "targetType": "work_packet",
                    "targetId": packet["packetId"],
                    "requestedBy": {"actorType": "operator", "actorId": "operator-test"},
                    "requestedAuthorityState": "needs_product_approval",
                    "requestedRiskTier": "medium",
                },
            ).json()["data"]

        approvals = [approval(), approval()]

        def apply(approval_record: dict, key: str):
            return client.post(
                "/pipeline-control-plane/actions",
                json={
                    "actionId": "mark_tested",
                    "targetType": "work_packet",
                    "targetId": packet["packetId"],
                    "idempotencyKey": key,
                    "correlationId": f"corr:{key}",
                    "requestedBy": {"actorType": "operator", "actorId": "operator-test"},
                    "requestedAuthorityState": "needs_product_approval",
                    "requestedRiskTier": "medium",
                    "approvalId": approval_record["approvalId"],
                    "expectedCurrentEventId": approval_record["expectedCurrentEventId"],
                    "operatorIntentSummary": "Concurrent bounded action.",
                    "evidenceRefs": ["evidence:concurrent-action"],
                    "testResult": "notes",
                },
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = list(executor.map(lambda item: apply(*item), [(approvals[0], "concurrent-one"), (approvals[1], "concurrent-two")]))
        assert sorted(response.status_code for response in responses) == [200, 400]
        refreshed = client.get(f"/pipeline-control-plane/work-packets/{packet['packetId']}").json()["data"]
        assert sum(event["eventType"] == "packet.operational_action_applied" for event in refreshed["history"]) == 1


def test_concurrent_duplicate_approval_and_idempotency_returns_original_result(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "server-bound-duplicate-concurrency.db") as client:
        source_ref = {
            "refId": "workflow:server-bound-duplicate-concurrency",
            "sourceType": "workflow",
            "pathOrUrl": "docs/workflows/execution-authority-boundary.md",
            "title": "Server-bound duplicate concurrency",
        }
        packet = client.post(
            "/pipeline-control-plane/work-packets",
            json={
                "packetId": "packet-concurrent-duplicate-approval",
                "title": "Concurrent duplicate approval packet",
                "initialStage": "review",
                "status": "waiting",
                "sourceRef": source_ref,
                "readyToTest": {
                    "readyId": "ready:concurrent-duplicate-approval",
                    "userFacingSummary": "Concurrent duplicate testing is ready.",
                    "testableSurface": "/pipeline packet detail",
                    "evidenceRefs": ["evidence:concurrent-duplicate"],
                },
            },
        ).json()["data"]
        approval = client.post(
            "/pipeline-control-plane/approvals",
            json={
                "actionId": "mark_tested",
                "targetType": "work_packet",
                "targetId": packet["packetId"],
                "requestedBy": {"actorType": "operator", "actorId": "operator-test"},
                "requestedAuthorityState": "needs_product_approval",
                "requestedRiskTier": "medium",
            },
        ).json()["data"]
        payload = {
            "actionId": "mark_tested",
            "targetType": "work_packet",
            "targetId": packet["packetId"],
            "idempotencyKey": "concurrent-duplicate-key",
            "correlationId": "corr:concurrent-duplicate-key",
            "requestedBy": {"actorType": "operator", "actorId": "operator-test"},
            "requestedAuthorityState": "needs_product_approval",
            "requestedRiskTier": "medium",
            "approvalId": approval["approvalId"],
            "expectedCurrentEventId": approval["expectedCurrentEventId"],
            "operatorIntentSummary": "Concurrent duplicate action.",
            "evidenceRefs": ["evidence:concurrent-duplicate-action"],
            "testResult": "notes",
        }
        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = list(executor.map(lambda _: client.post("/pipeline-control-plane/actions", json=payload), range(2)))
        assert [response.status_code for response in responses] == [200, 200]
        assert len({response.json()["data"]["actionRecordId"] for response in responses}) == 1


def test_existing_sqlite_action_schema_gets_approval_migration_and_ledger_table(tmp_path, monkeypatch) -> None:
    db_name = "server-bound-existing-schema.db"
    db_path = _db_path(tmp_path, db_name)
    with sqlite3.connect(db_path) as conn:
        conn.execute("create table pipeline_operational_action_records (id varchar(80) primary key)")
        conn.commit()
    with _client(tmp_path, monkeypatch, db_name):
        assert "approval_id" in _sqlite_table_columns(db_path, "pipeline_operational_action_records")
        assert "pipeline_operational_approvals" in _sqlite_tables(db_path)


def test_postgres_startup_migration_contract_and_conditional_pre_patch_schema_coverage(tmp_path, monkeypatch) -> None:
    """Prove the Postgres Gate 3 migration contract; run live only with an explicit isolated test DB."""
    database_source = Path(__file__).parents[2] / "src/supervisor/infrastructure/db/database.py"
    source_text = database_source.read_text(encoding="utf-8")
    assert "ADD COLUMN IF NOT EXISTS {column_name} {column_type}" in source_text

    from supervisor.infrastructure.db.database import POSTGRES_OPERATIONAL_ACTION_MIGRATION_COLUMNS

    assert POSTGRES_OPERATIONAL_ACTION_MIGRATION_COLUMNS == (
        ("child_packet_id", "VARCHAR(80)"),
        ("expected_current_event_id", "VARCHAR(80)"),
        ("approval_id", "VARCHAR(120)"),
    )

    database_url = os.getenv("SUPERVISOR_POSTGRES_TEST_DATABASE_URL")
    if not database_url or os.getenv("SUPERVISOR_POSTGRES_TEST_DATABASE_ISOLATED") != "1":
        pytest.skip(
            "PostgreSQL service unavailable or no explicitly isolated test database was supplied; "
            "verified source-owned IF NOT EXISTS migration contract, live pre-patch-schema startup coverage was not run."
        )

    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    async def prepare_pre_patch_schema() -> None:
        test_engine = create_async_engine(database_url, future=True)
        try:
            async with test_engine.begin() as connection:
                await connection.execute(text("DROP TABLE IF EXISTS pipeline_operational_action_records CASCADE"))
                await connection.execute(text("CREATE TABLE pipeline_operational_action_records (id VARCHAR(80) PRIMARY KEY)"))
        finally:
            await test_engine.dispose()

    asyncio_run(prepare_pre_patch_schema())
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", database_url)
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")
    _reset_supervisor_modules()
    from supervisor.infrastructure.db.database import engine as live_engine
    from supervisor.infrastructure.db.database import init_db

    async def initialize_and_check() -> None:
        await init_db()
        async with live_engine.connect() as connection:
            result = await connection.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'pipeline_operational_action_records'"))
            columns = {row[0] for row in result.fetchall()}
            assert {column for column, _ in POSTGRES_OPERATIONAL_ACTION_MIGRATION_COLUMNS}.issubset(columns)

    try:
        asyncio_run(initialize_and_check())
    finally:
        asyncio_run(live_engine.dispose())
