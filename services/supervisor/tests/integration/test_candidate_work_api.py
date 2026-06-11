import sys

from fastapi.testclient import TestClient


def _reset_supervisor_modules() -> None:
    for module_name in list(sys.modules):
        if module_name == "supervisor" or module_name.startswith("supervisor."):
            sys.modules.pop(module_name, None)


def _client(tmp_path, monkeypatch, db_name: str) -> TestClient:
    _reset_supervisor_modules()
    db_path = (tmp_path / db_name).as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    from supervisor.api.main import app

    return TestClient(app)


def test_candidate_work_can_be_created_listed_and_updated_without_active_work(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "candidate-work.db") as client:
        created_response = client.post(
            "/candidate-work",
            json={
                "title": "Draft Story 6.4 import package parser",
                "requestedOutcome": "Turn BMAD output into a reviewed import package candidate.",
                "source": "bmad",
                "sourceArtifactPath": "docs/stories/6-4-bmad-import-package-parser.md",
                "sourceArtifactType": "bmad_story",
                "riskLevel": "medium",
                "priority": "high",
                "sortOrder": 5,
            },
        )

        assert created_response.status_code == 200
        candidate = created_response.json()["data"]
        assert candidate["title"] == "Draft Story 6.4 import package parser"
        assert candidate["source"] == "bmad"
        assert candidate["sourceArtifactPath"] == "docs/stories/6-4-bmad-import-package-parser.md"
        assert candidate["sourceArtifactType"] == "bmad_story"
        assert candidate["riskLevel"] == "medium"
        assert candidate["priority"] == "high"
        assert candidate["sortOrder"] == 5
        assert candidate["status"] == "proposed"
        assert candidate["approvedAt"] is None
        assert candidate["promotedWorkItemId"] is None

        work_items_response = client.get("/work-items")
        assert work_items_response.status_code == 200
        assert work_items_response.json()["data"] == []

        listed_response = client.get("/candidate-work")
        assert listed_response.status_code == 200
        assert [item["id"] for item in listed_response.json()["data"]] == [candidate["id"]]

        updated_response = client.patch(
            f"/candidate-work/{candidate['id']}",
            json={"status": "approved", "priority": "urgent", "sortOrder": 1},
        )

        assert updated_response.status_code == 200
        updated = updated_response.json()["data"]
        assert updated["status"] == "approved"
        assert updated["priority"] == "urgent"
        assert updated["sortOrder"] == 1
        assert updated["approvedAt"] is not None
        assert updated["promotedWorkItemId"] is None

        work_items_after_update_response = client.get("/work-items")
        assert work_items_after_update_response.status_code == 200
        assert work_items_after_update_response.json()["data"] == []


def test_candidate_work_rejects_invalid_enum_values_and_missing_candidate(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "candidate-work-validation.db") as client:
        valid_payload = {
            "title": "Invalid candidate",
            "requestedOutcome": "Reject invalid enum values.",
            "source": "bmad",
            "sourceArtifactPath": "docs/stories/invalid.md",
            "sourceArtifactType": "bmad_story",
            "riskLevel": "low",
            "priority": "normal",
        }

        for field_name, invalid_value in (
            ("source", "random_chat"),
            ("sourceArtifactType", "spreadsheet"),
            ("riskLevel", "extreme"),
            ("priority", "whenever"),
        ):
            invalid_payload = {**valid_payload, field_name: invalid_value}
            invalid_create = client.post("/candidate-work", json=invalid_payload)
            assert invalid_create.status_code == 422

        valid_create = client.post(
            "/candidate-work",
            json={
                "title": "Valid candidate",
                "requestedOutcome": "Validate updates.",
                "source": "chief_of_staff",
                "sourceArtifactPath": "_bmad-output/chief-of-staff/request.json",
                "sourceArtifactType": "chief_of_staff_request",
            },
        )
        assert valid_create.status_code == 200
        candidate_id = valid_create.json()["data"]["id"]

        invalid_update = client.patch(f"/candidate-work/{candidate_id}", json={"status": "started"})
        assert invalid_update.status_code == 422

        missing_update = client.patch("/candidate-work/not-found", json={"status": "deferred"})
        assert missing_update.status_code == 404
        assert missing_update.json()["detail"]["error"]["code"] == "candidate_work_not_found"

        invalid_import = client.post("/candidate-work/import-bmad", json={"artifactPath": "../README.md"})
        assert invalid_import.status_code == 400
        assert invalid_import.json()["detail"]["error"]["code"] == "invalid_bmad_import"


