import importlib.util
import json
import sys
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[4]
SCRIPT_PATH = (
    PROJECT_ROOT
    / ".agents/skills/knx-source-evidence-validator/scripts/validate_source_evidence.py"
)
FIXTURE_PACK = PROJECT_ROOT / "_bmad/memory/knx/fixtures/synthetic/first-fixture-pack.json"
SOURCE_PACKET_EXAMPLES = (
    PROJECT_ROOT
    / "_bmad/memory/knx/runtime/source-packets/source-packet-examples-2026-06-01.json"
)


spec = importlib.util.spec_from_file_location("validate_source_evidence", SCRIPT_PATH)
validator = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules["validate_source_evidence"] = validator
spec.loader.exec_module(validator)


class SourceEvidenceValidatorTests(unittest.TestCase):
    def test_current_fixture_pack_passes(self):
        result = validator.validate_fixture_pack(FIXTURE_PACK)

        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["summary"]["fixture_count"], 14)
        self.assertEqual(result["summary"]["errors"], 0)
        self.assertEqual(result["summary"]["warnings"], 0)
        self.assertEqual(result["findings"], [])

    def test_required_negative_fixture_types_are_present(self):
        result = validator.validate_fixture_pack(FIXTURE_PACK)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertNotIn("missing-required-fixture-type", codes)

    def test_source_mutation_negative_is_valid_expected_failure(self):
        result = validator.validate_fixture_pack(FIXTURE_PACK)
        mutation_findings = [
            finding
            for finding in result["findings"]
            if finding.get("fixture_type") == "source-mutation-without-approval-negative"
        ]

        self.assertEqual(mutation_findings, [])

    def test_source_inventory_storage_negative_is_valid_expected_failure(self):
        result = validator.validate_fixture_pack(FIXTURE_PACK)
        inventory_findings = [
            finding
            for finding in result["findings"]
            if finding.get("fixture_type") == "source-inventory-outside-approved-storage-negative"
        ]

        self.assertEqual(inventory_findings, [])

    def test_report_output_must_stay_under_approved_storage_root(self):
        result = validator.validate_fixture_pack(FIXTURE_PACK)
        with tempfile.TemporaryDirectory() as temp_dir:
            with self.assertRaises(ValueError):
                validator.write_reports(result, Path(temp_dir), validator.load_approved_storage_root())

    def test_storage_root_can_be_loaded_from_user_config(self):
        root = validator.load_approved_storage_root()

        self.assertTrue(str(root).endswith(str(Path("_bmad/memory/knx/runtime"))))

    def test_storage_root_can_be_overridden(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = validator.load_approved_storage_root(temp_dir)

        self.assertEqual(root, Path(temp_dir).resolve())

    def test_malformed_json_fails(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            malformed = Path(temp_dir) / "bad.json"
            malformed.write_text("{not-json", encoding="utf-8")

            result = validator.validate_fixture_pack(malformed)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("json-parse-failed", {finding["code"] for finding in result["findings"]})

    def test_risk_score_nine_requires_blocking_status(self):
        pack = self._load_pack()
        evidence = self._find_fixture(pack, "valid-validation-evidence")
        evidence["artifact"]["risk_score"] = 9
        evidence["artifact"]["blocking_status"] = "nonblocking"
        pack["fixtures"].append(evidence)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("risk-nine-not-blocking", {finding["code"] for finding in result["findings"]})

    def test_valid_materialized_inventory_path_under_approved_root_passes_path_check(self):
        pack = self._load_pack()
        inventory = self._find_fixture(pack, "source-inventory-outside-approved-storage-negative")
        inventory["fixture_type"] = "valid-source-inventory-evidence"
        inventory["expected_validation_result"] = "PASS"
        inventory["expected_failed_rules"] = []
        inventory["artifact_ids"] = ["si-synth-valid-storage-001"]
        inventory["artifact"]["source_inventory_id"] = "si-synth-valid-storage-001"
        inventory["artifact"]["generated_artifact_path"] = str(
            validator.load_approved_storage_root() / "optional-source-evidence-pack" / "reports" / "inventory.json"
        )
        inventory["artifact"]["boundary_check_result"] = "PASS"
        pack["fixtures"].append(inventory)

        result = self._validate_temp_pack(pack)
        inventory_findings = [
            finding
            for finding in result["findings"]
            if finding.get("artifact_id") == "si-synth-valid-storage-001"
        ]

        self.assertEqual(inventory_findings, [])

    def test_current_source_packet_examples_pass(self):
        result = validator.validate_source_packet_examples(SOURCE_PACKET_EXAMPLES)

        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["summary"]["source_packet_count"], 3)
        self.assertEqual(result["summary"]["errors"], 0)
        self.assertEqual(result["findings"], [])

    def test_source_packet_examples_reject_unapproved_class(self):
        examples = self._load_source_packet_examples()
        examples["packets"][0]["source_class"] = "customer-project-data"

        result = self._validate_temp_source_packet_examples(examples)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("source-packet-class-not-approved", {finding["code"] for finding in result["findings"]})

    def test_source_packet_examples_reject_copied_content(self):
        examples = self._load_source_packet_examples()
        examples["packets"][0]["source_content"] = "do not copy source contents into packet examples"

        result = self._validate_temp_source_packet_examples(examples)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("source-packet-copies-content", {finding["code"] for finding in result["findings"]})

    def test_source_packet_example_result_can_write_reports(self):
        result = validator.validate_source_packet_examples(SOURCE_PACKET_EXAMPLES)
        report_root = validator.load_approved_storage_root() / "source-packets"
        report_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=report_root) as temp_dir:
            output_dir = Path(temp_dir)
            json_path, md_path = validator.write_reports(result, output_dir, validator.load_approved_storage_root())

            self.assertEqual(json_path.name, "source-evidence-validation.json")
            self.assertEqual(md_path.name, "source-evidence-validation.md")

    def _load_pack(self):
        return json.loads(FIXTURE_PACK.read_text(encoding="utf-8"))

    def _find_fixture(self, pack, fixture_type):
        for fixture in pack["fixtures"]:
            if fixture["fixture_type"] == fixture_type:
                return deepcopy(fixture)
        raise AssertionError(f"Fixture not found: {fixture_type}")

    def _validate_temp_pack(self, pack):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "fixture-pack.json"
            path.write_text(json.dumps(pack), encoding="utf-8")
            return validator.validate_fixture_pack(path)

    def _load_source_packet_examples(self):
        return json.loads(SOURCE_PACKET_EXAMPLES.read_text(encoding="utf-8"))

    def _validate_temp_source_packet_examples(self, examples):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "source-packet-examples.json"
            path.write_text(json.dumps(examples), encoding="utf-8")
            return validator.validate_source_packet_examples(path)


if __name__ == "__main__":
    unittest.main()
