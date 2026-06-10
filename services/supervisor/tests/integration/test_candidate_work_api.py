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
            json={"status": "approved", "priority": "urgent"},
        )

        assert updated_response.status_code == 200
        updated = updated_response.json()["data"]
        assert updated["status"] == "approved"
        assert updated["priority"] == "urgent"
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
