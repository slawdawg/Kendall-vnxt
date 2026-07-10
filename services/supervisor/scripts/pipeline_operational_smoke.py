"""Run the bounded local-proof Operational Pipeline Action Loop smoke.

The smoke uses a disposable SQLite database and the real FastAPI routes. It
does not contact providers, launch workers, or retain raw payloads.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path


def fail(message: str) -> None:
    raise RuntimeError(message)


def require(response, expected_status: int, label: str) -> dict:
    if response.status_code != expected_status:
        fail(f"{label} returned HTTP {response.status_code}: {response.text[:240]}")
    payload = response.json()
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), dict):
        fail(f"{label} did not return a data envelope")
    return payload["data"]


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="kendall-pipeline-smoke-") as temp_dir:
        db_path = Path(temp_dir) / "smoke.db"
        os.environ["SUPERVISOR_DATABASE_URL"] = f"sqlite+aiosqlite:///{db_path}"
        os.environ["SUPERVISOR_ENABLE_BACKGROUND"] = "false"
        source_ref = {
            "refId": "prd:_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-operational-pipeline-action-loop/prd.md",
            "sourceType": "prd",
            "pathOrUrl": "_bmad-output/planning-artifacts/prds/prd-Kendall_Nxt-2026-07-04-operational-pipeline-action-loop/prd.md",
            "title": "Operational pipeline action loop",
        }
        ready_to_test = {
            "readyId": "ready:operational-pipeline-smoke",
            "userFacingSummary": "The bounded operational action loop is ready to test.",
            "testableSurface": "/pipeline packet detail actions",
            "verificationRefs": ["test:pipeline-operational-smoke"],
            "evidenceRefs": ["evidence:pipeline-operational-smoke"],
        }

        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
        from fastapi.testclient import TestClient
        from supervisor.api.main import app

        with TestClient(app) as client:
            packet = require(
                client.post(
                    "/pipeline-control-plane/work-packets",
                    json={
                        "packetId": "packet-pipeline-operational-smoke",
                        "title": "Pipeline operational smoke packet",
                        "initialStage": "review",
                        "status": "waiting",
                        "sourceRef": source_ref,
                        "actor": {"actorType": "manager", "actorId": "smoke-manager", "actorLabel": "Smoke manager"},
                        "idempotencyKey": "create-pipeline-operational-smoke",
                        "correlationId": "corr-create-pipeline-operational-smoke",
                        "evidenceRefs": ["test:pipeline-operational-smoke"],
                        "readyToTest": ready_to_test,
                    },
                ),
                200,
                "packet seed",
            )
            projection = require(client.get("/pipeline-control-plane/projection"), 200, "projection")
            if projection["runtimeReadiness"]["operationalMode"] != "local_proof":
                fail("projection did not report local_proof runtime readiness")
            detail = next(item for item in projection["selectedPacketDetails"] if item["packetId"] == packet["packetId"])
            if detail["readyToTest"]["readyId"] != ready_to_test["readyId"]:
                fail("ready-to-test metadata did not survive projection")

            action_payload = {
                "actionId": "mark_tested",
                "targetType": "work_packet",
                "targetId": packet["packetId"],
                "idempotencyKey": "smoke-mark-tested-pass",
                "correlationId": "corr-smoke-mark-tested-pass",
                "requestedBy": {"actorType": "operator", "actorId": "smoke-operator", "actorLabel": "Smoke operator"},
                "requestedAuthorityState": "needs_product_approval",
                "requestedRiskTier": "medium",
                "expectedCurrentEventId": packet["currentEventId"],
                "operatorIntentSummary": "Record the smoke operator pass decision.",
                "evidenceRefs": ["evidence:product-test-approval"],
                "testResult": "pass",
            }
            action = require(client.post("/pipeline-control-plane/actions", json=action_payload), 200, "mark tested")
            duplicate = require(client.post("/pipeline-control-plane/actions", json=action_payload), 200, "idempotent replay")
            if action["outcome"] != "succeeded" or action["resultingStage"] != "promote":
                fail("mark tested did not advance the packet to promote")
            if duplicate["actionRecordId"] != action["actionRecordId"]:
                fail("idempotent action replay returned a different action record")

            blocked = require(
                client.post(
                    "/pipeline-control-plane/actions",
                    json={
                        **action_payload,
                        "actionId": "requeue",
                        "idempotencyKey": "smoke-requeue-without-approval",
                        "correlationId": "corr-smoke-requeue-without-approval",
                        "requestedAuthorityState": "needs_authority_approval",
                        "expectedCurrentEventId": None,
                        "testResult": None,
                        "evidenceRefs": ["evidence:operator-requested-requeue"],
                    },
                ),
                200,
                "blocked approval action",
            )
            if blocked["outcome"] != "blocked" or blocked["typedReason"] != "blocked_by_approval":
                fail("missing approval did not remain a typed blocked result")

            print(
                json.dumps(
                    {
                        "schemaVersion": "pipeline-operational-action-loop-proof/v0",
                        "status": "passed",
                        "truthLabel": "live_backend_local_proof",
                        "runtimeMode": projection["runtimeReadiness"]["operationalMode"],
                        "packetId": packet["packetId"],
                        "resultingStage": action["resultingStage"],
                        "idempotentActionRecordId": action["actionRecordId"],
                        "blockedReason": blocked["typedReason"],
                        "evidenceRefs": [
                            "test:pipeline-operational-smoke",
                            "evidence:pipeline-operational-smoke",
                            "evidence:product-test-approval",
                        ],
                        "metadataOnly": True,
                        "rawPayloadRetained": False,
                    },
                    sort_keys=True,
                )
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
