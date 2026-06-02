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
        self.assertEqual(result["summary"]["fixture_count"], 18)
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

    def test_negative_fixture_contract_rules_are_enforced(self):
        pack = self._load_pack()
        mutation = self._find_fixture(pack, "source-mutation-without-approval-negative")
        mutation["artifact"]["source_operation"] = "read-planning"
        mutation["expected_validation_result"] = "PASS"
        pack["fixtures"].append(mutation)

        external = self._find_fixture(pack, "external-action-negative")
        external["artifact"]["execution_layer"] = 2
        external["artifact"]["next_action"] = "proceed"
        external["expected_validation_result"] = "PASS"
        pack["fixtures"].append(external)

        result = self._validate_temp_pack(pack)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("mutation-negative-operation-invalid", codes)
        self.assertIn("mutation-negative-result-invalid", codes)
        self.assertIn("external-action-layer-invalid", codes)
        self.assertIn("external-action-next-action-invalid", codes)
        self.assertIn("external-action-result-invalid", codes)

    def test_fixture_source_packet_rejects_invalid_controlled_vocab(self):
        pack = self._load_pack()
        source_packet = self._find_fixture(pack, "valid-source-packet")
        source_packet["artifact"]["source_class"] = "customer-project-data"
        source_packet["artifact"]["source_owner_or_provider"] = "customer"
        source_packet["artifact"]["approval_basis"] = "hand-wave"
        source_packet["artifact"]["source_support_level"] = "maybe"
        source_packet["artifact"]["permitted_processing_boundary"] = "external-by-default"
        source_packet["artifact"]["permitted_storage_boundary"] = "anywhere"
        source_packet["artifact"]["downstream_allowed_use"] = "ship"
        source_packet["artifact"]["source_operation"] = "ship-it"
        source_packet["artifact"]["uncertainty"] = "shrug"
        source_packet["artifact"]["forbidden_content_check"] = "unknown"
        pack["fixtures"].append(source_packet)

        result = self._validate_temp_pack(pack)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("fixture-source-packet-class-invalid", codes)
        self.assertIn("fixture-source-packet-owner-invalid", codes)
        self.assertIn("fixture-source-packet-approval-basis-invalid", codes)
        self.assertIn("fixture-source-packet-support-level-invalid", codes)
        self.assertIn("fixture-source-packet-processing-boundary-invalid", codes)
        self.assertIn("fixture-source-packet-storage-boundary-invalid", codes)
        self.assertIn("fixture-source-packet-downstream-use-invalid", codes)
        self.assertIn("fixture-source-packet-operation-invalid", codes)
        self.assertIn("fixture-source-packet-uncertainty-invalid", codes)
        self.assertIn("fixture-source-packet-forbidden-content-invalid", codes)

    def test_fixture_source_packet_rejects_empty_required_text_fields(self):
        pack = self._load_pack()
        source_packet = self._find_fixture(pack, "valid-source-packet")
        source_packet["artifact"]["title"] = ""
        source_packet["artifact"]["created_by"] = " "
        pack["fixtures"].append(source_packet)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("fixture-source-packet-text-field-invalid", {finding["code"] for finding in result["findings"]})

    def test_fixture_source_packet_requires_contract_fields(self):
        pack = self._load_pack()
        source_packet = self._find_fixture(pack, "valid-source-packet")
        del source_packet["artifact"]["title"]
        del source_packet["artifact"]["approval_basis"]
        del source_packet["artifact"]["created_by"]
        pack["fixtures"].append(source_packet)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("missing-source-packet-field", {finding["code"] for finding in result["findings"]})

    def test_fixture_source_packet_text_fields_must_be_strings(self):
        pack = self._load_pack()
        source_packet = self._find_fixture(pack, "valid-source-packet")
        source_packet["artifact"]["source_packet_id"] = 42
        source_packet["artifact"]["source_location_or_description"] = ["not", "a", "string"]
        pack["fixtures"].append(source_packet)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("fixture-source-packet-text-field-invalid", {finding["code"] for finding in result["findings"]})

    def test_fixture_source_packet_rejects_blank_optional_list_entries(self):
        pack = self._load_pack()
        source_packet = self._find_fixture(pack, "valid-source-packet")
        source_packet["artifact"]["source_references"] = [" "]
        source_packet["artifact"]["open_questions"] = [""]
        pack["fixtures"].append(source_packet)

        result = self._validate_temp_pack(pack)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("fixture-source-packet-source-references-invalid", codes)
        self.assertIn("fixture-source-packet-open-questions-invalid", codes)

    def test_fixture_source_packet_rejects_copied_content(self):
        pack = self._load_pack()
        source_packet = self._find_fixture(pack, "valid-source-packet")
        source_packet["artifact"]["content"] = "synthetic content should not be copied into metadata packets"
        pack["fixtures"].append(source_packet)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("fixture-source-packet-copies-content", {finding["code"] for finding in result["findings"]})

    def test_source_packets_must_remain_read_planning_only(self):
        pack = self._load_pack()
        source_packet = self._find_fixture(pack, "valid-source-packet")
        source_packet["artifact"]["source_operation"] = "mutation-approved"
        pack["fixtures"].append(source_packet)

        result = self._validate_temp_pack(pack)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("valid-source-operation-not-read-planning", codes)

        examples = self._load_source_packet_examples()
        examples["packets"][0]["source_operation"] = "mutation-approved"

        result = self._validate_temp_source_packet_examples(examples)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("source-packet-operation-not-read-planning", codes)

    def test_source_inventory_storage_negative_is_valid_expected_failure(self):
        result = validator.validate_fixture_pack(FIXTURE_PACK)
        inventory_findings = [
            finding
            for finding in result["findings"]
            if finding.get("fixture_type") == "source-inventory-outside-approved-storage-negative"
        ]

        self.assertEqual(inventory_findings, [])

    def test_source_inventory_rejects_invalid_controlled_vocab(self):
        pack = self._load_pack()
        inventory = self._find_fixture(pack, "source-inventory-outside-approved-storage-negative")
        inventory["artifact"]["source_inventory_id"] = ""
        inventory["artifact"]["inventory_command_or_check"] = " "
        inventory["artifact"]["source_root_approval_basis"] = "because"
        inventory["artifact"]["inventory_scope"] = "everything"
        inventory["artifact"]["allowed_operation"] = "scan-and-copy"
        inventory["artifact"]["inventory_tool"] = "cloud-indexer"
        inventory["artifact"]["boundary_check_result"] = "OK"
        inventory["artifact"]["package_install_performed"] = True
        inventory["artifact"]["runtime_assistant_behavior_added"] = True
        inventory["artifact"]["forbidden_content_check"] = "unknown"
        inventory["artifact"]["uncertainty"] = "shrug"
        inventory["artifact"]["file_count"] = -1
        pack["fixtures"].append(inventory)

        result = self._validate_temp_pack(pack)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("source-inventory-text-field-invalid", codes)
        self.assertIn("source-inventory-approval-basis-invalid", codes)
        self.assertIn("source-inventory-scope-invalid", codes)
        self.assertIn("source-inventory-operation-invalid", codes)
        self.assertIn("source-inventory-tool-invalid", codes)
        self.assertIn("source-inventory-boundary-result-invalid", codes)
        self.assertIn("source-inventory-package-install", codes)
        self.assertIn("source-inventory-runtime-behavior", codes)
        self.assertIn("source-inventory-forbidden-content-invalid", codes)
        self.assertIn("source-inventory-uncertainty-invalid", codes)
        self.assertIn("source-inventory-file-count-invalid", codes)

    def test_source_inventory_file_count_allows_unresolved_sentinel(self):
        pack = self._load_pack()
        inventory = self._find_fixture(pack, "source-inventory-outside-approved-storage-negative")
        inventory["fixture_type"] = "valid-source-inventory-evidence"
        inventory["expected_validation_result"] = "PASS"
        inventory["expected_failed_rules"] = []
        inventory["artifact_ids"] = ["si-synth-valid-file-count-001"]
        inventory["artifact"]["source_inventory_id"] = "si-synth-valid-file-count-001"
        inventory["artifact"]["file_count"] = "unresolved"
        inventory["artifact"]["generated_artifact_path"] = str(
            validator.load_approved_storage_root() / "optional-source-evidence-pack" / "reports" / "inventory.json"
        )
        inventory["artifact"]["validation_evidence_ids"] = ["ve-synth-valid-001"]
        inventory["artifact"]["decision_record_ids"] = ["dec-synth-valid-001"]
        inventory["artifact"]["boundary_check_result"] = "PASS"
        inventory["artifact"]["uncertainty"] = "none"
        pack["fixtures"].append(inventory)

        result = self._validate_temp_pack(pack)

        self.assertNotIn("source-inventory-file-count-invalid", {finding["code"] for finding in result["findings"]})

    def test_source_inventory_file_count_rejects_invalid_strings(self):
        pack = self._load_pack()
        inventory = self._find_fixture(pack, "source-inventory-outside-approved-storage-negative")
        inventory["fixture_type"] = "valid-source-inventory-evidence"
        inventory["expected_validation_result"] = "PASS"
        inventory["expected_failed_rules"] = []
        inventory["artifact_ids"] = ["si-synth-invalid-file-count-001"]
        inventory["artifact"]["source_inventory_id"] = "si-synth-invalid-file-count-001"
        inventory["artifact"]["file_count"] = "twelve"
        inventory["artifact"]["generated_artifact_path"] = str(
            validator.load_approved_storage_root() / "optional-source-evidence-pack" / "reports" / "inventory.json"
        )
        inventory["artifact"]["validation_evidence_ids"] = ["ve-synth-valid-001"]
        inventory["artifact"]["decision_record_ids"] = ["dec-synth-valid-001"]
        inventory["artifact"]["boundary_check_result"] = "PASS"
        inventory["artifact"]["uncertainty"] = "none"
        pack["fixtures"].append(inventory)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("source-inventory-file-count-invalid", {finding["code"] for finding in result["findings"]})

    def test_source_inventory_optional_groups_must_match_shape(self):
        pack = self._load_pack()
        inventory = self._find_fixture(pack, "source-inventory-outside-approved-storage-negative")
        inventory["artifact"]["excluded_paths_or_patterns"] = [" "]
        inventory["artifact"]["top_file_groups"] = [{"extension": "", "count": -1}]
        inventory["artifact"]["source_class_groups"] = [{"source_class": "generated-report", "count": "many"}]
        pack["fixtures"].append(inventory)

        result = self._validate_temp_pack(pack)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("source-inventory-excluded-paths-invalid", codes)
        self.assertIn("source-inventory-top-file-groups-invalid", codes)
        self.assertIn("source-inventory-source-class-groups-invalid", codes)

    def test_materialized_source_inventory_requires_evidence_links(self):
        pack = self._load_pack()
        inventory = self._find_fixture(pack, "source-inventory-outside-approved-storage-negative")
        inventory["fixture_type"] = "valid-source-inventory-evidence"
        inventory["expected_validation_result"] = "PASS"
        inventory["expected_failed_rules"] = []
        inventory["artifact_ids"] = ["si-synth-missing-links-001"]
        inventory["artifact"]["source_inventory_id"] = "si-synth-missing-links-001"
        inventory["artifact"]["generated_artifact_path"] = str(
            validator.load_approved_storage_root() / "optional-source-evidence-pack" / "reports" / "inventory.json"
        )
        inventory["artifact"]["boundary_check_result"] = "PASS"
        pack["fixtures"].append(inventory)

        result = self._validate_temp_pack(pack)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("source-inventory-validation-links-invalid", codes)
        self.assertIn("source-inventory-decision-links-invalid", codes)

    def test_runtime_inventory_rejects_invalid_contract_fields(self):
        pack = self._load_pack()
        inventory = self._find_fixture(pack, "valid-runtime-evidence-inventory")
        inventory["artifact"]["runtime_inventory_id"] = ""
        inventory["artifact"]["storage_root"] = "C:/unapproved-runtime-root"
        inventory["artifact"]["storage_root_approval_basis"] = "because"
        inventory["artifact"]["inventory_scope"] = "everything"
        inventory["artifact"]["allowed_operation"] = "copy-runtime-state"
        inventory["artifact"]["inventory_tool"] = "cloud-indexer"
        inventory["artifact"]["inventory_command_or_check"] = " "
        inventory["artifact"]["generated_artifact_path"] = "C:/unapproved-runtime-state/runtime.json"
        inventory["artifact"]["forbidden_content_check"] = "unknown"
        inventory["artifact"]["boundary_check_result"] = "OK"
        inventory["artifact"]["source_mutation_performed"] = True
        inventory["artifact"]["external_send_performed"] = True
        inventory["artifact"]["uncertainty"] = "shrug"
        inventory["artifact"]["file_count"] = True
        inventory["artifact"]["excluded_paths_or_patterns"] = [" "]
        inventory["artifact"]["top_file_groups"] = [{"extension": "", "count": -1}]
        inventory["artifact"]["runtime_evidence_groups"] = [{"evidence_type": "", "count": "many"}]
        inventory["artifact"]["source_references"] = [" "]
        inventory["artifact"]["open_questions"] = [""]
        inventory["artifact"]["checksums"] = {"deferred": "should stay absent"}
        pack["fixtures"].append(inventory)

        result = self._validate_temp_pack(pack)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("runtime-inventory-text-field-invalid", codes)
        self.assertIn("runtime-inventory-approval-basis-invalid", codes)
        self.assertIn("runtime-inventory-scope-invalid", codes)
        self.assertIn("runtime-inventory-operation-invalid", codes)
        self.assertIn("runtime-inventory-tool-invalid", codes)
        self.assertIn("runtime-inventory-forbidden-content-invalid", codes)
        self.assertIn("runtime-inventory-boundary-result-invalid", codes)
        self.assertIn("runtime-inventory-boundary-flag-not-false", codes)
        self.assertIn("runtime-inventory-uncertainty-invalid", codes)
        self.assertIn("runtime-inventory-file-count-invalid", codes)
        self.assertIn("runtime-inventory-excluded-paths-invalid", codes)
        self.assertIn("runtime-inventory-top-file-groups-invalid", codes)
        self.assertIn("runtime-inventory-evidence-groups-invalid", codes)
        self.assertIn("runtime-inventory-source-references-invalid", codes)
        self.assertIn("runtime-inventory-open-questions-invalid", codes)
        self.assertIn("runtime-inventory-checksums-present", codes)
        self.assertIn("runtime-inventory-storage-root-outside-approved-root", codes)
        self.assertIn("runtime-inventory-output-outside-approved-root", codes)

    def test_runtime_inventory_requires_contract_fields(self):
        pack = self._load_pack()
        inventory = self._find_fixture(pack, "valid-runtime-evidence-inventory")
        del inventory["artifact"]["storage_root"]
        del inventory["artifact"]["inventory_scope"]
        del inventory["artifact"]["source_references"]
        pack["fixtures"].append(inventory)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("missing-runtime-inventory-field", {finding["code"] for finding in result["findings"]})

    def test_numeric_contract_fields_reject_booleans(self):
        pack = self._load_pack()
        trace = self._find_fixture(pack, "valid-work-trace")
        trace["artifact"]["execution_layer"] = True
        pack["fixtures"].append(trace)

        evidence = self._find_fixture(pack, "valid-validation-evidence")
        evidence["artifact"]["risk_score"] = False
        pack["fixtures"].append(evidence)

        inventory = self._find_fixture(pack, "source-inventory-outside-approved-storage-negative")
        inventory["artifact"]["file_count"] = True
        inventory["artifact"]["top_file_groups"] = [{"extension": ".md", "count": False}]
        pack["fixtures"].append(inventory)

        result = self._validate_temp_pack(pack)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("work-trace-layer-invalid", codes)
        self.assertIn("risk-score-invalid", codes)
        self.assertIn("source-inventory-file-count-invalid", codes)
        self.assertIn("source-inventory-top-file-groups-invalid", codes)

    def test_source_inventory_requires_contract_fields(self):
        pack = self._load_pack()
        inventory = self._find_fixture(pack, "source-inventory-outside-approved-storage-negative")
        del inventory["artifact"]["inventory_command_or_check"]
        del inventory["artifact"]["forbidden_content_check"]
        del inventory["artifact"]["created_at"]
        del inventory["artifact"]["created_by"]
        pack["fixtures"].append(inventory)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("missing-source-inventory-field", {finding["code"] for finding in result["findings"]})

    def test_source_inventory_text_fields_must_be_strings(self):
        pack = self._load_pack()
        inventory = self._find_fixture(pack, "source-inventory-outside-approved-storage-negative")
        inventory["artifact"]["source_inventory_id"] = 42
        inventory["artifact"]["source_root"] = ["not", "a", "string"]
        inventory["artifact"]["generated_artifact_path"] = {"path": "not-a-string"}
        pack["fixtures"].append(inventory)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("source-inventory-text-field-invalid", {finding["code"] for finding in result["findings"]})

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

    def test_fixture_pack_must_stay_under_synthetic_fixture_root(self):
        pack = self._load_pack()
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "fixture-pack.json"
            path.write_text(json.dumps(pack), encoding="utf-8")

            result = validator.validate_fixture_pack(path)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("fixture-pack-outside-synthetic-root", {finding["code"] for finding in result["findings"]})

    def test_malformed_json_fails(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            malformed = Path(temp_dir) / "bad.json"
            malformed.write_text("{not-json", encoding="utf-8")

            result = validator.validate_fixture_pack(malformed)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("json-parse-failed", {finding["code"] for finding in result["findings"]})

    def test_missing_inputs_fail_cleanly(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            missing = Path(temp_dir) / "missing.json"

            fixture_result = validator.validate_fixture_pack(missing)
            source_packet_result = validator.validate_source_packet_examples(missing)

        self.assertEqual(fixture_result["status"], "FAIL")
        self.assertEqual(source_packet_result["status"], "FAIL")
        self.assertIn("input-unreadable", {finding["code"] for finding in fixture_result["findings"]})
        self.assertIn("input-unreadable", {finding["code"] for finding in source_packet_result["findings"]})

    def test_top_level_json_must_be_object(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            array_input = Path(temp_dir) / "array.json"
            array_input.write_text("[]", encoding="utf-8")

            fixture_result = validator.validate_fixture_pack(array_input)
            source_packet_result = validator.validate_source_packet_examples(array_input)

        self.assertEqual(fixture_result["status"], "FAIL")
        self.assertEqual(source_packet_result["status"], "FAIL")
        self.assertIn("top-level-not-object", {finding["code"] for finding in fixture_result["findings"]})
        self.assertIn("top-level-not-object", {finding["code"] for finding in source_packet_result["findings"]})

    def test_fixture_pack_rejects_malformed_shape(self):
        pack = self._load_pack()
        del pack["title"]
        pack["fixtures"] = "not-a-list"

        result = self._validate_temp_pack(pack)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("missing-pack-field", codes)
        self.assertIn("fixtures-not-list", codes)

        pack = self._load_pack()
        pack["fixtures"].append("not-an-object")

        result = self._validate_temp_pack(pack)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("fixture-not-object", codes)

        pack = self._load_pack()
        fixture = self._find_fixture(pack, "valid-source-packet")
        fixture["fixture_type"] = 42
        pack["fixtures"].append(fixture)

        result = self._validate_temp_pack(pack)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("fixture-type-invalid", codes)

        pack = self._load_pack()
        fixture = self._find_fixture(pack, "valid-source-packet")
        fixture["expected_validation_result"] = "DONE"
        fixture["expected_failed_rules"] = "none"
        fixture["forbidden_content_check"] = "unknown"
        fixture["artifact"] = "not-an-object"
        pack["fixtures"].append(fixture)

        result = self._validate_temp_pack(pack)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("expected-result-invalid", codes)
        self.assertIn("expected-failed-rules-invalid", codes)
        self.assertIn("forbidden-content-check-invalid", codes)
        self.assertIn("artifact-not-object", codes)

    def test_synthetic_statements_must_explicitly_say_synthetic(self):
        pack = self._load_pack()
        pack["fixture_pack_id"] = ""
        pack["created_at"] = "yesterday"
        pack["created_by"] = " "
        pack["contract_reference"] = ""
        pack["synthetic_only_statement"] = "All examples are safe examples."
        pack["fixtures"][0]["created_at"] = "soon"
        pack["fixtures"][0]["synthetic_only_statement"] = "Example only."

        result = self._validate_temp_pack(pack)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("pack-text-field-invalid", codes)
        self.assertIn("pack-created-at-invalid", codes)
        self.assertIn("fixture-created-at-invalid", codes)
        self.assertIn("pack-synthetic-statement-invalid", codes)
        self.assertIn("synthetic-statement-invalid", codes)

    def test_fixture_pack_text_fields_must_be_strings(self):
        pack = self._load_pack()
        pack["fixture_pack_id"] = 42
        pack["title"] = ["not", "a", "string"]
        pack["created_by"] = {"name": "not-a-string"}

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("pack-text-field-invalid", {finding["code"] for finding in result["findings"]})

    def test_fixture_synthetic_statement_must_be_string(self):
        pack = self._load_pack()
        pack["fixtures"][0]["synthetic_only_statement"] = ["synthetic", "but", "not", "text"]

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("synthetic-statement-invalid", {finding["code"] for finding in result["findings"]})

    def test_created_at_rejects_impossible_calendar_dates(self):
        pack = self._load_pack()
        pack["created_at"] = "2026-99-99"
        pack["fixtures"][0]["created_at"] = "2026-02-31"

        result = self._validate_temp_pack(pack)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("pack-created-at-invalid", codes)
        self.assertIn("fixture-created-at-invalid", codes)

        examples = self._load_source_packet_examples()
        examples["created_at"] = "2026-13-01"
        examples["packets"][0]["created_at"] = "2026-04-31"

        result = self._validate_temp_source_packet_examples(examples)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("example-set-created-at-invalid", codes)
        self.assertIn("source-packet-created-at-invalid", codes)

    def test_fixture_artifact_ids_must_be_unique(self):
        pack = self._load_pack()
        duplicate_source_packet = self._find_fixture(pack, "valid-source-packet")
        pack["fixtures"].append(duplicate_source_packet)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("duplicate-artifact-id", {finding["code"] for finding in result["findings"]})

    def test_fixture_artifact_ids_must_include_primary_artifact_id(self):
        pack = self._load_pack()
        source_packet = self._find_fixture(pack, "valid-source-packet")
        source_packet["artifact_ids"] = ["sp-synth-different-001"]
        pack["fixtures"].append(source_packet)

        decision = self._find_fixture(pack, "valid-decision-record")
        decision["artifact_ids"] = ["dec-synth-different-001"]
        pack["fixtures"].append(decision)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("artifact-id-mismatch", {finding["code"] for finding in result["findings"]})

    def test_risk_score_nine_requires_blocking_status(self):
        pack = self._load_pack()
        evidence = self._find_fixture(pack, "valid-validation-evidence")
        evidence["artifact"]["risk_score"] = 9
        evidence["artifact"]["blocking_status"] = "nonblocking"
        pack["fixtures"].append(evidence)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("risk-nine-not-blocking", {finding["code"] for finding in result["findings"]})

    def test_validation_waiver_fields_must_be_non_empty_strings(self):
        pack = self._load_pack()
        evidence = self._find_fixture(pack, "valid-validation-evidence")
        evidence["artifact"]["result"] = "WAIVED"
        evidence["artifact"]["waiver_reason"] = ["not", "a", "string"]
        evidence["artifact"]["risk_score"] = 9
        evidence["artifact"]["blocking_status"] = "waived-blocking"
        evidence["artifact"]["waiver_id"] = " "
        pack["fixtures"].append(evidence)

        result = self._validate_temp_pack(pack)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("waiver-reason-missing", codes)
        self.assertIn("waiver-id-missing", codes)
        self.assertIn("risk-nine-waiver-missing", codes)

    def test_validation_waiver_metadata_must_be_strings_when_present(self):
        pack = self._load_pack()
        evidence = self._find_fixture(pack, "valid-validation-evidence")
        evidence["artifact"]["waiver_id"] = []
        evidence["artifact"]["waiver_reason"] = {"reason": "not-a-string"}
        pack["fixtures"].append(evidence)

        result = self._validate_temp_pack(pack)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("waiver-id-invalid", codes)
        self.assertIn("waiver-reason-invalid", codes)

    def test_validation_waiver_decision_must_resolve(self):
        pack = self._load_pack()
        evidence = self._find_fixture(pack, "valid-validation-evidence")
        evidence["artifact"]["result"] = "WAIVED"
        evidence["artifact"]["waiver_id"] = "dec-missing-waiver-001"
        evidence["artifact"]["waiver_reason"] = "Synthetic waiver reason for regression coverage."
        pack["fixtures"].append(evidence)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("unknown-waiver-decision-id", {finding["code"] for finding in result["findings"]})

    def test_validation_waiver_requires_waived_blocking_status(self):
        pack = self._load_pack()
        evidence = self._find_fixture(pack, "valid-validation-evidence")
        evidence["artifact"]["result"] = "WAIVED"
        evidence["artifact"]["blocking_status"] = "blocking"
        evidence["artifact"]["waiver_id"] = "dec-synth-valid-001"
        evidence["artifact"]["waiver_reason"] = "Synthetic waiver reason for regression coverage."
        pack["fixtures"].append(evidence)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("waiver-blocking-status-invalid", {finding["code"] for finding in result["findings"]})

    def test_waived_blocking_status_requires_waived_result(self):
        pack = self._load_pack()
        evidence = self._find_fixture(pack, "valid-validation-evidence")
        evidence["artifact"]["result"] = "CONCERNS"
        evidence["artifact"]["failed_rules"] = ["Synthetic review-needed rule for regression coverage."]
        evidence["artifact"]["blocking_status"] = "waived-blocking"
        evidence["artifact"]["waiver_id"] = "dec-synth-valid-001"
        evidence["artifact"]["waiver_reason"] = "Synthetic waiver reason for regression coverage."
        pack["fixtures"].append(evidence)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("waived-blocking-result-invalid", {finding["code"] for finding in result["findings"]})

    def test_non_pass_validation_results_require_failed_rules(self):
        pack = self._load_pack()
        evidence = self._find_fixture(pack, "valid-validation-evidence")
        evidence["artifact"]["result"] = "FAIL"
        evidence["artifact"]["failed_rules"] = []
        evidence["artifact"]["blocking_status"] = "blocking"
        evidence["artifact"]["risk_score"] = 5
        pack["fixtures"].append(evidence)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("validation-result-missing-failed-rules", {finding["code"] for finding in result["findings"]})

    def test_fail_validation_result_requires_blocking_status(self):
        pack = self._load_pack()
        evidence = self._find_fixture(pack, "valid-validation-evidence")
        evidence["artifact"]["result"] = "FAIL"
        evidence["artifact"]["failed_rules"] = ["Synthetic failed rule for regression coverage."]
        evidence["artifact"]["blocking_status"] = "nonblocking"
        evidence["artifact"]["risk_score"] = 5
        pack["fixtures"].append(evidence)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("validation-fail-blocking-status-invalid", {finding["code"] for finding in result["findings"]})

    def test_work_trace_rejects_invalid_controlled_vocab(self):
        pack = self._load_pack()
        trace = self._find_fixture(pack, "valid-work-trace")
        trace["artifact"]["trigger"] = "whenever"
        trace["artifact"]["work_trace_id"] = ""
        trace["artifact"]["steps_taken"] = []
        trace["artifact"]["tools_used"] = []
        trace["artifact"]["execution_layer"] = 9
        trace["artifact"]["uncertainty"] = "maybe"
        trace["artifact"]["residual_risk"] = "unknown"
        trace["artifact"]["next_action"] = "continue-anyway"
        pack["fixtures"].append(trace)

        blocking_trace = self._find_fixture(pack, "valid-work-trace")
        blocking_trace["artifact"]["residual_risk"] = "blocking"
        blocking_trace["artifact"]["next_action"] = "validate"
        pack["fixtures"].append(blocking_trace)

        result = self._validate_temp_pack(pack)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("work-trace-trigger-invalid", codes)
        self.assertIn("work-trace-text-field-invalid", codes)
        self.assertIn("work-trace-required-list-empty", codes)
        self.assertIn("work-trace-layer-invalid", codes)
        self.assertIn("work-trace-uncertainty-invalid", codes)
        self.assertIn("work-trace-residual-risk-invalid", codes)
        self.assertIn("work-trace-next-action-invalid", codes)
        self.assertIn("work-trace-blocking-risk-next-action-invalid", codes)

    def test_work_trace_text_fields_must_be_strings(self):
        pack = self._load_pack()
        trace = self._find_fixture(pack, "valid-work-trace")
        trace["artifact"]["work_trace_id"] = 42
        pack["fixtures"].append(trace)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("work-trace-text-field-invalid", {finding["code"] for finding in result["findings"]})

    def test_work_trace_requires_contract_fields(self):
        pack = self._load_pack()
        trace = self._find_fixture(pack, "valid-work-trace")
        del trace["artifact"]["trigger"]
        del trace["artifact"]["steps_taken"]
        del trace["artifact"]["created_at"]
        pack["fixtures"].append(trace)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("missing-work-trace-field", {finding["code"] for finding in result["findings"]})

    def test_user_input_required_rejects_invalid_controlled_vocab(self):
        pack = self._load_pack()
        user_input = self._find_fixture(pack, "valid-user-input-required")
        user_input["artifact"]["user_input_required_id"] = ""
        user_input["artifact"]["decision_needed"] = " "
        user_input["artifact"]["why_automation_cannot_proceed"] = "because"
        user_input["artifact"]["allowed_choices"] = "choose anything"
        user_input["artifact"]["due_or_review_condition"] = " "
        user_input["artifact"]["blocked_downstream_work"] = []
        user_input["artifact"]["risk_if_guessed"] = "tiny"
        user_input["artifact"]["status"] = "waiting"
        pack["fixtures"].append(user_input)

        result = self._validate_temp_pack(pack)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("user-input-text-field-invalid", codes)
        self.assertIn("user-input-reason-invalid", codes)
        self.assertIn("user-input-allowed-choices-invalid", codes)
        self.assertIn("user-input-due-condition-invalid", codes)
        self.assertIn("user-input-blocked-work-invalid", codes)
        self.assertIn("user-input-risk-invalid", codes)
        self.assertIn("user-input-status-invalid", codes)

    def test_user_input_required_text_fields_must_be_strings(self):
        pack = self._load_pack()
        user_input = self._find_fixture(pack, "valid-user-input-required")
        user_input["artifact"]["user_input_required_id"] = 42
        user_input["artifact"]["decision_needed"] = ["not", "a", "string"]
        pack["fixtures"].append(user_input)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("user-input-text-field-invalid", {finding["code"] for finding in result["findings"]})

    def test_user_input_required_requires_contract_fields(self):
        pack = self._load_pack()
        user_input = self._find_fixture(pack, "valid-user-input-required")
        del user_input["artifact"]["why_automation_cannot_proceed"]
        del user_input["artifact"]["blocked_downstream_work"]
        del user_input["artifact"]["created_at"]
        pack["fixtures"].append(user_input)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("missing-user-input-field", {finding["code"] for finding in result["findings"]})

    def test_decision_record_rejects_invalid_shape(self):
        pack = self._load_pack()
        decision = self._find_fixture(pack, "valid-decision-record")
        decision["artifact"]["decision_record_id"] = 42
        decision["artifact"]["decision_type"] = "anything"
        decision["artifact"]["status"] = "done"
        decision["artifact"]["approval_basis"] = "because"
        decision["artifact"]["source_references"] = [" "]
        decision["artifact"]["risk_score"] = True
        decision["artifact"]["supersedes"] = [""]
        pack["fixtures"].append(decision)

        high_risk_decision = self._find_fixture(pack, "valid-decision-record")
        high_risk_decision["artifact"]["risk_score"] = 8
        high_risk_decision["artifact"]["approval_basis"] = "defaulted"
        pack["fixtures"].append(high_risk_decision)

        result = self._validate_temp_pack(pack)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("decision-text-field-invalid", codes)
        self.assertIn("decision-type-invalid", codes)
        self.assertIn("decision-status-invalid", codes)
        self.assertIn("decision-approval-basis-invalid", codes)
        self.assertIn("decision-source-references-invalid", codes)
        self.assertIn("decision-risk-score-invalid", codes)
        self.assertIn("decision-supersedes-invalid", codes)
        self.assertIn("decision-high-risk-approval-basis-invalid", codes)

    def test_explicit_decision_requires_source_references(self):
        pack = self._load_pack()
        decision = self._find_fixture(pack, "valid-decision-record")
        decision["artifact"]["approval_basis"] = "user-specified"
        decision["artifact"]["source_references"] = []
        pack["fixtures"].append(decision)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("decision-source-references-missing", {finding["code"] for finding in result["findings"]})

    def test_decision_record_requires_contract_fields(self):
        pack = self._load_pack()
        decision = self._find_fixture(pack, "valid-decision-record")
        del decision["artifact"]["decision_type"]
        del decision["artifact"]["rationale"]
        del decision["artifact"]["created_at"]
        pack["fixtures"].append(decision)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("missing-decision-field", {finding["code"] for finding in result["findings"]})

    def test_output_metadata_rejects_missing_required_links(self):
        pack = self._load_pack()
        output = self._find_fixture(pack, "unsupported-inference-negative")
        output["artifact"]["source_packet_ids"] = []
        output["artifact"]["work_trace_id"] = ""
        output["artifact"]["storage_location"] = " "
        output["artifact"]["validation_evidence_ids"] = []
        output["artifact"]["storage_boundary_basis"] = "anywhere"
        output["artifact"]["source_support_summary"] = "guess"
        output["artifact"]["result_status"] = "done"
        pack["fixtures"].append(output)

        unsupported_output = self._find_fixture(pack, "unsupported-inference-negative")
        unsupported_output["artifact"]["result_status"] = "validated"
        pack["fixtures"].append(unsupported_output)

        result = self._validate_temp_pack(pack)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("output-text-field-invalid", codes)
        self.assertIn("output-source-packet-ids-invalid", codes)
        self.assertIn("output-work-trace-missing", codes)
        self.assertIn("output-validation-evidence-ids-invalid", codes)
        self.assertIn("output-storage-boundary-basis-invalid", codes)
        self.assertIn("output-source-support-summary-invalid", codes)
        self.assertIn("output-result-status-invalid", codes)
        self.assertIn("output-unsupported-result-validated", codes)

    def test_output_metadata_text_fields_must_be_strings(self):
        pack = self._load_pack()
        output = self._find_fixture(pack, "unsupported-inference-negative")
        output["artifact"]["output_artifact_id"] = 42
        output["artifact"]["work_trace_id"] = ["not", "a", "string"]
        output["artifact"]["storage_location"] = {"path": "not-a-string"}
        pack["fixtures"].append(output)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("output-text-field-invalid", {finding["code"] for finding in result["findings"]})

    def test_output_metadata_requires_contract_fields(self):
        pack = self._load_pack()
        output = self._find_fixture(pack, "unsupported-inference-negative")
        del output["artifact"]["output_type"]
        del output["artifact"]["generation_boundary"]
        del output["artifact"]["created_at"]
        pack["fixtures"].append(output)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("missing-output-field", {finding["code"] for finding in result["findings"]})

    def test_output_metadata_storage_must_stay_under_knx_storage(self):
        pack = self._load_pack()
        output = self._find_fixture(pack, "unsupported-inference-negative")
        output["artifact"]["storage_location"] = "C:/unapproved-runtime-state/synthetic-output.json"
        pack["fixtures"].append(output)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("output-storage-location-outside-approved-root", {finding["code"] for finding in result["findings"]})

    def test_output_metadata_decision_boundary_requires_decision_link(self):
        pack = self._load_pack()
        output = self._find_fixture(pack, "valid-output-metadata")
        output["artifact"]["storage_boundary_basis"] = "decision-record"
        output["artifact"]["decision_record_ids"] = []
        pack["fixtures"].append(output)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("output-decision-boundary-links-invalid", {finding["code"] for finding in result["findings"]})

    def test_output_metadata_storage_basis_must_match_location(self):
        pack = self._load_pack()
        output = self._find_fixture(pack, "valid-output-metadata")
        output["artifact"]["storage_location"] = "_bmad/memory/knx/runtime/not-a-fixture-output.json"
        output["artifact"]["storage_boundary_basis"] = "synthetic-fixture-folder"
        pack["fixtures"].append(output)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("output-storage-boundary-basis-mismatch", {finding["code"] for finding in result["findings"]})

    def test_fixture_references_must_resolve_to_materialized_ids(self):
        pack = self._load_pack()

        trace = self._find_fixture(pack, "valid-work-trace")
        trace["artifact"]["source_packet_ids"] = ["sp-missing-001"]
        trace["artifact"]["generated_artifact_ids"] = ["out-missing-001"]
        trace["artifact"]["validation_evidence_ids"] = ["ve-missing-001"]
        pack["fixtures"].append(trace)

        evidence = self._find_fixture(pack, "valid-validation-evidence")
        evidence["artifact"]["evidence_references"] = [
            "sp-missing-evidence-001",
            "ve-missing-evidence-001",
            "wt-missing-evidence-001",
            "out-missing-evidence-001",
            "dec-missing-evidence-001",
        ]
        pack["fixtures"].append(evidence)

        output = self._find_fixture(pack, "unsupported-inference-negative")
        output["artifact"]["work_trace_id"] = "wt-missing-001"
        output["artifact"]["decision_record_ids"] = ["dec-missing-001"]
        pack["fixtures"].append(output)

        user_input = self._find_fixture(pack, "valid-user-input-required")
        user_input["artifact"]["source_references"] = ["sp-missing-ref-001"]
        pack["fixtures"].append(user_input)

        decision = self._find_fixture(pack, "valid-decision-record")
        decision["artifact"]["supersedes"] = ["dec-missing-super-001"]
        pack["fixtures"].append(decision)

        bundle = self._find_fixture(pack, "valid-validator-run-evidence")
        bundle["artifact"]["work_trace"] = "wt-missing-bundle-001"
        bundle["artifact"]["validation_evidence"] = "ve-missing-bundle-001"
        bundle["artifact"]["output_metadata"] = ["out-missing-bundle-001"]
        pack["fixtures"].append(bundle)

        result = self._validate_temp_pack(pack)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("unknown-source-packet-id", codes)
        self.assertIn("unknown-generated-artifact-id", codes)
        self.assertIn("unknown-validation-evidence-id", codes)
        self.assertIn("unknown-evidence-reference-id", codes)
        self.assertIn("unknown-work-trace-id", codes)
        self.assertIn("unknown-decision-record-id", codes)
        self.assertIn("unknown-source-reference-id", codes)
        self.assertIn("unknown-superseded-decision-record-id", codes)
        self.assertIn("unknown-validator-run-work-trace-id", codes)
        self.assertIn("unknown-validator-run-validation-evidence-id", codes)
        self.assertIn("unknown-validator-run-output-metadata-id", codes)

    def test_reference_lists_reject_blank_elements(self):
        pack = self._load_pack()

        source_packet = self._find_fixture(pack, "valid-source-packet")
        source_packet["artifact_ids"] = [" "]
        pack["fixtures"].append(source_packet)

        trace = self._find_fixture(pack, "valid-work-trace")
        trace["artifact"]["generated_artifact_ids"] = [""]
        trace["artifact"]["steps_taken"] = [" "]
        pack["fixtures"].append(trace)

        evidence = self._find_fixture(pack, "valid-validation-evidence")
        evidence["artifact"]["failed_rules"] = [" "]
        evidence["artifact"]["evidence_references"] = [""]
        pack["fixtures"].append(evidence)

        user_input = self._find_fixture(pack, "valid-user-input-required")
        user_input["artifact"]["source_references"] = [" "]
        user_input["artifact"]["allowed_choices"] = [""]
        user_input["artifact"]["blocked_downstream_work"] = [" "]
        pack["fixtures"].append(user_input)

        output = self._find_fixture(pack, "unsupported-inference-negative")
        output["artifact"]["source_packet_ids"] = [""]
        output["artifact"]["validation_evidence_ids"] = [" "]
        output["artifact"]["decision_record_ids"] = [""]
        pack["fixtures"].append(output)

        result = self._validate_temp_pack(pack)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("artifact-ids-invalid", codes)
        self.assertIn("work-trace-list-field-invalid", codes)
        self.assertIn("validation-failed-rules-invalid", codes)
        self.assertIn("validation-evidence-references-invalid", codes)
        self.assertIn("user-input-source-references-invalid", codes)
        self.assertIn("user-input-allowed-choices-invalid", codes)
        self.assertIn("user-input-blocked-work-invalid", codes)
        self.assertIn("output-source-packet-ids-invalid", codes)
        self.assertIn("output-validation-evidence-ids-invalid", codes)
        self.assertIn("output-decision-record-ids-invalid", codes)

    def test_validation_evidence_rejects_invalid_controlled_vocab(self):
        pack = self._load_pack()
        evidence = self._find_fixture(pack, "valid-validation-evidence")
        evidence["artifact"]["artifact_under_validation"] = "anything"
        evidence["artifact"]["validation_type"] = "vibes"
        evidence["artifact"]["command_or_check_run"] = ""
        evidence["artifact"]["reviewer"] = " "
        evidence["artifact"]["result"] = "OK"
        evidence["artifact"]["failed_rules"] = "none"
        evidence["artifact"]["blocking_status"] = "maybe-blocking"
        evidence["artifact"]["evidence_references"] = []
        pack["fixtures"].append(evidence)

        pass_evidence = self._find_fixture(pack, "valid-validation-evidence")
        pass_evidence["artifact"]["failed_rules"] = ["rule-that-should-not-fail"]
        pass_evidence["artifact"]["blocking_status"] = "blocking"
        pack["fixtures"].append(pass_evidence)

        source_support_evidence = self._find_fixture(pack, "valid-validation-evidence")
        source_support_evidence["artifact"]["validation_type"] = "source-support-check"
        source_support_evidence["artifact"]["artifact_under_validation"] = "work trace"
        pack["fixtures"].append(source_support_evidence)

        boundary_evidence = self._find_fixture(pack, "valid-validation-evidence")
        boundary_evidence["artifact"]["validation_type"] = "boundary-check"
        boundary_evidence["artifact"]["artifact_under_validation"] = "work trace"
        pack["fixtures"].append(boundary_evidence)

        result = self._validate_temp_pack(pack)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("artifact-under-validation-invalid", codes)
        self.assertIn("validation-type-invalid", codes)
        self.assertIn("validation-text-field-invalid", codes)
        self.assertIn("validation-result-invalid", codes)
        self.assertIn("validation-failed-rules-invalid", codes)
        self.assertIn("blocking-status-invalid", codes)
        self.assertIn("validation-pass-has-failed-rules", codes)
        self.assertIn("validation-pass-blocking-status-invalid", codes)
        self.assertIn("source-support-validation-target-invalid", codes)
        self.assertIn("boundary-validation-target-invalid", codes)
        self.assertIn("validation-evidence-references-invalid", codes)

    def test_validation_evidence_text_fields_must_be_strings(self):
        pack = self._load_pack()
        evidence = self._find_fixture(pack, "valid-validation-evidence")
        evidence["artifact"]["validation_evidence_id"] = 42
        evidence["artifact"]["command_or_check_run"] = ["not", "a", "string"]
        evidence["artifact"]["reviewer"] = {"name": "not-a-string"}
        pack["fixtures"].append(evidence)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("validation-text-field-invalid", {finding["code"] for finding in result["findings"]})

    def test_validation_evidence_requires_contract_fields(self):
        pack = self._load_pack()
        evidence = self._find_fixture(pack, "valid-validation-evidence")
        del evidence["artifact"]["artifact_under_validation"]
        del evidence["artifact"]["evidence_references"]
        del evidence["artifact"]["created_at"]
        pack["fixtures"].append(evidence)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("missing-validation-evidence-field", {finding["code"] for finding in result["findings"]})

    def test_validator_run_evidence_rejects_invalid_shape(self):
        pack = self._load_pack()
        bundle = self._find_fixture(pack, "valid-validator-run-evidence")
        bundle["artifact"]["evidence_bundle_id"] = ""
        bundle["artifact"]["title"] = " "
        bundle["artifact"]["created_at"] = "not-a-date"
        bundle["artifact"]["synthetic_only_statement"] = "real run"
        bundle["artifact"]["work_trace"] = ""
        bundle["artifact"]["validation_evidence"] = []
        bundle["artifact"]["output_metadata"] = [" "]
        bundle["artifact"]["boundaries"]["external_send_performed"] = True
        pack["fixtures"].append(bundle)

        result = self._validate_temp_pack(pack)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("validator-run-text-field-invalid", codes)
        self.assertIn("validator-run-created-at-invalid", codes)
        self.assertIn("validator-run-synthetic-statement-invalid", codes)
        self.assertIn("validator-run-link-invalid", codes)
        self.assertIn("validator-run-output-metadata-invalid", codes)
        self.assertIn("validator-run-boundary-flag-not-false", codes)

    def test_validator_run_evidence_requires_contract_fields(self):
        pack = self._load_pack()
        bundle = self._find_fixture(pack, "valid-validator-run-evidence")
        del bundle["artifact"]["work_trace"]
        del bundle["artifact"]["output_metadata"]
        del bundle["artifact"]["boundaries"]["package_install_performed"]
        pack["fixtures"].append(bundle)

        result = self._validate_temp_pack(pack)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("missing-validator-run-field", codes)
        self.assertIn("validator-run-boundary-flag-missing", codes)

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
        inventory["artifact"]["validation_evidence_ids"] = ["ve-synth-valid-001"]
        inventory["artifact"]["decision_record_ids"] = ["dec-synth-valid-001"]
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

    def test_source_packet_example_set_rejects_copied_content(self):
        examples = self._load_source_packet_examples()
        examples["excerpt"] = "do not copy source contents into packet example sets"

        result = self._validate_temp_source_packet_examples(examples)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("example-set-copies-content", {finding["code"] for finding in result["findings"]})

    def test_source_packet_examples_require_false_boundary_flags(self):
        examples = self._load_source_packet_examples()
        examples["external_send_performed"] = True
        examples["runtime_assistant_behavior_added"] = True
        del examples["github_or_remote_operation_performed"]
        del examples["package_install_performed"]
        examples["packets"][0]["package_install_performed"] = True
        examples["packets"][0]["runtime_assistant_behavior_added"] = True

        result = self._validate_temp_source_packet_examples(examples)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("boundary-flag-not-false", codes)
        self.assertIn("source-packet-boundary-flag-not-false", codes)

    def test_source_packet_examples_reject_malformed_packet_container(self):
        examples = self._load_source_packet_examples()
        del examples["created_by"]
        examples["packets"] = "not-a-list"

        result = self._validate_temp_source_packet_examples(examples)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("missing-example-set-field", codes)
        self.assertIn("packets-not-list", codes)

        examples = self._load_source_packet_examples()
        examples["packets"].append("not-an-object")

        result = self._validate_temp_source_packet_examples(examples)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("source-packet-not-object", codes)

    def test_source_packet_examples_reject_empty_required_text_fields(self):
        examples = self._load_source_packet_examples()
        examples["title"] = ""
        examples["created_at"] = "today"
        examples["created_by"] = " "
        examples["status"] = "shared"
        examples["packets"][0]["title"] = " "
        examples["packets"][0]["source_location_or_description"] = ""
        examples["packets"][0]["created_at"] = "later"

        result = self._validate_temp_source_packet_examples(examples)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("example-set-text-field-invalid", codes)
        self.assertIn("example-set-created-at-invalid", codes)
        self.assertIn("example-set-status-invalid", codes)
        self.assertIn("source-packet-text-field-invalid", codes)
        self.assertIn("source-packet-created-at-invalid", codes)

    def test_source_packet_example_set_text_fields_must_be_strings(self):
        examples = self._load_source_packet_examples()
        examples["source_packet_example_set_id"] = 42
        examples["title"] = ["not", "a", "string"]
        examples["created_by"] = {"name": "not-a-string"}

        result = self._validate_temp_source_packet_examples(examples)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("example-set-text-field-invalid", {finding["code"] for finding in result["findings"]})

    def test_source_packet_example_text_fields_must_be_strings(self):
        examples = self._load_source_packet_examples()
        examples["packets"][0]["source_packet_id"] = 42
        examples["packets"][0]["source_location_or_description"] = ["not", "a", "string"]

        result = self._validate_temp_source_packet_examples(examples)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("source-packet-text-field-invalid", {finding["code"] for finding in result["findings"]})

    def test_source_packet_examples_require_excluded_source_classes(self):
        examples = self._load_source_packet_examples()
        examples["excluded_classes"] = ["customer-project-data", " "]

        result = self._validate_temp_source_packet_examples(examples)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("example-excluded-classes-invalid", codes)
        self.assertIn("example-excluded-class-missing", codes)

    def test_source_packet_example_ids_must_be_unique(self):
        examples = self._load_source_packet_examples()
        examples["packets"][1]["source_packet_id"] = examples["packets"][0]["source_packet_id"]

        result = self._validate_temp_source_packet_examples(examples)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("duplicate-source-packet-id", {finding["code"] for finding in result["findings"]})

    def test_source_packet_examples_require_packet_fields(self):
        examples = self._load_source_packet_examples()
        del examples["packets"][0]["source_owner_or_provider"]
        del examples["packets"][0]["source_operation"]

        result = self._validate_temp_source_packet_examples(examples)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("missing-source-packet-field", {finding["code"] for finding in result["findings"]})

    def test_source_packet_examples_reject_blank_optional_list_entries(self):
        examples = self._load_source_packet_examples()
        examples["packets"][0]["source_references"] = [" "]
        examples["packets"][0]["open_questions"] = [""]

        result = self._validate_temp_source_packet_examples(examples)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("source-packet-source-references-invalid", codes)
        self.assertIn("source-packet-open-questions-invalid", codes)

    def test_source_packet_examples_reject_invalid_controlled_vocab(self):
        examples = self._load_source_packet_examples()
        examples["packets"][0]["source_owner_or_provider"] = "customer"
        examples["packets"][0]["approval_basis"] = "hand-wave"
        examples["packets"][0]["source_support_level"] = "maybe"
        examples["packets"][0]["permitted_processing_boundary"] = "external-by-default"
        examples["packets"][0]["permitted_storage_boundary"] = "anywhere"
        examples["packets"][0]["downstream_allowed_use"] = "ship"
        examples["packets"][0]["source_operation"] = "ship-it"
        examples["packets"][0]["uncertainty"] = "shrug"
        examples["packets"][0]["forbidden_content_check"] = "concerns"

        result = self._validate_temp_source_packet_examples(examples)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("source-packet-owner-invalid", codes)
        self.assertIn("source-packet-approval-basis-invalid", codes)
        self.assertIn("source-packet-support-level-invalid", codes)
        self.assertIn("source-packet-processing-boundary-invalid", codes)
        self.assertIn("source-packet-storage-boundary-invalid", codes)
        self.assertIn("source-packet-downstream-use-invalid", codes)
        self.assertIn("source-packet-operation-invalid", codes)
        self.assertIn("source-packet-uncertainty-invalid", codes)
        self.assertIn("source-packet-forbidden-content-not-pass", codes)

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
        with tempfile.TemporaryDirectory(dir=FIXTURE_PACK.parent) as temp_dir:
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
