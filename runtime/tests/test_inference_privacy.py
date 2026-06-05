from __future__ import annotations

import unittest

from kendall_runtime.inference import InferenceRequest, InferenceRouteDecision
from kendall_runtime.privacy import HostedUseRequest, PrivacyGateDecision
from kendall_runtime.runtime import KendallRuntime


class InferencePrivacyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.runtime = KendallRuntime.bootstrap_release_one()

    def test_inference_request_rejects_malformed_inputs(self) -> None:
        with self.assertRaises(ValueError):
            InferenceRequest(module_id="", task_type="triage")
        with self.assertRaises(ValueError):
            InferenceRequest(module_id=object(), task_type="triage")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            InferenceRequest(module_id="outlook", task_type="")
        with self.assertRaises(ValueError):
            InferenceRequest(module_id="outlook", task_type=object())  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            InferenceRequest(module_id="outlook", task_type="triage", data_classes="bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            InferenceRequest(module_id="outlook", task_type="triage", data_classes=[""])
        with self.assertRaises(ValueError):
            InferenceRequest(module_id="outlook", task_type="triage", context_labels=[""])
        with self.assertRaises(ValueError):
            InferenceRequest(module_id="outlook", task_type="triage", prefer_hosted="yes")  # type: ignore[arg-type]

    def test_hosted_use_request_rejects_malformed_inputs(self) -> None:
        with self.assertRaises(ValueError):
            HostedUseRequest(module_id="", data_classes=["email-threads"])
        with self.assertRaises(ValueError):
            HostedUseRequest(module_id=object(), data_classes=["email-threads"])  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            HostedUseRequest(module_id="outlook", data_classes="bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            HostedUseRequest(module_id="outlook", data_classes=[""])
        with self.assertRaises(ValueError):
            HostedUseRequest(module_id="outlook", data_classes=["email-threads"], context_labels=[""])

    def test_requests_detach_constructor_inputs(self) -> None:
        data_classes = ["email-threads"]
        context_labels = ["summary"]
        hosted = HostedUseRequest(
            module_id="outlook",
            data_classes=data_classes,
            context_labels=context_labels,
        )
        inference = InferenceRequest(
            module_id="outlook",
            task_type="triage",
            data_classes=data_classes,
            context_labels=context_labels,
            prefer_hosted=True,
        )

        data_classes[0] = "mutated"
        context_labels[0] = "mutated"

        self.assertEqual(hosted.data_classes, ["email-threads"])
        self.assertEqual(hosted.context_labels, ["summary"])
        self.assertEqual(inference.data_classes, ["email-threads"])
        self.assertEqual(inference.context_labels, ["summary"])

    def test_decisions_detach_nested_inputs(self) -> None:
        privacy = PrivacyGateDecision(allowed=True, reason="ok")
        decision = InferenceRouteDecision(
            backend="local-default",
            hosted_approved=False,
            privacy_decision=privacy,
        )
        privacy.reason = "mutated"

        self.assertEqual(decision.privacy_decision.reason, "ok")

    def test_privacy_and_inference_decisions_reject_malformed_inputs(self) -> None:
        with self.assertRaises(ValueError):
            PrivacyGateDecision(allowed="yes", reason="bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            PrivacyGateDecision(allowed=True, reason="")
        with self.assertRaises(ValueError):
            InferenceRouteDecision(backend="", hosted_approved=False, privacy_decision=PrivacyGateDecision(True, "ok"))
        with self.assertRaises(ValueError):
            InferenceRouteDecision(backend="local-default", hosted_approved="no", privacy_decision=PrivacyGateDecision(True, "ok"))  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            InferenceRouteDecision(backend="local-default", hosted_approved=False, privacy_decision="bad")  # type: ignore[arg-type]

    def test_privacy_and_inference_services_reject_malformed_dependencies(self) -> None:
        with self.assertRaises(ValueError):
            type(self.runtime.privacy_gate)(
                module_manager="bad",  # type: ignore[arg-type]
                module_packages=self.runtime.module_packages,
                module_services=self.runtime.module_services,
            )
        with self.assertRaises(ValueError):
            type(self.runtime.inference_service)(
                module_manager=self.runtime.module_manager,
                module_packages=self.runtime.module_packages,
                module_services=self.runtime.module_services,
                privacy_gate=self.runtime.privacy_gate,
                local_backend_name="",
            )

    def test_privacy_and_inference_services_reject_malformed_requests(self) -> None:
        with self.assertRaises(ValueError):
            self.runtime.privacy_gate.evaluate_hosted_use("bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            self.runtime.inference_service.route("bad")  # type: ignore[arg-type]

    def test_privacy_and_inference_services_detach_request_instances(self) -> None:
        hosted = HostedUseRequest(
            module_id="outlook",
            data_classes=["email-threads"],
            context_labels=["summary"],
        )
        inference = InferenceRequest(
            module_id="outlook",
            task_type="triage",
            data_classes=["email-threads"],
            context_labels=["summary"],
            prefer_hosted=True,
        )

        privacy_decision = self.runtime.privacy_gate.evaluate_hosted_use(hosted)
        inference_decision = self.runtime.inference_service.route(inference)
        privacy_reason = privacy_decision.reason
        inference_reason = inference_decision.privacy_decision.reason
        backend = inference_decision.backend
        hosted_approved = inference_decision.hosted_approved

        hosted.data_classes[0] = "mutated"
        hosted.context_labels[0] = "mutated"
        inference.data_classes[0] = "mutated"
        inference.context_labels[0] = "mutated"

        self.assertEqual(privacy_decision.reason, privacy_reason)
        self.assertEqual(inference_decision.privacy_decision.reason, inference_reason)
        self.assertEqual(inference_decision.backend, backend)
        self.assertEqual(inference_decision.hosted_approved, hosted_approved)

    def test_inference_defaults_to_local_backend(self) -> None:
        decision = self.runtime.inference_service.route(
            InferenceRequest(module_id="outlook", task_type="triage")
        )

        self.assertEqual(decision.backend, "local-default")
        self.assertFalse(decision.hosted_approved)
        self.assertEqual(decision.privacy_decision.reason, "local inference selected by default")

    def test_hosted_preference_falls_back_to_local_when_privacy_gate_blocks(self) -> None:
        decision = self.runtime.inference_service.route(
            InferenceRequest(
                module_id="outlook",
                task_type="triage",
                data_classes=["email-threads"],
                context_labels=["unsanitized-email-content"],
                prefer_hosted=True,
            )
        )

        self.assertEqual(decision.backend, "local-default")
        self.assertFalse(decision.hosted_approved)
        self.assertIn("cannot send data class outbound", decision.privacy_decision.reason)

    def test_inference_blocks_inactive_package(self) -> None:
        self.runtime.deactivate_module_package("release-one")

        decision = self.runtime.inference_service.route(
            InferenceRequest(module_id="outlook", task_type="triage")
        )

        self.assertEqual(decision.backend, "local-default")
        self.assertFalse(decision.hosted_approved)
        self.assertEqual(decision.privacy_decision.reason, "module package for outlook is inactive")

    def test_inference_blocks_uninstalled_module_surface(self) -> None:
        self.runtime.uninstall_module_package("release-one")

        decision = self.runtime.inference_service.route(
            InferenceRequest(module_id="outlook", task_type="triage")
        )

        self.assertEqual(decision.backend, "local-default")
        self.assertFalse(decision.hosted_approved)
        self.assertEqual(decision.privacy_decision.reason, "module outlook has no installed service")

    def test_inference_denies_unknown_module_without_raising(self) -> None:
        decision = self.runtime.inference_service.route(
            InferenceRequest(module_id="unknown", task_type="triage")
        )

        self.assertEqual(decision.backend, "local-default")
        self.assertFalse(decision.hosted_approved)
        self.assertIn("unknown module", decision.privacy_decision.reason)

    def test_privacy_gate_denies_unknown_module_without_raising(self) -> None:
        decision = self.runtime.privacy_gate.evaluate_hosted_use(
            HostedUseRequest(module_id="unknown", data_classes=["email-threads"])
        )

        self.assertFalse(decision.allowed)
        self.assertIn("unknown module", decision.reason)

    def test_privacy_gate_denies_inactive_package(self) -> None:
        self.runtime.deactivate_module_package("release-one")

        decision = self.runtime.privacy_gate.evaluate_hosted_use(
            HostedUseRequest(module_id="outlook", data_classes=["email-threads"])
        )

        self.assertFalse(decision.allowed)
        self.assertEqual(decision.reason, "module package for outlook is inactive")

    def test_privacy_gate_denies_uninstalled_module_surface(self) -> None:
        self.runtime.uninstall_module_package("release-one")

        decision = self.runtime.privacy_gate.evaluate_hosted_use(
            HostedUseRequest(module_id="outlook", data_classes=["email-threads"])
        )

        self.assertFalse(decision.allowed)
        self.assertEqual(decision.reason, "module outlook has no installed service")


if __name__ == "__main__":
    unittest.main()
