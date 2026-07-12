import json
from pathlib import Path

from supervisor.api.schemas import _is_safe_epic_25_policy_text


def test_epic25_policy_text_filter_matches_shared_parity_vectors() -> None:
    fixture_path = Path(__file__).resolve().parents[3] / "tests" / "fixtures" / "epic25-policy-text-parity.json"
    cases = json.loads(fixture_path.read_text(encoding="utf-8"))

    for case in cases:
        assert _is_safe_epic_25_policy_text(case["value"]) is case["safe"], case["value"]
