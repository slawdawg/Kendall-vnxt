import json
from pathlib import Path

from supervisor.api.schemas import OperationalActionRequest, _is_safe_epic_25_policy_text, _is_safe_pipeline_control_text


def test_epic25_policy_text_filter_matches_shared_parity_vectors() -> None:
    fixture_path = Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "epic25-policy-text-parity.json"
    cases = json.loads(fixture_path.read_text(encoding="utf-8"))

    for case in cases:
        assert _is_safe_epic_25_policy_text(case["value"]) is case["safe"], case["value"]


def test_general_operational_metadata_allows_prose_with_runtime_names() -> None:
    prose_values = ["worker node is healthy", "python worker is healthy"]

    for value in prose_values:
        assert _is_safe_pipeline_control_text(value)

    request = OperationalActionRequest(
        actionId="inspect",
        targetId="packet-epic-25",
        idempotencyKey="inspect-epic-25",
        correlationId="corr-epic-25",
        requestedBy={"actorType": "operator", "actorId": "pipeline-operator"},
        requestedAuthorityState="not_required",
        requestedRiskTier="low",
        operatorIntentSummary="worker node is healthy",
        testNotes="python worker is healthy",
        evidenceRefs=["evidence:epic-25-metadata"],
    )

    assert request.operatorIntentSummary == "worker node is healthy"
    assert request.testNotes == "python worker is healthy"
