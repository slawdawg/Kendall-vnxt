import sys
from pathlib import Path

from fastapi.testclient import TestClient


SYNTHETIC_BMAD_ARTIFACT_PATH = "_bmad-output/planning-artifacts/stories/dev-console-label-copy.md"
SYNTHETIC_BMAD_ARTIFACT = """# Update Dev Console Label Copy

Status: Review
RiskLevel: low

## Story

As an operator,
I want the Dev Console labels to use plain language,
so that I can understand work status without developer terminology.

## Acceptance Criteria

1. Proposed Work labels use plain language.
2. Active Work labels avoid internal orchestration jargon.
3. Detail panels keep technical evidence available behind clear headings.
4. No worker launch, provider call, command execution, Git operation, or GitHub operation is required.

## Authority

Allowed:

- metadata-only BMAD import,
- Candidate Work approval and promotion,
- routing preview,
- fake or blocked execution attempt evidence.

Blocked:

- real Codex launch,
- real Claude launch,
- provider calls,
- shell command execution outside tests,
- source mutation by workers,
- Git or GitHub operations.

## Verification

- Import this artifact as Candidate Work.
- Promote it into Active Work after approval.
- Generate a routing preview and fake or blocked execution attempt.
- Confirm Dev Console evidence links the attempt to the source artifact and Task Packet.
"""


def _reset_supervisor_modules() -> None:
    for module_name in list(sys.modules):
        if module_name == "supervisor" or module_name.startswith("supervisor."):
            sys.modules.pop(module_name, None)


