import importlib.util
import contextlib
import io
import json
import shutil
import subprocess
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
FIXTURE_PACK = (
    PROJECT_ROOT / ".agents/skills/knx-source-evidence-validator/assets/fixtures/first-fixture-pack.json"
)
FIXTURE_PACK_RELATIVE_PATH = ".agents/skills/knx-source-evidence-validator/assets/fixtures/first-fixture-pack.json"
SOURCE_PACKET_EXAMPLES_RELATIVE_PATH = (
    "_bmad/memory/knx/runtime/source-packets/test-source-packet-examples.json"
)
SOURCE_PACKET_EXAMPLES = PROJECT_ROOT / SOURCE_PACKET_EXAMPLES_RELATIVE_PATH


spec = importlib.util.spec_from_file_location("validate_source_evidence", SCRIPT_PATH)
validator = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules["validate_source_evidence"] = validator
spec.loader.exec_module(validator)


class SourceEvidenceValidatorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._source_packet_examples_original = (
            SOURCE_PACKET_EXAMPLES.read_text(encoding="utf-8")
            if SOURCE_PACKET_EXAMPLES.exists()
            else None
        )
        SOURCE_PACKET_EXAMPLES.parent.mkdir(parents=True, exist_ok=True)
        SOURCE_PACKET_EXAMPLES.write_text(
            json.dumps(cls._source_packet_examples_fixture(), indent=2),
            encoding="utf-8",
        )

    @classmethod
    def tearDownClass(cls):
        if cls._source_packet_examples_original is None:
            SOURCE_PACKET_EXAMPLES.unlink(missing_ok=True)
        else:
            SOURCE_PACKET_EXAMPLES.write_text(
                cls._source_packet_examples_original,
                encoding="utf-8",
            )

    @staticmethod
    def _source_packet_examples_fixture():
        boundary_false_flags = {
            flag: False
            for flag in validator.BOUNDARY_FALSE_FLAGS
        }
        base_packet = {
            "source_location_or_description": "Metadata-only source packet example fixture",
            "source_owner_or_provider": "synthetic",
            "approval_basis": "synthetic",
            "source_support_level": "synthetic",
            "permitted_processing_boundary": "deterministic-local",
            "permitted_storage_boundary": "_bmad/memory/knx",
            "downstream_allowed_use": "validation",
            "source_operation": "read-planning",
            "uncertainty": "none",
            "forbidden_content_check": "pass",
            "created_at": "2026-06-01",
            "created_by": "knx-source-evidence-validator tests",
        }
        packets = [
            {
                **base_packet,
                "source_packet_id": "sp-test-planning-001",
                "title": "User-authored planning document example",
                "source_class": "user-authored-planning-document",
            },
            {
                **base_packet,
                "source_packet_id": "sp-test-synthetic-001",
                "title": "Public or synthetic sample data example",
                "source_class": "public-or-synthetic-sample-data",
            },
            {
                **base_packet,
                "source_packet_id": "sp-test-report-001",
                "title": "Generated report example",
                "source_class": "generated-report",
            },
        ]
        return {
            "source_packet_example_set_id": "source-packet-examples-test-fixture",
            "title": "Metadata-only source packet examples test fixture",
            "created_at": "2026-06-01",
            "created_by": "knx-source-evidence-validator tests",
            "status": "local-metadata-only-examples",
            "excluded_classes": sorted(validator.REQUIRED_EXCLUDED_SOURCE_CLASSES),
            "packets": packets,
            **boundary_false_flags,
        }

    def test_boundary_constants_are_project_root_relative(self):
        self.assertEqual(
            validator.DEFAULT_APPROVED_STORAGE_ROOT,
            (validator.PROJECT_ROOT / "_bmad/memory/knx/runtime").resolve(),
        )
        self.assertEqual(
            validator.KNX_MEMORY_ROOT,
            (validator.PROJECT_ROOT / "_bmad/memory/knx").resolve(),
        )
        self.assertEqual(
            validator.SYNTHETIC_FIXTURE_ROOT,
            (
                validator.PROJECT_ROOT / ".agents/skills/knx-source-evidence-validator/assets/fixtures"
            ).resolve(),
        )

    def test_import_from_other_cwd_keeps_project_root_boundaries(self):
        with tempfile.TemporaryDirectory() as other_cwd:
            script = f"""
import importlib.util
import json
import sys
from pathlib import Path
script_path = Path(r"{SCRIPT_PATH}")
spec = importlib.util.spec_from_file_location("validate_source_evidence", script_path)
module = importlib.util.module_from_spec(spec)
sys.modules["validate_source_evidence"] = module
spec.loader.exec_module(module)
print(json.dumps({{
    "approved_storage_root": str(module.DEFAULT_APPROVED_STORAGE_ROOT),
    "synthetic_fixture_root": str(module.SYNTHETIC_FIXTURE_ROOT),
}}))
"""
            result = subprocess.run(
                [sys.executable, "-c", script],
                cwd=other_cwd,
                capture_output=True,
                text=True,
                check=False,
            )

        self.assertEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertEqual(
            payload["approved_storage_root"],
            str((PROJECT_ROOT / "_bmad/memory/knx/runtime").resolve()),
        )
        self.assertEqual(
            payload["synthetic_fixture_root"],
            str((PROJECT_ROOT / ".agents/skills/knx-source-evidence-validator/assets/fixtures").resolve()),
        )

    def test_import_from_other_cwd_uses_project_root_default_config_paths(self):
        config_path = PROJECT_ROOT / "_bmad/config.user.yaml"
        original = config_path.read_text(encoding="utf-8") if config_path.exists() else None
        config_path.write_text(
            "knx_storage_root: '{project-root}/_bmad/memory/knx/runtime/from-import-cwd-config'\n",
            encoding="utf-8",
        )
        try:
            with tempfile.TemporaryDirectory() as other_cwd:
                script = f"""
import importlib.util
import json
import sys
from pathlib import Path
script_path = Path(r"{SCRIPT_PATH}")
spec = importlib.util.spec_from_file_location("validate_source_evidence", script_path)
module = importlib.util.module_from_spec(spec)
sys.modules["validate_source_evidence"] = module
spec.loader.exec_module(module)
print(json.dumps({{
    "storage_root": str(module.load_approved_storage_root()),
}}))
"""
                result = subprocess.run(
                    [sys.executable, "-c", script],
                    cwd=other_cwd,
                    capture_output=True,
                    text=True,
                    check=False,
                )
        finally:
            if original is None:
                config_path.unlink(missing_ok=True)
            else:
                config_path.write_text(original, encoding="utf-8")

        self.assertEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertEqual(
            payload["storage_root"],
            str((PROJECT_ROOT / "_bmad/memory/knx/runtime/from-import-cwd-config").resolve()),
        )

    def test_import_from_other_cwd_relative_library_fixture_pack_path_still_works(self):
        with tempfile.TemporaryDirectory() as other_cwd:
            script = f"""
import importlib.util
import json
import sys
from pathlib import Path
script_path = Path(r"{SCRIPT_PATH}")
spec = importlib.util.spec_from_file_location("validate_source_evidence", script_path)
module = importlib.util.module_from_spec(spec)
sys.modules["validate_source_evidence"] = module
spec.loader.exec_module(module)
result = module.validate_fixture_pack(Path(".agents/skills/knx-source-evidence-validator/assets/fixtures/first-fixture-pack.json"))
print(json.dumps({{"status": result["status"]}}))
"""
            result = subprocess.run(
                [sys.executable, "-c", script],
                cwd=other_cwd,
                capture_output=True,
                text=True,
                check=False,
            )

        self.assertEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "PASS")

    def test_import_from_other_cwd_relative_library_source_packet_examples_path_still_works(self):
        with tempfile.TemporaryDirectory() as other_cwd:
            script = f"""
import importlib.util
import json
import sys
from pathlib import Path
script_path = Path(r"{SCRIPT_PATH}")
spec = importlib.util.spec_from_file_location("validate_source_evidence", script_path)
module = importlib.util.module_from_spec(spec)
sys.modules["validate_source_evidence"] = module
spec.loader.exec_module(module)
result = module.validate_source_packet_examples(Path(r"{SOURCE_PACKET_EXAMPLES_RELATIVE_PATH}"))
print(json.dumps({{"status": result["status"]}}))
"""
            result = subprocess.run(
                [sys.executable, "-c", script],
                cwd=other_cwd,
                capture_output=True,
                text=True,
                check=False,
            )

        self.assertEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "PASS")

    def test_explicit_storage_root_must_stay_under_knx_runtime(self):
        outside_root = Path(tempfile.gettempdir()) / "knx-storage-root-outside-runtime"

        with self.assertRaisesRegex(ValueError, "Approved storage root from explicit argument must stay under"):
            validator.load_approved_storage_root(str(outside_root))

    def test_explicit_storage_root_must_not_be_empty(self):
        with self.assertRaisesRegex(ValueError, "Explicit storage root must not be empty"):
            validator.load_approved_storage_root("")

    def test_configured_storage_root_must_stay_under_knx_runtime(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.yaml"
            config_path.write_text(
                f"knx_storage_root: '{Path(tempfile.gettempdir()) / 'knx-storage-root-outside-runtime'}'\n",
                encoding="utf-8",
            )

            with self.assertRaisesRegex(ValueError, "Approved storage root from .*config.yaml must stay under"):
                validator.load_approved_storage_root(config_user_path=Path(temp_dir) / "missing-user.yaml", config_path=config_path)

    def test_storage_root_loader_raises_on_unreadable_config_path(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            bad_config_path = Path(temp_dir)

            with self.assertRaisesRegex(OSError, "Cannot read config file"):
                validator.load_approved_storage_root(
                    config_user_path=Path(temp_dir) / "missing-user.yaml",
                    config_path=bad_config_path,
                )

    def test_storage_root_loader_raises_on_invalid_utf8_config(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.yaml"
            config_path.write_bytes(b"\xff\xfe\x00\x00")

            with self.assertRaisesRegex(OSError, "Cannot read config file"):
                validator.load_approved_storage_root(
                    config_user_path=Path(temp_dir) / "missing-user.yaml",
                    config_path=config_path,
                )

    def test_configured_storage_root_allows_nested_runtime_path(self):
        with tempfile.TemporaryDirectory(dir=validator.DEFAULT_APPROVED_STORAGE_ROOT) as temp_dir:
            config_path = Path(temp_dir) / "config.yaml"
            nested_root = Path(temp_dir) / "custom-approved-root"
            config_path.write_text(f"knx_storage_root: '{nested_root}'\n", encoding="utf-8")

            resolved = validator.load_approved_storage_root(
                config_user_path=Path(temp_dir) / "missing-user.yaml",
                config_path=config_path,
            )

            self.assertEqual(resolved, nested_root.resolve())

    def test_configured_storage_root_expands_project_root_token(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.yaml"
            config_path.write_text(
                "knx_storage_root: '{project-root}/_bmad/memory/knx/runtime/tokenized-root'\n",
                encoding="utf-8",
            )

            resolved = validator.load_approved_storage_root(
                config_user_path=Path(temp_dir) / "missing-user.yaml",
                config_path=config_path,
            )

            self.assertEqual(
                resolved,
                (validator.PROJECT_ROOT / "_bmad/memory/knx/runtime/tokenized-root").resolve(),
            )

    def test_configured_storage_root_relative_path_is_project_root_relative(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.yaml"
            config_path.write_text(
                "knx_storage_root: '_bmad/memory/knx/runtime/relative-storage-root'\n",
                encoding="utf-8",
            )

            resolved = validator.load_approved_storage_root(
                config_user_path=Path(temp_dir) / "missing-user.yaml",
                config_path=config_path,
            )

            self.assertEqual(
                resolved,
                (validator.PROJECT_ROOT / "_bmad/memory/knx/runtime/relative-storage-root").resolve(),
            )

    def test_storage_root_can_be_loaded_from_toml_config(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_toml_path = Path(temp_dir) / "config.user.toml"
            config_toml_path.write_text(
                'knx_storage_root = "{project-root}/_bmad/memory/knx/runtime/toml-root"\n',
                encoding="utf-8",
            )

            resolved = validator.load_approved_storage_root(
                config_user_path=Path(temp_dir) / "missing-user.yaml",
                config_path=Path(temp_dir) / "missing-config.yaml",
                config_user_toml_path=config_toml_path,
                config_toml_path=Path(temp_dir) / "missing-config.toml",
            )

            self.assertEqual(
                resolved,
                (validator.PROJECT_ROOT / "_bmad/memory/knx/runtime/toml-root").resolve(),
            )

    def test_user_toml_storage_root_overrides_project_yaml(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.yaml"
            config_path.write_text(
                "knx_storage_root: '{project-root}/_bmad/memory/knx/runtime/project-yaml-root'\n",
                encoding="utf-8",
            )
            config_toml_path = Path(temp_dir) / "config.user.toml"
            config_toml_path.write_text(
                'knx_storage_root = "{project-root}/_bmad/memory/knx/runtime/user-toml-root"\n',
                encoding="utf-8",
            )

            resolved = validator.load_approved_storage_root(
                config_user_path=Path(temp_dir) / "missing-user.yaml",
                config_path=config_path,
                config_user_toml_path=config_toml_path,
                config_toml_path=Path(temp_dir) / "missing-config.toml",
            )

            self.assertEqual(
                resolved,
                (validator.PROJECT_ROOT / "_bmad/memory/knx/runtime/user-toml-root").resolve(),
            )

    def test_last_storage_root_in_single_config_file_wins(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.yaml"
            config_path.write_text(
                "knx_storage_root: '{project-root}/_bmad/memory/knx/runtime/first-root'\n"
                "knx_storage_root: '{project-root}/_bmad/memory/knx/runtime/second-root'\n",
                encoding="utf-8",
            )

            resolved = validator.load_approved_storage_root(
                config_user_path=Path(temp_dir) / "missing-user.yaml",
                config_path=config_path,
            )

            self.assertEqual(
                resolved,
                (validator.PROJECT_ROOT / "_bmad/memory/knx/runtime/second-root").resolve(),
            )

    def test_blank_last_storage_root_in_single_config_file_unsets_earlier_value(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.yaml"
            config_path.write_text(
                "knx_storage_root: '{project-root}/_bmad/memory/knx/runtime/first-root'\n"
                "knx_storage_root: ''\n",
                encoding="utf-8",
            )

            resolved = validator.load_approved_storage_root(
                config_user_path=Path(temp_dir) / "missing-user.yaml",
                config_path=config_path,
                config_user_toml_path=Path(temp_dir) / "missing-user.toml",
                config_toml_path=Path(temp_dir) / "missing-config.toml",
            )

            self.assertEqual(resolved, validator.DEFAULT_APPROVED_STORAGE_ROOT)

    def test_blank_storage_root_in_config_falls_back_to_default(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.yaml"
            config_path.write_text("knx_storage_root: ''\n", encoding="utf-8")

            resolved = validator.load_approved_storage_root(
                config_user_path=Path(temp_dir) / "missing-user.yaml",
                config_path=config_path,
                config_user_toml_path=Path(temp_dir) / "missing-user.toml",
                config_toml_path=Path(temp_dir) / "missing-config.toml",
            )

            self.assertEqual(resolved, validator.DEFAULT_APPROVED_STORAGE_ROOT)

    def test_blank_user_storage_root_falls_through_to_project_config(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_user_path = Path(temp_dir) / "config.user.yaml"
            config_user_path.write_text("knx_storage_root: ''\n", encoding="utf-8")
            config_path = Path(temp_dir) / "config.yaml"
            config_path.write_text(
                "knx_storage_root: '{project-root}/_bmad/memory/knx/runtime/project-fallback-root'\n",
                encoding="utf-8",
            )

            resolved = validator.load_approved_storage_root(
                config_user_path=config_user_path,
                config_path=config_path,
                config_user_toml_path=Path(temp_dir) / "missing-user.toml",
                config_toml_path=Path(temp_dir) / "missing-config.toml",
            )

            self.assertEqual(
                resolved,
                (validator.PROJECT_ROOT / "_bmad/memory/knx/runtime/project-fallback-root").resolve(),
            )

    def test_comment_only_storage_root_in_config_falls_back_to_default(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.yaml"
            config_path.write_text("knx_storage_root: # blank on purpose\n", encoding="utf-8")

            resolved = validator.load_approved_storage_root(
                config_user_path=Path(temp_dir) / "missing-user.yaml",
                config_path=config_path,
                config_user_toml_path=Path(temp_dir) / "missing-user.toml",
                config_toml_path=Path(temp_dir) / "missing-config.toml",
            )

            self.assertEqual(resolved, validator.DEFAULT_APPROVED_STORAGE_ROOT)

    def test_storage_root_preserves_semicolon_in_toml_value(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_toml_path = Path(temp_dir) / "config.user.toml"
            config_toml_path.write_text(
                'knx_storage_root = "{project-root}/_bmad/memory/knx/runtime/toml-root;v1"\n',
                encoding="utf-8",
            )

            resolved = validator.load_approved_storage_root(
                config_user_path=Path(temp_dir) / "missing-user.yaml",
                config_path=Path(temp_dir) / "missing-config.yaml",
                config_user_toml_path=config_toml_path,
                config_toml_path=Path(temp_dir) / "missing-config.toml",
            )

            self.assertEqual(
                resolved,
                (validator.PROJECT_ROOT / "_bmad/memory/knx/runtime/toml-root;v1").resolve(),
            )

    def test_storage_root_can_be_loaded_from_bom_prefixed_yaml_config(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.yaml"
            config_path.write_text(
                "\ufeffknx_storage_root: '{project-root}/_bmad/memory/knx/runtime/bom-root'\n",
                encoding="utf-8",
            )

            resolved = validator.load_approved_storage_root(
                config_user_path=Path(temp_dir) / "missing-user.yaml",
                config_path=config_path,
            )

            self.assertEqual(
                resolved,
                (validator.PROJECT_ROOT / "_bmad/memory/knx/runtime/bom-root").resolve(),
            )

    def test_explicit_storage_root_expands_project_root_token(self):
        root = validator.load_approved_storage_root("{project-root}/_bmad/memory/knx/runtime/explicit-tokenized-root")

        self.assertEqual(
            root,
            (validator.PROJECT_ROOT / "_bmad/memory/knx/runtime/explicit-tokenized-root").resolve(),
        )

    def test_explicit_storage_root_trims_outer_whitespace(self):
        root = validator.load_approved_storage_root("  {project-root}/_bmad/memory/knx/runtime/trimmed-root  ")

        self.assertEqual(
            root,
            (validator.PROJECT_ROOT / "_bmad/memory/knx/runtime/trimmed-root").resolve(),
        )

    def test_explicit_relative_storage_root_is_project_root_relative(self):
        root = validator.load_approved_storage_root("_bmad/memory/knx/runtime/explicit-relative-root")

        self.assertEqual(
            root,
            (validator.PROJECT_ROOT / "_bmad/memory/knx/runtime/explicit-relative-root").resolve(),
        )

    def test_normalize_path_input_expands_project_root_token(self):
        normalized = validator.normalize_path_input("{project-root}/_bmad/memory/knx/runtime/normalized-path")

        self.assertEqual(
            normalized,
            (validator.PROJECT_ROOT / "_bmad/memory/knx/runtime/normalized-path").resolve(),
        )

    def test_normalize_path_input_anchors_relative_paths_to_project_root(self):
        normalized = validator.normalize_path_input("_bmad/memory/knx/runtime/relative-input-path")

        self.assertEqual(
            normalized,
            (validator.PROJECT_ROOT / "_bmad/memory/knx/runtime/relative-input-path").resolve(),
        )

    def test_normalize_path_input_trims_outer_whitespace(self):
        normalized = validator.normalize_path_input("  _bmad/memory/knx/runtime/trimmed-input-path  ")

        self.assertEqual(
            normalized,
            (validator.PROJECT_ROOT / "_bmad/memory/knx/runtime/trimmed-input-path").resolve(),
        )

    def test_normalize_path_input_rejects_empty_string(self):
        with self.assertRaisesRegex(ValueError, "Path input must not be empty"):
            validator.normalize_path_input("")

    def test_normalize_config_path_input_anchors_relative_paths_to_project_root(self):
        normalized = validator.normalize_config_path_input("_bmad/memory/knx/runtime/config-relative-path")

        self.assertEqual(
            normalized,
            (validator.PROJECT_ROOT / "_bmad/memory/knx/runtime/config-relative-path").resolve(),
        )

    def test_normalize_config_path_input_rejects_empty_string(self):
        with self.assertRaisesRegex(ValueError, "Config path input must not be empty"):
            validator.normalize_config_path_input("")

    def test_normalize_boundary_path_input_anchors_relative_paths_to_project_root(self):
        normalized = validator.normalize_boundary_path_input("_bmad/memory/knx/runtime/boundary-relative-path")

        self.assertEqual(
            normalized,
            (validator.PROJECT_ROOT / "_bmad/memory/knx/runtime/boundary-relative-path").resolve(),
        )

    def test_normalize_boundary_path_input_rejects_empty_string(self):
        with self.assertRaisesRegex(ValueError, "Boundary path input must not be empty"):
            validator.normalize_boundary_path_input("")

    def test_is_under_path_returns_false_for_empty_input(self):
        self.assertFalse(
            validator.is_under_path("", validator.DEFAULT_APPROVED_STORAGE_ROOT)
        )

    def test_simple_config_value_strips_inline_comment_from_unquoted_value(self):
        value = validator.simple_config_value(
            "ksev_report_dir: {project-root}/_bmad/memory/knx/runtime/reports # local comment\n",
            "ksev_report_dir",
        )

        self.assertEqual(value, "{project-root}/_bmad/memory/knx/runtime/reports")

    def test_simple_config_value_handles_utf8_bom_prefix(self):
        value = validator.simple_config_value(
            "\ufeffksev_report_dir: {project-root}/_bmad/memory/knx/runtime/reports\n",
            "ksev_report_dir",
        )

        self.assertEqual(value, "{project-root}/_bmad/memory/knx/runtime/reports")

    def test_simple_config_value_preserves_semicolon_in_unquoted_toml_value(self):
        value = validator.simple_config_value(
            'ksev_report_dir = {project-root}/_bmad/memory/knx/runtime/reports;v1\n',
            "ksev_report_dir",
        )

        self.assertEqual(value, "{project-root}/_bmad/memory/knx/runtime/reports;v1")

    def test_simple_config_value_preserves_semicolon_in_yaml_value(self):
        value = validator.simple_config_value(
            "ksev_report_dir: {project-root}/_bmad/memory/knx/runtime/reports;v1\n",
            "ksev_report_dir",
        )

        self.assertEqual(value, "{project-root}/_bmad/memory/knx/runtime/reports;v1")

    def test_simple_config_value_preserves_hash_inside_quoted_value(self):
        value = validator.simple_config_value(
            'ksev_report_dir = "{project-root}/_bmad/memory/knx/runtime/reports#v1"\n',
            "ksev_report_dir",
        )

        self.assertEqual(value, "{project-root}/_bmad/memory/knx/runtime/reports#v1")

    def test_simple_config_value_strips_trailing_comment_after_quoted_yaml_value(self):
        value = validator.simple_config_value(
            'ksev_fixture_pack: "{project-root}/.agents/skills/knx-source-evidence-validator/assets/fixtures/first-fixture-pack.json" # local comment\n',
            "ksev_fixture_pack",
        )

        self.assertEqual(
            value,
            "{project-root}/.agents/skills/knx-source-evidence-validator/assets/fixtures/first-fixture-pack.json",
        )

    def test_simple_config_value_strips_trailing_comment_after_quoted_toml_value(self):
        value = validator.simple_config_value(
            'ksev_report_dir = "{project-root}/_bmad/memory/knx/runtime/reports" # local comment\n',
            "ksev_report_dir",
        )

        self.assertEqual(
            value,
            "{project-root}/_bmad/memory/knx/runtime/reports",
        )

    def test_simple_config_value_preserves_semicolon_inside_quoted_value(self):
        value = validator.simple_config_value(
            'ksev_report_dir = "{project-root}/_bmad/memory/knx/runtime/reports;v1"\n',
            "ksev_report_dir",
        )

        self.assertEqual(value, "{project-root}/_bmad/memory/knx/runtime/reports;v1")

    def test_simple_config_value_uses_last_matching_key_in_file(self):
        value = validator.simple_config_value(
            'ksev_report_dir = "{project-root}/_bmad/memory/knx/runtime/first"\n'
            'ksev_report_dir = "{project-root}/_bmad/memory/knx/runtime/second"\n',
            "ksev_report_dir",
        )

        self.assertEqual(value, "{project-root}/_bmad/memory/knx/runtime/second")

    def test_simple_config_value_blank_last_key_unsets_earlier_value(self):
        value = validator.simple_config_value(
            'ksev_report_dir = "{project-root}/_bmad/memory/knx/runtime/first"\n'
            'ksev_report_dir = ""\n',
            "ksev_report_dir",
        )

        self.assertIsNone(value)

    def test_parse_config_value_reports_blank_value_when_key_is_present(self):
        found, value = validator.parse_config_value(
            "ksev_report_dir: ''\n",
            "ksev_report_dir",
        )

        self.assertTrue(found)
        self.assertIsNone(value)

    def test_parse_config_value_treats_quoted_whitespace_as_blank(self):
        found, value = validator.parse_config_value(
            'ksev_report_dir: "   "\n',
            "ksev_report_dir",
        )

        self.assertTrue(found)
        self.assertIsNone(value)

    def test_configured_fixture_pack_path_expands_project_root_token(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.yaml"
            config_path.write_text(
                "ksev_fixture_pack: '{project-root}/.agents/skills/knx-source-evidence-validator/assets/fixtures/first-fixture-pack.json'\n",
                encoding="utf-8",
            )

            resolved = validator.load_configured_path(
                None,
                "ksev_fixture_pack",
                validator.DEFAULT_FIXTURE_PACK_PATH,
                config_user_path=Path(temp_dir) / "missing-user.yaml",
                config_path=config_path,
                config_user_toml_path=Path(temp_dir) / "missing-user.toml",
                config_toml_path=Path(temp_dir) / "missing-config.toml",
            )

            self.assertEqual(resolved, validator.DEFAULT_FIXTURE_PACK_PATH.resolve())

    def test_configured_path_loader_raises_on_unreadable_config_path(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            bad_config_path = Path(temp_dir)

            with self.assertRaisesRegex(OSError, "Cannot read config file"):
                validator.load_configured_path(
                    None,
                    "ksev_fixture_pack",
                    validator.DEFAULT_FIXTURE_PACK_PATH,
                    config_user_path=Path(temp_dir) / "missing-user.yaml",
                    config_path=bad_config_path,
                    config_user_toml_path=Path(temp_dir) / "missing-user.toml",
                    config_toml_path=Path(temp_dir) / "missing-config.toml",
                )

    def test_configured_fixture_pack_path_must_stay_under_synthetic_root(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.yaml"
            config_path.write_text(
                f"ksev_fixture_pack: '{Path(tempfile.gettempdir()) / 'outside-fixture-pack.json'}'\n",
                encoding="utf-8",
            )

            with self.assertRaisesRegex(ValueError, "Fixture pack path must stay under"):
                validator.load_configured_fixture_pack_path(
                    None,
                    config_user_path=Path(temp_dir) / "missing-user.yaml",
                    config_path=config_path,
                    config_user_toml_path=Path(temp_dir) / "missing-user.toml",
                    config_toml_path=Path(temp_dir) / "missing-config.toml",
                )

    def test_configured_fixture_pack_path_rejects_existing_directory(self):
        original_fixture_root = validator.SYNTHETIC_FIXTURE_ROOT
        with tempfile.TemporaryDirectory() as temp_dir:
            fixture_root = Path(temp_dir) / "fixtures"
            fixture_dir = fixture_root / "fixture-pack-dir"
            fixture_dir.mkdir(parents=True)
            validator.SYNTHETIC_FIXTURE_ROOT = fixture_root.resolve()
            try:
                with self.assertRaisesRegex(ValueError, "must point to a file, not a directory"):
                    validator.load_configured_fixture_pack_path(str(fixture_dir))
            finally:
                validator.SYNTHETIC_FIXTURE_ROOT = original_fixture_root

    def test_configured_report_dir_can_be_loaded_from_toml(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_toml_path = Path(temp_dir) / "config.user.toml"
            config_toml_path.write_text(
                'ksev_report_dir = "{project-root}/_bmad/memory/knx/runtime/custom-report-dir"\n',
                encoding="utf-8",
            )

            resolved = validator.load_configured_path(
                None,
                "ksev_report_dir",
                validator.DEFAULT_REPORT_DIR,
                config_user_path=Path(temp_dir) / "missing-user.yaml",
                config_path=Path(temp_dir) / "missing-config.yaml",
                config_user_toml_path=config_toml_path,
                config_toml_path=Path(temp_dir) / "missing-config.toml",
            )

            self.assertEqual(
                resolved,
                (validator.PROJECT_ROOT / "_bmad/memory/knx/runtime/custom-report-dir").resolve(),
            )

    def test_user_toml_report_dir_overrides_project_yaml(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.yaml"
            config_path.write_text(
                "ksev_report_dir: '{project-root}/_bmad/memory/knx/runtime/project-yaml-report-dir'\n",
                encoding="utf-8",
            )
            config_toml_path = Path(temp_dir) / "config.user.toml"
            config_toml_path.write_text(
                'ksev_report_dir = "{project-root}/_bmad/memory/knx/runtime/user-toml-report-dir"\n',
                encoding="utf-8",
            )

            resolved = validator.load_configured_path(
                None,
                "ksev_report_dir",
                validator.DEFAULT_REPORT_DIR,
                config_user_path=Path(temp_dir) / "missing-user.yaml",
                config_path=config_path,
                config_user_toml_path=config_toml_path,
                config_toml_path=Path(temp_dir) / "missing-config.toml",
            )

            self.assertEqual(
                resolved,
                (validator.PROJECT_ROOT / "_bmad/memory/knx/runtime/user-toml-report-dir").resolve(),
            )

    def test_last_report_dir_in_single_config_file_wins(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.yaml"
            config_path.write_text(
                "ksev_report_dir: '{project-root}/_bmad/memory/knx/runtime/first-report-dir'\n"
                "ksev_report_dir: '{project-root}/_bmad/memory/knx/runtime/second-report-dir'\n",
                encoding="utf-8",
            )

            resolved = validator.load_configured_path(
                None,
                "ksev_report_dir",
                validator.DEFAULT_REPORT_DIR,
                config_user_path=Path(temp_dir) / "missing-user.yaml",
                config_path=config_path,
                config_user_toml_path=Path(temp_dir) / "missing-user.toml",
                config_toml_path=Path(temp_dir) / "missing-config.toml",
            )

            self.assertEqual(
                resolved,
                (validator.PROJECT_ROOT / "_bmad/memory/knx/runtime/second-report-dir").resolve(),
            )

    def test_blank_last_report_dir_in_single_config_file_unsets_earlier_value(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.yaml"
            config_path.write_text(
                "ksev_report_dir: '{project-root}/_bmad/memory/knx/runtime/first-report-dir'\n"
                "ksev_report_dir: ''\n",
                encoding="utf-8",
            )

            resolved = validator.load_configured_path(
                None,
                "ksev_report_dir",
                validator.DEFAULT_REPORT_DIR,
                config_user_path=Path(temp_dir) / "missing-user.yaml",
                config_path=config_path,
                config_user_toml_path=Path(temp_dir) / "missing-user.toml",
                config_toml_path=Path(temp_dir) / "missing-config.toml",
            )

            self.assertEqual(resolved, validator.DEFAULT_REPORT_DIR.resolve())

    def test_blank_report_dir_in_config_falls_back_to_default(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_toml_path = Path(temp_dir) / "config.user.toml"
            config_toml_path.write_text('ksev_report_dir = ""\n', encoding="utf-8")

            resolved = validator.load_configured_path(
                None,
                "ksev_report_dir",
                validator.DEFAULT_REPORT_DIR,
                config_user_path=Path(temp_dir) / "missing-user.yaml",
                config_path=Path(temp_dir) / "missing-config.yaml",
                config_user_toml_path=config_toml_path,
                config_toml_path=Path(temp_dir) / "missing-config.toml",
            )

            self.assertEqual(resolved, validator.DEFAULT_REPORT_DIR.resolve())

    def test_whitespace_only_report_dir_in_config_falls_back_to_default(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_toml_path = Path(temp_dir) / "config.user.toml"
            config_toml_path.write_text('ksev_report_dir = "   "\n', encoding="utf-8")

            resolved = validator.load_configured_path(
                None,
                "ksev_report_dir",
                validator.DEFAULT_REPORT_DIR,
                config_user_path=Path(temp_dir) / "missing-user.yaml",
                config_path=Path(temp_dir) / "missing-config.yaml",
                config_user_toml_path=config_toml_path,
                config_toml_path=Path(temp_dir) / "missing-config.toml",
            )

            self.assertEqual(resolved, validator.DEFAULT_REPORT_DIR.resolve())

    def test_blank_user_report_dir_falls_through_to_project_config(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_user_toml_path = Path(temp_dir) / "config.user.toml"
            config_user_toml_path.write_text('ksev_report_dir = ""\n', encoding="utf-8")
            config_path = Path(temp_dir) / "config.yaml"
            config_path.write_text(
                "ksev_report_dir: '{project-root}/_bmad/memory/knx/runtime/project-fallback-report-dir'\n",
                encoding="utf-8",
            )

            resolved = validator.load_configured_path(
                None,
                "ksev_report_dir",
                validator.DEFAULT_REPORT_DIR,
                config_user_path=Path(temp_dir) / "missing-user.yaml",
                config_path=config_path,
                config_user_toml_path=config_user_toml_path,
                config_toml_path=Path(temp_dir) / "missing-config.toml",
            )

            self.assertEqual(
                resolved,
                (validator.PROJECT_ROOT / "_bmad/memory/knx/runtime/project-fallback-report-dir").resolve(),
            )

    def test_configured_report_dir_relative_path_is_project_root_relative(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.yaml"
            config_path.write_text(
                "ksev_report_dir: '_bmad/memory/knx/runtime/relative-report-dir'\n",
                encoding="utf-8",
            )

            resolved = validator.load_configured_path(
                None,
                "ksev_report_dir",
                validator.DEFAULT_REPORT_DIR,
                config_user_path=Path(temp_dir) / "missing-user.yaml",
                config_path=config_path,
                config_user_toml_path=Path(temp_dir) / "missing-user.toml",
                config_toml_path=Path(temp_dir) / "missing-config.toml",
            )

            self.assertEqual(
                resolved,
                (validator.PROJECT_ROOT / "_bmad/memory/knx/runtime/relative-report-dir").resolve(),
            )

    def test_configured_report_dir_must_stay_under_approved_storage_root(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config_toml_path = Path(temp_dir) / "config.user.toml"
            config_toml_path.write_text(
                f'ksev_report_dir = "{Path(tempfile.gettempdir()) / "outside-report-dir"}"\n',
                encoding="utf-8",
            )

            with self.assertRaisesRegex(ValueError, "Report directory must stay under approved storage root"):
                validator.load_configured_report_dir(
                    None,
                    validator.load_approved_storage_root(),
                    config_user_path=Path(temp_dir) / "missing-user.yaml",
                    config_path=Path(temp_dir) / "missing-config.yaml",
                    config_user_toml_path=config_toml_path,
                    config_toml_path=Path(temp_dir) / "missing-config.toml",
                )

    def test_configured_report_dir_rejects_existing_file(self):
        runtime_root = validator.load_approved_storage_root()
        with tempfile.NamedTemporaryFile(dir=runtime_root, delete=False) as temp_file:
            report_file = Path(temp_file.name)
        try:
            with self.assertRaisesRegex(ValueError, "must point to a directory, not a file"):
                validator.load_configured_report_dir(str(report_file), runtime_root)
        finally:
            report_file.unlink(missing_ok=True)

    def test_explicit_configured_path_expands_project_root_token(self):
        resolved = validator.load_configured_path(
            "{project-root}/_bmad/memory/knx/runtime/explicit-report-dir",
            "ksev_report_dir",
            validator.DEFAULT_REPORT_DIR,
        )

        self.assertEqual(
            resolved,
            (validator.PROJECT_ROOT / "_bmad/memory/knx/runtime/explicit-report-dir").resolve(),
        )

    def test_explicit_configured_path_trims_outer_whitespace(self):
        resolved = validator.load_configured_path(
            "  {project-root}/_bmad/memory/knx/runtime/trimmed-report-dir  ",
            "ksev_report_dir",
            validator.DEFAULT_REPORT_DIR,
        )

        self.assertEqual(
            resolved,
            (validator.PROJECT_ROOT / "_bmad/memory/knx/runtime/trimmed-report-dir").resolve(),
        )

    def test_explicit_configured_path_must_not_be_empty(self):
        with self.assertRaisesRegex(ValueError, "Explicit ksev_report_dir path must not be empty"):
            validator.load_configured_path(
                "",
                "ksev_report_dir",
                validator.DEFAULT_REPORT_DIR,
            )

    def test_explicit_relative_configured_path_is_project_root_relative(self):
        resolved = validator.load_configured_path(
            "_bmad/memory/knx/runtime/explicit-relative-report-dir",
            "ksev_report_dir",
            validator.DEFAULT_REPORT_DIR,
        )

        self.assertEqual(
            resolved,
            (validator.PROJECT_ROOT / "_bmad/memory/knx/runtime/explicit-relative-report-dir").resolve(),
        )

    def test_explicit_fixture_pack_path_must_stay_under_synthetic_root(self):
        outside_path = Path(tempfile.gettempdir()) / "outside-fixture-pack.json"

        with self.assertRaisesRegex(ValueError, "Fixture pack path must stay under"):
            validator.load_configured_fixture_pack_path(str(outside_path))

    def test_explicit_report_dir_must_stay_under_approved_storage_root(self):
        outside_path = Path(tempfile.gettempdir()) / "outside-report-dir"

        with self.assertRaisesRegex(ValueError, "Report directory must stay under approved storage root"):
            validator.load_configured_report_dir(
                str(outside_path),
                validator.load_approved_storage_root(),
            )

    def test_source_packet_examples_path_must_stay_under_approved_storage_root(self):
        outside_path = Path(tempfile.gettempdir()) / "outside-source-packet-examples.json"

        with self.assertRaisesRegex(ValueError, "Source packet examples path must stay under approved storage root"):
            validator.load_source_packet_examples_path(
                str(outside_path),
                validator.load_approved_storage_root(),
            )

    def test_source_packet_examples_path_rejects_existing_directory(self):
        source_packet_dir = SOURCE_PACKET_EXAMPLES.parent / "source-packet-examples-dir"
        source_packet_dir.mkdir(exist_ok=True)
        try:
            with self.assertRaisesRegex(ValueError, "must point to a file, not a directory"):
                validator.load_source_packet_examples_path(
                    str(source_packet_dir),
                    validator.load_approved_storage_root(),
                )
        finally:
            source_packet_dir.rmdir()

    def test_parse_args_rejects_multiple_validation_targets(self):
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaisesRegex(validator.CliUsageError, "not allowed with argument"):
                validator.parse_args(
                    [
                        "--fixture-pack",
                        str(FIXTURE_PACK),
                        "--source-packet-examples",
                        str(SOURCE_PACKET_EXAMPLES),
                    ]
                )

    def test_cli_multiple_validation_targets_returns_json_fail(self):
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT_PATH),
                "--fixture-pack",
                str(FIXTURE_PACK),
                "--source-packet-examples",
                str(SOURCE_PACKET_EXAMPLES),
                "--no-write",
            ],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 1)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "FAIL")
        self.assertIn("not allowed with argument", payload["error"])

    def test_cli_unknown_argument_returns_json_fail(self):
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT_PATH),
                "--unknown-flag",
                "--no-write",
            ],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 1)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "FAIL")
        self.assertIn("unrecognized arguments", payload["error"])

    def test_cli_empty_storage_root_returns_json_fail(self):
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT_PATH),
                "--storage-root",
                "",
                "--no-write",
            ],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 1)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "FAIL")
        self.assertIn("Explicit storage root must not be empty", payload["error"])

    def test_cli_empty_fixture_pack_returns_json_fail(self):
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT_PATH),
                "--fixture-pack",
                "",
                "--no-write",
            ],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 1)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "FAIL")
        self.assertIn("Explicit ksev_fixture_pack path must not be empty", payload["error"])

    def test_cli_empty_source_packet_examples_returns_json_fail(self):
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT_PATH),
                "--source-packet-examples",
                "",
                "--no-write",
            ],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 1)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "FAIL")
        self.assertIn("Explicit source packet examples path must not be empty", payload["error"])

    def test_cli_existing_directory_source_packet_examples_returns_json_fail(self):
        source_packet_dir = SOURCE_PACKET_EXAMPLES.parent / "source-packet-examples-dir"
        source_packet_dir.mkdir(exist_ok=True)
        try:
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT_PATH),
                    "--source-packet-examples",
                    str(source_packet_dir),
                    "--no-write",
                ],
                cwd=PROJECT_ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
        finally:
            source_packet_dir.rmdir()

        self.assertEqual(result.returncode, 1)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "FAIL")
        self.assertIn("must point to a file, not a directory", payload["error"])

    def test_cli_empty_output_dir_returns_json_fail(self):
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT_PATH),
                "--output-dir",
                "",
            ],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 1)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "FAIL")
        self.assertIn("Explicit ksev_report_dir path must not be empty", payload["error"])

    def test_cli_defaults_work_from_other_cwd(self):
        with tempfile.TemporaryDirectory() as other_cwd:
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT_PATH),
                    "--no-write",
                ],
                cwd=other_cwd,
                capture_output=True,
                text=True,
                check=False,
            )

        self.assertEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "PASS")

    def test_cli_relative_fixture_pack_path_works_from_other_cwd(self):
        with tempfile.TemporaryDirectory() as other_cwd:
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT_PATH),
                    "--fixture-pack",
                    ".agents/skills/knx-source-evidence-validator/assets/fixtures/first-fixture-pack.json",
                    "--no-write",
                ],
                cwd=other_cwd,
                capture_output=True,
                text=True,
                check=False,
            )

        self.assertEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "PASS")

    def test_cli_relative_source_packet_examples_path_works_from_other_cwd(self):
        with tempfile.TemporaryDirectory() as other_cwd:
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT_PATH),
                    "--source-packet-examples",
                    SOURCE_PACKET_EXAMPLES_RELATIVE_PATH,
                    "--no-write",
                ],
                cwd=other_cwd,
                capture_output=True,
                text=True,
                check=False,
            )

        self.assertEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "PASS")

    def test_cli_relative_storage_root_works_from_other_cwd(self):
        with tempfile.TemporaryDirectory() as other_cwd:
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT_PATH),
                    "--storage-root",
                    "_bmad/memory/knx/runtime",
                    "--no-write",
                ],
                cwd=other_cwd,
                capture_output=True,
                text=True,
                check=False,
            )

        self.assertEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "PASS")

    def test_cli_relative_output_dir_works_from_other_cwd(self):
        relative_output_dir = "_bmad/memory/knx/runtime/test-cli-relative-output-dir"
        output_dir = PROJECT_ROOT / relative_output_dir
        shutil.rmtree(output_dir, ignore_errors=True)
        try:
            with tempfile.TemporaryDirectory() as other_cwd:
                result = subprocess.run(
                    [
                        sys.executable,
                        str(SCRIPT_PATH),
                        "--fixture-pack",
                        ".agents/skills/knx-source-evidence-validator/assets/fixtures/first-fixture-pack.json",
                        "--output-dir",
                        relative_output_dir,
                    ],
                    cwd=other_cwd,
                    capture_output=True,
                    text=True,
                    check=False,
                )

            self.assertEqual(result.returncode, 0)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["status"], "PASS")
            self.assertTrue((output_dir / "source-evidence-validation.json").exists())
            self.assertTrue((output_dir / "source-evidence-validation.md").exists())
        finally:
            shutil.rmtree(output_dir, ignore_errors=True)

    def test_cli_report_write_oserror_returns_json_fail(self):
        runtime_root = PROJECT_ROOT / "_bmad/memory/knx/runtime"
        runtime_root.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=runtime_root, delete=False) as temp_file:
            output_path = Path(temp_file.name)
        try:
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT_PATH),
                    "--fixture-pack",
                    str(FIXTURE_PACK),
                    "--output-dir",
                    str(output_path),
                ],
                cwd=PROJECT_ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
        finally:
            output_path.unlink(missing_ok=True)

        self.assertEqual(result.returncode, 1)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "FAIL")
        self.assertTrue(payload["error"])

    def test_cli_existing_file_output_dir_returns_json_fail(self):
        runtime_root = PROJECT_ROOT / "_bmad/memory/knx/runtime"
        runtime_root.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=runtime_root, delete=False) as temp_file:
            output_path = Path(temp_file.name)
        try:
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT_PATH),
                    "--fixture-pack",
                    str(FIXTURE_PACK),
                    "--output-dir",
                    str(output_path),
                ],
                cwd=PROJECT_ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
        finally:
            output_path.unlink(missing_ok=True)

        self.assertEqual(result.returncode, 1)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "FAIL")
        self.assertIn("must point to a directory, not a file", payload["error"])

    def test_cli_unreadable_default_config_returns_json_fail(self):
        config_path = PROJECT_ROOT / "_bmad/config.user.yaml"
        backup_path = PROJECT_ROOT / "_bmad/config.user.yaml.bak.test"
        had_original = config_path.exists()
        if had_original:
            if backup_path.exists():
                backup_path.unlink()
            config_path.replace(backup_path)
        config_path.mkdir()
        try:
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT_PATH),
                    "--no-write",
                ],
                cwd=PROJECT_ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
        finally:
            config_path.rmdir()
            if had_original:
                backup_path.replace(config_path)

        self.assertEqual(result.returncode, 1)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "FAIL")
        self.assertIn("Cannot read config file", payload["error"])

    def test_cli_invalid_utf8_default_config_returns_json_fail(self):
        config_path = PROJECT_ROOT / "_bmad/config.user.yaml"
        backup_path = PROJECT_ROOT / "_bmad/config.user.yaml.bak.test"
        had_original = config_path.exists()
        if had_original:
            if backup_path.exists():
                backup_path.unlink()
            config_path.replace(backup_path)
        config_path.write_bytes(b"\xff\xfe\x00\x00")
        try:
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT_PATH),
                    "--no-write",
                ],
                cwd=PROJECT_ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
        finally:
            config_path.unlink(missing_ok=True)
            if had_original:
                backup_path.replace(config_path)

        self.assertEqual(result.returncode, 1)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "FAIL")
        self.assertIn("Cannot read config file", payload["error"])

    def test_cli_blank_default_config_value_falls_back_to_default(self):
        config_path = PROJECT_ROOT / "_bmad/config.user.yaml"
        backup_path = PROJECT_ROOT / "_bmad/config.user.yaml.bak.test"
        had_original = config_path.exists()
        if had_original:
            if backup_path.exists():
                backup_path.unlink()
            config_path.replace(backup_path)
        config_path.write_text("knx_storage_root: ''\n", encoding="utf-8")
        try:
            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT_PATH),
                    "--no-write",
                ],
                cwd=PROJECT_ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
        finally:
            config_path.unlink(missing_ok=True)
            if had_original:
                backup_path.replace(config_path)

        self.assertEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "PASS")

    def test_cli_source_packet_examples_ignores_invalid_fixture_pack_config(self):
        result = self._run_cli_with_temp_user_config(
            "ksev_fixture_pack: 'C:/Users/example/AppData/Local/Temp/outside-fixture-pack.json'\n",
            ["--source-packet-examples", str(SOURCE_PACKET_EXAMPLES), "--no-write"],
        )

        self.assertEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "PASS")

    def test_cli_no_write_ignores_invalid_report_dir_config(self):
        result = self._run_cli_with_temp_user_config(
            "ksev_report_dir: 'C:/Users/example/AppData/Local/Temp/outside-report-dir'\n",
            ["--fixture-pack", str(FIXTURE_PACK), "--no-write"],
        )

        self.assertEqual(result.returncode, 0)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "PASS")

    def test_current_fixture_pack_passes(self):
        result = validator.validate_fixture_pack(FIXTURE_PACK)

        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["summary"]["fixture_count"], 18)
        self.assertEqual(result["summary"]["errors"], 0)
        self.assertEqual(result["summary"]["warnings"], 0)
        self.assertEqual(result["findings"], [])

    def test_validate_fixture_pack_accepts_project_root_token_path(self):
        result = validator.validate_fixture_pack(
            Path("{project-root}/.agents/skills/knx-source-evidence-validator/assets/fixtures/first-fixture-pack.json")
        )

        self.assertEqual(result["status"], "PASS")

    def test_validate_fixture_pack_rejects_empty_path_string(self):
        with self.assertRaisesRegex(ValueError, "Path input must not be empty"):
            validator.validate_fixture_pack("")

    def test_validate_fixture_pack_accepts_tokenized_approved_storage_root(self):
        result = validator.validate_fixture_pack(
            FIXTURE_PACK,
            Path("{project-root}/_bmad/memory/knx/runtime"),
        )

        self.assertEqual(result["status"], "PASS")

    def test_validate_fixture_pack_rejects_invalid_explicit_approved_storage_root(self):
        with self.assertRaisesRegex(ValueError, "Approved storage root from approved_storage_root must stay under"):
            validator.validate_fixture_pack(
                FIXTURE_PACK,
                Path(tempfile.gettempdir()) / "outside-approved-storage-root",
            )

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
        with tempfile.TemporaryDirectory(dir=validator.DEFAULT_APPROVED_STORAGE_ROOT) as temp_dir:
            nested_root = Path(temp_dir) / "approved-root"
            root = validator.load_approved_storage_root(str(nested_root))

        self.assertEqual(root, nested_root.resolve())

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

    def test_invalid_utf8_fixture_pack_fails_cleanly(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            malformed = Path(temp_dir) / "bad.json"
            malformed.write_bytes(b"\xff\xfe\x00\x00")

            result = validator.validate_fixture_pack(malformed)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("input-unreadable", {finding["code"] for finding in result["findings"]})

    def test_missing_inputs_fail_cleanly(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            missing = Path(temp_dir) / "missing.json"

            fixture_result = validator.validate_fixture_pack(missing)
            source_packet_result = validator.validate_source_packet_examples(missing)

        self.assertEqual(fixture_result["status"], "FAIL")
        self.assertEqual(source_packet_result["status"], "FAIL")
        self.assertIn("input-unreadable", {finding["code"] for finding in fixture_result["findings"]})
        self.assertIn("input-unreadable", {finding["code"] for finding in source_packet_result["findings"]})

    def test_invalid_utf8_source_packet_examples_fail_cleanly(self):
        report_root = validator.load_approved_storage_root() / "source-packets"
        report_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=report_root) as temp_dir:
            malformed = Path(temp_dir) / "bad.json"
            malformed.write_bytes(b"\xff\xfe\x00\x00")

            result = validator.validate_source_packet_examples(malformed)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("input-unreadable", {finding["code"] for finding in result["findings"]})

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

    def test_valid_waived_validation_evidence_passes_contract(self):
        pack = self._load_pack()
        evidence = self._find_fixture(pack, "valid-validation-evidence")
        evidence["artifact"]["validation_evidence_id"] = "ve-synth-waived-valid-001"
        evidence["artifact"]["result"] = "WAIVED"
        evidence["artifact"]["failed_rules"] = ["Synthetic waived rule for regression coverage."]
        evidence["artifact"]["blocking_status"] = "waived-blocking"
        evidence["artifact"]["risk_score"] = 9
        evidence["artifact"]["waiver_id"] = "dec-synth-valid-001"
        evidence["artifact"]["waiver_reason"] = "Synthetic waiver reason for regression coverage."
        evidence["artifact"]["evidence_references"] = ["local synthetic waiver evidence"]
        pack["fixtures"].append(evidence)

        result = self._validate_temp_pack(pack)
        waived_findings = [
            finding
            for finding in result["findings"]
            if finding.get("artifact_id") == "ve-synth-waived-valid-001"
        ]

        self.assertEqual(waived_findings, [])

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

    def test_non_waived_validation_rejects_meaningful_waiver_metadata(self):
        pack = self._load_pack()
        evidence = self._find_fixture(pack, "valid-validation-evidence")
        evidence["artifact"]["waiver_id"] = "dec-synth-valid-001"
        evidence["artifact"]["waiver_reason"] = "Synthetic waiver reason for regression coverage."
        pack["fixtures"].append(evidence)

        result = self._validate_temp_pack(pack)
        codes = {finding["code"] for finding in result["findings"]}

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("non-waived-waiver-id-present", codes)
        self.assertIn("non-waived-waiver-reason-present", codes)

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

    def test_source_support_validation_targets_output_or_source_packet(self):
        pack = self._load_pack()
        evidence = self._find_fixture(pack, "valid-validation-evidence")
        evidence["artifact"]["validation_type"] = "source-support-check"
        evidence["artifact"]["artifact_under_validation"] = "work trace"
        pack["fixtures"].append(evidence)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("source-support-validation-target-invalid", {finding["code"] for finding in result["findings"]})

    def test_boundary_validation_targets_boundary_relevant_artifacts(self):
        pack = self._load_pack()
        evidence = self._find_fixture(pack, "valid-validation-evidence")
        evidence["artifact"]["validation_type"] = "boundary-check"
        evidence["artifact"]["artifact_under_validation"] = "work trace"
        pack["fixtures"].append(evidence)

        result = self._validate_temp_pack(pack)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn("boundary-validation-target-invalid", {finding["code"] for finding in result["findings"]})

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

    def test_validate_source_packet_examples_accepts_project_root_token_path(self):
        result = validator.validate_source_packet_examples(
            Path(f"{{project-root}}/{SOURCE_PACKET_EXAMPLES_RELATIVE_PATH}")
        )

        self.assertEqual(result["status"], "PASS")

    def test_validate_source_packet_examples_rejects_empty_path_string(self):
        with self.assertRaisesRegex(ValueError, "Path input must not be empty"):
            validator.validate_source_packet_examples("")

    def test_validate_source_packet_examples_accepts_tokenized_approved_storage_root(self):
        result = validator.validate_source_packet_examples(
            SOURCE_PACKET_EXAMPLES,
            Path("{project-root}/_bmad/memory/knx/runtime"),
        )

        self.assertEqual(result["status"], "PASS")

    def test_validate_source_packet_examples_rejects_invalid_explicit_approved_storage_root(self):
        with self.assertRaisesRegex(ValueError, "Approved storage root from approved_storage_root must stay under"):
            validator.validate_source_packet_examples(
                SOURCE_PACKET_EXAMPLES,
                Path(tempfile.gettempdir()) / "outside-approved-storage-root",
            )

    def test_source_packet_examples_must_stay_under_approved_storage_root(self):
        examples = self._load_source_packet_examples()
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "source-packet-examples.json"
            path.write_text(json.dumps(examples), encoding="utf-8")

            result = validator.validate_source_packet_examples(path)

        self.assertEqual(result["status"], "FAIL")
        self.assertIn(
            "source-packet-examples-outside-approved-root",
            {finding["code"] for finding in result["findings"]},
        )

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

    def test_write_reports_accepts_project_root_token_output_dir(self):
        result = validator.validate_source_packet_examples(SOURCE_PACKET_EXAMPLES)
        output_dir = Path("{project-root}/_bmad/memory/knx/runtime/source-packets/tokenized-report-dir")
        json_path, md_path = validator.write_reports(
            result,
            output_dir,
            Path("{project-root}/_bmad/memory/knx/runtime"),
        )

        self.assertEqual(json_path.parent, (PROJECT_ROOT / "_bmad/memory/knx/runtime/source-packets/tokenized-report-dir").resolve())
        self.assertEqual(md_path.parent, json_path.parent)

    def test_write_reports_rejects_empty_output_dir_string(self):
        result = validator.validate_source_packet_examples(SOURCE_PACKET_EXAMPLES)
        with self.assertRaisesRegex(ValueError, "Path input must not be empty"):
            validator.write_reports(
                result,
                "",
                validator.load_approved_storage_root(),
            )

    def test_write_reports_rejects_unapproved_storage_root_override(self):
        result = validator.validate_source_packet_examples(SOURCE_PACKET_EXAMPLES)
        with tempfile.TemporaryDirectory(dir=validator.DEFAULT_APPROVED_STORAGE_ROOT) as temp_dir:
            output_dir = Path(temp_dir)
            bad_root = Path(tempfile.gettempdir()) / "knx-storage-root-outside-runtime"

            with self.assertRaisesRegex(ValueError, "Approved storage root from approved_storage_root must stay under"):
                validator.write_reports(result, output_dir, bad_root)

    def _load_pack(self):
        return json.loads(FIXTURE_PACK.read_text(encoding="utf-8"))

    def _find_fixture(self, pack, fixture_type):
        for fixture in pack["fixtures"]:
            if fixture["fixture_type"] == fixture_type:
                return deepcopy(fixture)
        raise AssertionError(f"Fixture not found: {fixture_type}")

    def _validate_temp_pack(self, pack):
        original_fixture_root = validator.SYNTHETIC_FIXTURE_ROOT
        with tempfile.TemporaryDirectory() as temp_dir:
            fixture_root = Path(temp_dir) / "fixtures"
            fixture_root.mkdir()
            path = fixture_root / FIXTURE_PACK.name
            temp_pack = self._rewrite_fixture_pack_paths(pack, path)
            validator.SYNTHETIC_FIXTURE_ROOT = fixture_root.resolve()
            try:
                path.write_text(json.dumps(temp_pack), encoding="utf-8")
                return validator.validate_fixture_pack(path)
            finally:
                validator.SYNTHETIC_FIXTURE_ROOT = original_fixture_root

    def _rewrite_fixture_pack_paths(self, value, temp_fixture_pack_path, parent_key=None):
        if isinstance(value, dict):
            return {
                key: self._rewrite_fixture_pack_paths(item, temp_fixture_pack_path, key)
                for key, item in value.items()
            }
        if isinstance(value, list):
            return [
                self._rewrite_fixture_pack_paths(item, temp_fixture_pack_path, parent_key)
                for item in value
            ]
        if (
            isinstance(value, str)
            and parent_key in {"source_references", "storage_location"}
            and value in {FIXTURE_PACK_RELATIVE_PATH, str(FIXTURE_PACK)}
        ):
            return str(temp_fixture_pack_path)
        return value

    def _load_source_packet_examples(self):
        return json.loads(SOURCE_PACKET_EXAMPLES.read_text(encoding="utf-8"))

    def _validate_temp_source_packet_examples(self, examples):
        report_root = validator.load_approved_storage_root() / "source-packets"
        report_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=report_root) as temp_dir:
            path = Path(temp_dir) / "source-packet-examples.json"
            path.write_text(json.dumps(examples), encoding="utf-8")
            return validator.validate_source_packet_examples(path)

    def _run_cli_with_temp_user_config(self, config_text, args):
        config_path = PROJECT_ROOT / "_bmad/config.user.yaml"
        original = config_path.read_text(encoding="utf-8") if config_path.exists() else None
        config_path.write_text(config_text, encoding="utf-8")
        try:
            return subprocess.run(
                [sys.executable, str(SCRIPT_PATH), *args],
                cwd=PROJECT_ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
        finally:
            if original is None:
                config_path.unlink(missing_ok=True)
            else:
                config_path.write_text(original, encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