def test_candidate_work_promotes_once_into_active_work_with_metadata(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "candidate-work-promotion.db") as client:
        created_response = client.post(
            "/candidate-work",
            json={
                "title": "Promote proposed work",
                "requestedOutcome": "Create exactly one active work item.",
                "source": "operator",
                "sourceArtifactPath": "docs/stories/6-6-candidate-priority-order-promote.md",
                "sourceArtifactType": "bmad_story",
                "riskLevel": "medium",
                "priority": "high",
                "sortOrder": 2,
            },
        )
        assert created_response.status_code == 200
        candidate_id = created_response.json()["data"]["id"]

        rejected_promotion = client.post(f"/candidate-work/{candidate_id}/promote")
        assert rejected_promotion.status_code == 400
        assert rejected_promotion.json()["detail"]["error"]["code"] == "candidate_work_promotion_rejected"

        approved_response = client.patch(f"/candidate-work/{candidate_id}", json={"status": "approved"})
        assert approved_response.status_code == 200

        promoted_response = client.post(f"/candidate-work/{candidate_id}/promote")
        assert promoted_response.status_code == 200
        promoted = promoted_response.json()["data"]
        promoted_candidate = promoted["candidateWork"]
        work_item = promoted["workItem"]
        assert promoted_candidate["promotedWorkItemId"] == work_item["id"]
        assert work_item["title"] == "Promote proposed work"
        assert work_item["requestedOutcome"] == "Create exactly one active work item."
        assert work_item["source"] == f"candidate_work:{candidate_id}"
        assert work_item["state"] == "queued"
        assert work_item["metadata"]["candidateWorkId"] == candidate_id
        assert work_item["metadata"]["sourceArtifactPath"] == "docs/stories/6-6-candidate-priority-order-promote.md"
        assert work_item["metadata"]["candidatePriority"] == "high"
        assert work_item["metadata"]["candidateSortOrder"] == 2

        duplicate_promotion = client.post(f"/candidate-work/{candidate_id}/promote")
        assert duplicate_promotion.status_code == 400

        work_items_response = client.get("/work-items")
        assert work_items_response.status_code == 200
        assert len(work_items_response.json()["data"]) == 1

        events_response = client.get(f"/work-items/{work_item['id']}/events")
        assert events_response.status_code == 200
        events = events_response.json()["data"]
        promotion_event = next(event for event in events if event["eventType"] == "candidate_work.promoted")
        assert promotion_event["payload"]["candidateWorkId"] == candidate_id
        assert promotion_event["payload"]["sourceArtifactType"] == "bmad_story"


def test_candidate_work_list_uses_sort_order(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "candidate-work-order.db") as client:
        for title, sort_order in (("Second", 20), ("First", 10)):
            response = client.post(
                "/candidate-work",
                json={
                    "title": title,
                    "requestedOutcome": "Keep proposed work ordered.",
                    "source": "bmad",
                    "sourceArtifactPath": f"docs/stories/{title.lower()}.md",
                    "sourceArtifactType": "bmad_story",
                    "sortOrder": sort_order,
                },
            )
            assert response.status_code == 200

        listed_response = client.get("/candidate-work")
        assert listed_response.status_code == 200
        assert [item["title"] for item in listed_response.json()["data"]] == ["First", "Second"]