def _client(tmp_path, monkeypatch, db_name: str, repo_root: Path | None = None) -> TestClient:
    _reset_supervisor_modules()
    db_path = (tmp_path / db_name).as_posix()
    monkeypatch.setenv("SUPERVISOR_DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setenv("SUPERVISOR_ENABLE_BACKGROUND", "false")

    from supervisor.api import main as api_main

    if repo_root is not None:
        monkeypatch.setattr(api_main.service, "_repo_root", lambda: repo_root.as_posix())

    return TestClient(api_main.app)


def _write_synthetic_bmad_fixture(repo_root: Path) -> Path:
    artifact_path = repo_root / SYNTHETIC_BMAD_ARTIFACT_PATH
    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    artifact_path.write_text(SYNTHETIC_BMAD_ARTIFACT, encoding="utf-8")
    return artifact_path


def test_candidate_work_can_be_created_listed_and_updated_without_active_work(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "candidate-work.db") as client:
        created_response = client.post(
            "/candidate-work",
            json={
                "title": "Draft Story 6.4 import package parser",
                "requestedOutcome": "Turn BMAD output into a reviewed import package candidate.",
                "source": "bmad",
                "sourceArtifactPath": "docs/workflows/implementation-evidence-boundary.md",
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
        assert candidate["sourceArtifactPath"] == "docs/workflows/implementation-evidence-boundary.md"
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
            "sourceArtifactPath": "docs/workflows/implementation-evidence-boundary.md",
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
                "sourceArtifactPath": "docs/workflows/implementation-evidence-boundary.md",
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
        assert work_item["metadata"]["sourceArtifactPath"] == "docs/workflows/implementation-evidence-boundary.md"
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


def test_candidate_work_promotion_preserves_source_refs_and_audit_evidence(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "candidate-work-source-ref-promotion.db") as client:
        created_response = client.post(
            "/candidate-work",
            json={
                "title": "Promote sourced work",
                "requestedOutcome": "Keep source provenance attached to active work.",
                "source": "bmad",
                "sourceArtifactPath": "_bmad-output/implementation-artifacts/2-2-preserve-source-refs-through-candidate-promotion.md",
                "sourceArtifactType": "bmad_story",
                "riskLevel": "medium",
                "priority": "high",
                "sortOrder": 3,
                "importMetadata": {
                    "verificationSummary": "Candidate source refs were approved for metadata-only promotion.",
                    "workPacketSourceRefs": [
                        {
                            "refId": "obsidian:00-inbox/customer-signal",
                            "sourceType": "obsidian",
                            "label": "Customer signal",
                            "pathOrUrl": "00 Inbox/customer-signal.md",
                            "freshness": "fresh",
                            "accessState": "allowed",
                            "canonical": True,
                            "summaryOnly": True,
                        },
                        {
                            "refId": "source:malformed",
                            "sourceType": "private_vault",
                            "label": "Malformed source ref",
                            "pathOrUrl": "Private/raw-note.md",
                            "freshness": "ancient",
                            "accessState": "allowed",
                            "canonical": False,
                            "summaryOnly": False,
                        },
                        {
                            "refId": "llm-wiki:derived-summary",
                            "sourceType": "llm_wiki",
                            "label": "Derived LLM-Wiki summary",
                            "pathOrUrl": "llm-wiki/derived-summary.md",
                            "freshness": "fresh",
                            "accessState": "allowed",
                            "canonical": True,
                            "summaryOnly": True,
                        },
                        {
                            "refId": "github:missing-pr",
                            "sourceType": "github",
                            "label": "Missing GitHub PR",
                            "pathOrUrl": "https://github.com/slawdawg/Kendall-vnxt/pull/0",
                            "freshness": "unknown",
                            "accessState": "missing",
                            "canonical": False,
                            "summaryOnly": True,
                        },
                        {
                            "refId": "obsidian:contradictory-note",
                            "sourceType": "obsidian",
                            "label": "Contradictory note",
                            "pathOrUrl": "00 Inbox/contradictory-note.md",
                            "freshness": "fresh",
                            "accessState": "allowed",
                            "canonical": True,
                            "summaryOnly": True,
                            "contradictionStatus": "confirmed",
                        },
                    ],
                    "promotionEvidenceRefs": ["candidate-import:source-ref-check"],
                    "rawContent": "this raw source content must not be promoted",
                    "providerPayload": {"secret": "must not be retained"},
                },
            },
        )
        assert created_response.status_code == 200
        candidate_id = created_response.json()["data"]["id"]
        assert client.patch(f"/candidate-work/{candidate_id}", json={"status": "approved"}).status_code == 200

        promoted_response = client.post(f"/candidate-work/{candidate_id}/promote")
        assert promoted_response.status_code == 200
        promoted = promoted_response.json()["data"]
        work_item = promoted["workItem"]
        work_item_id = promoted["workItem"]["id"]
        persisted_refs_by_id = {ref["refId"]: ref for ref in work_item["metadata"]["workPacketSourceRefs"]}
        assert persisted_refs_by_id["source:malformed"]["accessState"] == "blocked"
        assert persisted_refs_by_id["source:malformed"]["summaryOnly"] is True
        assert persisted_refs_by_id["source:malformed"]["pathOrUrl"] is None
        assert persisted_refs_by_id["source:malformed"]["blockedReason"] == (
            "invalid source type; invalid freshness; unsafe non-summary source metadata"
        )
        assert work_item["metadata"]["importMetadata"]["workPacketSourceRefs"] == work_item["metadata"]["workPacketSourceRefs"]
        assert "rawContent" not in work_item["metadata"]["importMetadata"]
        assert "providerPayload" not in work_item["metadata"]["importMetadata"]

        packet_response = client.get(f"/work-packets/work_item:{work_item_id}")
        assert packet_response.status_code == 200
        packet = packet_response.json()["data"]
        refs_by_id = {ref["refId"]: ref for ref in packet["sourceRefs"]}
        assert refs_by_id["obsidian:00-inbox/customer-signal"] == {
            "refId": "obsidian:00-inbox/customer-signal",
            "sourceType": "obsidian",
            "label": "Customer signal",
            "pathOrUrl": "00 Inbox/customer-signal.md",
            "freshness": "fresh",
            "accessState": "allowed",
            "canonical": True,
            "summaryOnly": True,
            "blockedReason": None,
        }
        blocked_ref = refs_by_id["source:malformed"]
        assert blocked_ref["sourceType"] == "manual"
        assert blocked_ref["freshness"] == "unknown"
        assert blocked_ref["accessState"] == "blocked"
        assert blocked_ref["canonical"] is False
        assert blocked_ref["summaryOnly"] is True
        assert blocked_ref["pathOrUrl"] is None
        assert blocked_ref["blockedReason"] == "invalid source type; invalid freshness; unsafe non-summary source metadata"
        llm_wiki_ref = refs_by_id["llm-wiki:derived-summary"]
        assert llm_wiki_ref["accessState"] == "allowed"
        assert llm_wiki_ref["canonical"] is False
        assert llm_wiki_ref["summaryOnly"] is True
        assert llm_wiki_ref["blockedReason"] is None
        missing_ref = refs_by_id["github:missing-pr"]
        assert missing_ref["sourceType"] == "github"
        assert missing_ref["accessState"] == "missing"
        assert missing_ref["canonical"] is False
        assert missing_ref["pathOrUrl"] is None
        assert missing_ref["blockedReason"] == "source ref is missing or unavailable"
        contradictory_ref = refs_by_id["obsidian:contradictory-note"]
        assert contradictory_ref["sourceType"] == "obsidian"
        assert contradictory_ref["accessState"] == "blocked"
        assert contradictory_ref["canonical"] is True
        assert contradictory_ref["pathOrUrl"] is None
        assert contradictory_ref["blockedReason"] == "contradictory source metadata: confirmed"

        events_response = client.get(f"/work-items/{work_item_id}/events")
        assert events_response.status_code == 200
        promotion_event = next(event for event in events_response.json()["data"] if event["eventType"] == "candidate_work.promoted")
        assert promotion_event["actorType"] == "system"
        assert promotion_event["payload"]["actor"] == {"type": "system", "id": None, "label": None}
        assert promotion_event["payload"]["authority"] == {
            "operation": "candidate_work.promotion",
            "mode": "explicit_candidate_approval",
        }
        assert promotion_event["payload"]["approval"]["status"] == "approved"
        assert promotion_event["payload"]["approval"]["approvedAt"] is not None
        assert promotion_event["payload"]["approval"]["approvedBy"] is None
        assert promotion_event["payload"]["approval"]["approvalReference"] is None
        assert promotion_event["payload"]["before"] == {"candidateStatus": "approved", "promotedWorkItemId": None}
        assert promotion_event["payload"]["after"]["candidateStatus"] == "approved"
        assert promotion_event["payload"]["after"]["promotedWorkItemId"] == work_item_id
        assert promotion_event["payload"]["evidenceRefs"] == ["candidate-import:source-ref-check"]
        assert promotion_event["payload"]["workPacketSourceRefs"] == [
            "obsidian:00-inbox/customer-signal",
            "source:malformed",
            "llm-wiki:derived-summary",
            "github:missing-pr",
            "obsidian:contradictory-note",
        ]


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
    repo_root = tmp_path / "repo"
    _write_synthetic_bmad_fixture(repo_root)
    with _client(tmp_path, monkeypatch, "synthetic-bmad-proof.db", repo_root=repo_root) as client:
        import_response = client.post(
            "/candidate-work/import-bmad",
            json={
                "artifactPath": SYNTHETIC_BMAD_ARTIFACT_PATH,
                "sortOrder": 7,
            },
        )
        assert import_response.status_code == 200
        candidate = import_response.json()["data"]
        candidate_id = candidate["id"]
        assert candidate["title"] == "Review Update Dev Console Label Copy"
        assert candidate["source"] == "bmad"
        assert candidate["sourceArtifactPath"] == SYNTHETIC_BMAD_ARTIFACT_PATH
        assert candidate["sourceArtifactType"] == "bmad_story"
        assert candidate["riskLevel"] == "low"
        assert candidate["priority"] == "high"
        assert candidate["sortOrder"] == 7
        assert candidate["status"] == "proposed"
        assert "As an operator," in candidate["requestedOutcome"]
        assert candidate["importMetadata"]["retentionPolicy"] == "metadata_only_no_raw_artifact_content"
        assert candidate["importMetadata"]["artifactTitle"] == "Update Dev Console Label Copy"
        assert "Proposed Work labels use plain language." in candidate["importMetadata"]["acceptanceCriteria"]
        assert "Import this artifact as Candidate Work." in candidate["importMetadata"]["verificationSummary"]

        assert client.patch(f"/candidate-work/{candidate_id}", json={"status": "approved"}).status_code == 200
        promote_response = client.post(f"/candidate-work/{candidate_id}/promote")
        assert promote_response.status_code == 200
        promoted = promote_response.json()["data"]
        work_item = promoted["workItem"]
        work_item_id = work_item["id"]
        assert promoted["candidateWork"]["promotedWorkItemId"] == work_item_id
        assert work_item["source"] == f"candidate_work:{candidate_id}"
        assert work_item["metadata"]["sourceArtifactPath"] == SYNTHETIC_BMAD_ARTIFACT_PATH
        assert work_item["metadata"]["sourceArtifactType"] == "bmad_story"
        assert work_item["metadata"]["candidatePriority"] == "high"
        assert work_item["metadata"]["verificationSummary"] == candidate["importMetadata"]["verificationSummary"]
        assert work_item["metadata"]["acceptanceCriteriaSummary"] == candidate["importMetadata"]["acceptanceCriteria"]

        packet_response = client.get(f"/work-items/{work_item_id}/task-packet-preview")
        assert packet_response.status_code == 200
        packet_preview = packet_response.json()["data"]
        packet = packet_preview["packet"]
        assert packet["workItemId"] == work_item_id
        assert packet["sourceArtifactPath"] == SYNTHETIC_BMAD_ARTIFACT_PATH
        assert packet["priority"] == "high"
        assert packet["verificationSummary"] == candidate["importMetadata"]["verificationSummary"]
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
        assert packet_ref["sourceArtifactPath"] == SYNTHETIC_BMAD_ARTIFACT_PATH
        assert packet_ref["taskKind"] == "evidence_summary"
        assert packet_ref["previewOnly"] is True
        assert packet_ref["executionAllowed"] is False
        assert "Acceptance Criteria" not in str(packet_ref)

        export_response = client.get(f"/work-items/{work_item_id}/runtime-evidence-export")
        assert export_response.status_code == 200
        export = export_response.json()["data"]
        assert export["workItem"]["metadata"]["candidateWorkId"] == candidate_id
        assert export["workItem"]["metadata"]["sourceArtifactPath"] == SYNTHETIC_BMAD_ARTIFACT_PATH
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


def test_source_owned_boundary_docs_are_not_imported_as_bmad_artifacts(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "real-bmad-proof.db") as client:
        import_response = client.post(
            "/candidate-work/import-bmad",
            json={
                "artifactPath": "docs/workflows/implementation-evidence-boundary.md",
                "sortOrder": 11,
            },
        )
        assert import_response.status_code == 400
        assert import_response.json()["detail"]["error"]["code"] == "invalid_bmad_import"
        assert "outside supported artifact roots" in import_response.json()["detail"]["error"]["message"]


def test_approved_obsidian_metadata_import_flows_into_candidate_work_and_packets(tmp_path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch, "obsidian-metadata-import.db") as client:
        import_response = client.post(
            "/candidate-work/import-obsidian-metadata",
            json={
                "title": "Review source reconciliation note",
                "requestedOutcome": "Turn approved Obsidian metadata into Candidate Work without copying note content.",
                "sourceArtifactPath": "00 Inbox/source-reconciliation.md",
                "sourceRef": "obsidian:00 Inbox/source-reconciliation.md",
                "evidenceRefs": ["evidence:obsidian-approval:source-reconciliation"],
                "approvalStatus": "approved",
                "approvedBy": "operator",
                "approvedAt": "2026-06-27T00:00:00Z",
                "freshness": "fresh",
                "riskLevel": "medium",
                "priority": "high",
                "sortOrder": 4,
            },
        )
        assert import_response.status_code == 200
        candidate = import_response.json()["data"]
        candidate_id = candidate["id"]
        assert candidate["source"] == "obsidian"
        assert candidate["sourceArtifactPath"] == "00 Inbox/source-reconciliation.md"
        assert candidate["sourceArtifactType"] == "obsidian_metadata"
        assert candidate["riskLevel"] == "medium"
        assert candidate["priority"] == "high"
        assert candidate["status"] == "proposed"
        assert candidate["sortOrder"] == 4
        assert candidate["importMetadata"]["retentionPolicy"] == "metadata_only_no_raw_obsidian_content"
        assert candidate["importMetadata"]["approvalStatus"] == "approved"
        assert candidate["importMetadata"]["approvedBy"] == "operator"
        assert candidate["importMetadata"]["approvedAt"] == "2026-06-27T00:00:00+00:00"
        assert candidate["importMetadata"]["canonicalMutationAllowed"] is False
        assert candidate["importMetadata"]["sourceMutationAllowed"] is False
        assert candidate["importMetadata"]["workPacketSourceRefs"] == [
            {
                "refId": "obsidian:00 Inbox/source-reconciliation.md",
                "sourceType": "obsidian",
                "label": "Approved Obsidian metadata: Review source reconciliation note",
                "pathOrUrl": "00 Inbox/source-reconciliation.md",
                "freshness": "fresh",
                "accessState": "allowed",
            }
        ]
        assert "rawContent" not in candidate["importMetadata"]
        assert "content" not in candidate["importMetadata"]

        candidate_packet = client.get(f"/work-packets/candidate_work:{candidate_id}").json()["data"]
        candidate_source_types = {ref["sourceType"] for ref in candidate_packet["sourceRefs"]}
        assert candidate_source_types == {"candidate_work", "obsidian"}
        assert candidate_packet["alphaMemorySourceStatus"]["decisionState"] == "blocked"
        assert "approval_metadata.missing" in candidate_packet["alphaMemorySourceStatus"]["blockedReasons"]
        assert "evidence:obsidian-approval:source-reconciliation" in [
            ref["refId"] for ref in candidate_packet["evidenceRefs"]
        ]

        invalid_response = client.post(
            "/candidate-work/import-obsidian-metadata",
            json={
                "title": "Rejected metadata",
                "requestedOutcome": "This must not import.",
                "sourceArtifactPath": "00 Inbox/rejected.md",
                "sourceRef": "obsidian:00 Inbox/rejected.md",
                "evidenceRefs": ["evidence:obsidian-approval:rejected"],
                "approvalStatus": "pending",
                "approvedBy": "operator",
                "approvedAt": "2026-06-27T00:00:00Z",
            },
        )
        assert invalid_response.status_code == 400
        assert invalid_response.json()["detail"]["error"]["code"] == "invalid_obsidian_metadata_import"

        invalid_cases = [
            (
                "missing approvedBy",
                {
                    "approvedAt": "2026-06-27T00:00:00Z",
                },
                "approvedBy provenance",
            ),
            (
                "missing approvedAt",
                {
                    "approvedBy": "operator",
                },
                "approvedAt provenance",
            ),
            (
                "unsafe source path",
                {
                    "sourceArtifactPath": "../secrets.md",
                    "approvedBy": "operator",
                    "approvedAt": "2026-06-27T00:00:00Z",
                },
                "vault-relative",
            ),
            (
                "invalid source ref",
                {
                    "sourceRef": "manual:00 Inbox/source-reconciliation.md",
                    "approvedBy": "operator",
                    "approvedAt": "2026-06-27T00:00:00Z",
                },
                "sourceRef must start with obsidian:",
            ),
            (
                "mismatched source ref",
                {
                    "sourceRef": "obsidian:00 Inbox/other-note.md",
                    "approvedBy": "operator",
                    "approvedAt": "2026-06-27T00:00:00Z",
                },
                "sourceRef must match sourceArtifactPath",
            ),
            (
                "empty evidence refs",
                {
                    "evidenceRefs": [],
                    "approvedBy": "operator",
                    "approvedAt": "2026-06-27T00:00:00Z",
                },
                "at least one evidence ref",
            ),
        ]
        base_payload = {
            "title": "Invalid approved metadata",
            "requestedOutcome": "This must not import.",
            "sourceArtifactPath": "00 Inbox/source-reconciliation.md",
            "sourceRef": "obsidian:00 Inbox/source-reconciliation.md",
            "evidenceRefs": ["evidence:obsidian-approval:source-reconciliation"],
            "approvalStatus": "approved",
        }
        for _case_name, overrides, expected_message in invalid_cases:
            invalid_case_response = client.post(
                "/candidate-work/import-obsidian-metadata",
                json={**base_payload, **overrides},
            )
            assert invalid_case_response.status_code == 400
            assert invalid_case_response.json()["detail"]["error"]["code"] == "invalid_obsidian_metadata_import"
            assert expected_message in invalid_case_response.json()["detail"]["error"]["message"]

        assert client.patch(f"/candidate-work/{candidate_id}", json={"status": "approved"}).status_code == 200
        promote_response = client.post(f"/candidate-work/{candidate_id}/promote")
        assert promote_response.status_code == 200
        work_item = promote_response.json()["data"]["workItem"]
        assert work_item["source"] == f"candidate_work:{candidate_id}"
        assert work_item["metadata"]["source"] == "obsidian"
        assert work_item["metadata"]["sourceArtifactType"] == "obsidian_metadata"
        assert work_item["metadata"]["workPacketSourceRefs"][0]["sourceType"] == "obsidian"
        assert work_item["metadata"]["importMetadata"]["retentionPolicy"] == "metadata_only_no_raw_obsidian_content"

        packet = client.get(f"/work-packets/work_item:{work_item['id']}").json()["data"]
        assert {ref["sourceType"] for ref in packet["sourceRefs"]} == {"candidate_work", "work_item", "obsidian"}
        obsidian_ref = next(ref for ref in packet["sourceRefs"] if ref["sourceType"] == "obsidian")
        assert obsidian_ref["summaryOnly"] is True
        assert obsidian_ref["accessState"] == "allowed"
        assert obsidian_ref["pathOrUrl"] == "00 Inbox/source-reconciliation.md"
        assert "evidence:obsidian-approval:source-reconciliation" in [ref["refId"] for ref in packet["evidenceRefs"]]