def test_synthetic_bmad_artifact_flows_through_candidate_active_preview_and_attempt_evidence(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "synthetic-bmad-proof.db") as client:
        import_response = client.post(
            "/candidate-work/import-bmad",
            json={
                "artifactPath": "docs/product/epic-6-synthetic-dev-console-label-copy.md",
                "sortOrder": 7,
            },
        )
        assert import_response.status_code == 200
        candidate = import_response.json()["data"]
        candidate_id = candidate["id"]
        assert candidate["title"] == "Review Update Dev Console Label Copy"
        assert candidate["source"] == "bmad"
        assert candidate["sourceArtifactPath"] == "docs/product/epic-6-synthetic-dev-console-label-copy.md"
        assert candidate["sourceArtifactType"] == "bmad_research"
        assert candidate["riskLevel"] == "low"
        assert candidate["priority"] == "high"
        assert candidate["sortOrder"] == 7
        assert candidate["status"] == "proposed"
        assert "As Bob," in candidate["requestedOutcome"]

        assert client.patch(f"/candidate-work/{candidate_id}", json={"status": "approved"}).status_code == 200
        promote_response = client.post(f"/candidate-work/{candidate_id}/promote")
        assert promote_response.status_code == 200
        promoted = promote_response.json()["data"]
        work_item = promoted["workItem"]
        work_item_id = work_item["id"]
        assert promoted["candidateWork"]["promotedWorkItemId"] == work_item_id
        assert work_item["source"] == f"candidate_work:{candidate_id}"
        assert work_item["metadata"]["sourceArtifactPath"] == "docs/product/epic-6-synthetic-dev-console-label-copy.md"
        assert work_item["metadata"]["sourceArtifactType"] == "bmad_research"
        assert work_item["metadata"]["candidatePriority"] == "high"

        packet_response = client.get(f"/work-items/{work_item_id}/task-packet-preview")
        assert packet_response.status_code == 200
        packet_preview = packet_response.json()["data"]
        packet = packet_preview["packet"]
        assert packet["workItemId"] == work_item_id
        assert packet["sourceArtifactPath"] == "docs/product/epic-6-synthetic-dev-console-label-copy.md"
        assert packet["priority"] == "high"
        assert packet_preview["previewOnly"] is True
        assert packet_preview["executionAttemptCreated"] is False
        assert packet_preview["providerCallsAllowed"] is False
        assert packet_preview["commandExecutionAllowed"] is False

        routing_response = client.post(
            f"/work-items/{work_item_id}/routing-preview",
            json={"taskKind": "evidence_summary", "recordEvent": True},
        )
        assert routing_response.status_code == 200
        route = routing_response.json()["data"]["decision"]
        assert route["workItemId"] == work_item_id
        assert route["selectedLane"] == "local_readonly"
        assert route["authorityMode"] == "advisory"

        attempt_response = client.post(
            f"/work-items/{work_item_id}/execution-attempts",
            json={"taskKind": "evidence_summary", "actorId": "synthetic-proof", "actorLabel": "Synthetic Proof"},
        )
        assert attempt_response.status_code == 200
        attempt = attempt_response.json()["data"]
        assert attempt["status"] == "rejected"
        assert attempt["lane"] == "local_readonly"
        assert attempt["authorityMode"] == "advisory"
        assert attempt["workspaceIsolationPlan"]["commandsAllowed"] is False
        assert attempt["workspaceIsolationPlan"]["sourceMutationAllowed"] is False
        assert attempt["workspaceIsolationPlan"]["networkAllowed"] is False
        assert attempt["workspaceIsolationPlan"]["credentialAccessAllowed"] is False
        assert len(attempt["artifactRefs"]) == 1
        packet_ref = attempt["artifactRefs"][0]
        assert packet_ref["artifactType"] == "task_packet_v0"
        assert packet_ref["sourceArtifactPath"] == "docs/product/epic-6-synthetic-dev-console-label-copy.md"
        assert packet_ref["taskKind"] == "evidence_summary"
        assert packet_ref["previewOnly"] is True
        assert packet_ref["executionAllowed"] is False
        assert "Acceptance Criteria" not in str(packet_ref)

        export_response = client.get(f"/work-items/{work_item_id}/runtime-evidence-export")
        assert export_response.status_code == 200
        export = export_response.json()["data"]
        assert export["workItem"]["metadata"]["candidateWorkId"] == candidate_id
        assert export["workItem"]["metadata"]["sourceArtifactPath"] == "docs/product/epic-6-synthetic-dev-console-label-copy.md"
        assert export["executionAttempts"][0]["attemptId"] == attempt["attemptId"]
        assert export["executionAttempts"][0]["artifactRefs"][0]["artifactType"] == "task_packet_v0"
        assert export["safety"]["processLaunchAllowed"] is False
        assert export["safety"]["providerCallsAllowed"] is False
        assert export["safety"]["commandExecutionAllowed"] is False
        assert export["safety"]["sourceMutationAllowed"] is False

        events_response = client.get(f"/work-items/{work_item_id}/events")
        assert events_response.status_code == 200
        event_types = [event["eventType"] for event in events_response.json()["data"]]
        assert "candidate_work.promoted" in event_types
        assert "routing.preview_recorded" in event_types
        assert "execution_attempt.rejected" in event_types
