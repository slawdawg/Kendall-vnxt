from __future__ import annotations

import unittest

from kendall_runtime.actions import ActionDispatcher
from kendall_runtime.briefing import BriefingService, BriefingSignal
from kendall_runtime.module_api import ActionResult, BriefingResult
from kendall_runtime.policy import ActionRequest, PolicyGate
from kendall_runtime.runtime import KendallRuntime


class OrchestrationServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.runtime = KendallRuntime.bootstrap()
        self.module_manager = self.runtime.module_manager
        self.audit_service = self.runtime.audit_service
        self.trust_service = self.runtime.trust_service
        self.policy_gate = self.runtime.policy_gate
        self.service = self.runtime.orchestration_service

    def test_compose_briefing_ignores_disabled_modules(self) -> None:
        self.module_manager.disable_module("tasks")
        packet = self.service.compose_briefing(
            "morning",
            {
                "tasks": [BriefingSignal(module_id="tasks", summary="Disabled item", priority="critical")],
                "outlook": [BriefingSignal(module_id="outlook", summary="Inbox item", priority="high")],
            },
        )

        self.assertEqual([item.module_id for item in packet.items], ["outlook"])
        self.assertEqual(packet.participating_modules, ["outlook"])

    def test_route_action_denies_allowed_action_without_handler(self) -> None:
        outcome = self.service.route_action(
            ActionRequest(
                module_id="tasks",
                action_type="create-reminder",
                mode="internal",
                target="reminder-1",
            )
        )

        self.assertFalse(outcome.decision.allowed)
        self.assertEqual(outcome.decision.reason, "no handler registered for tasks:create-reminder")
        self.assertEqual(len(self.audit_service.records), 1)
        self.assertEqual(self.audit_service.records[0].action_type, "policy-denied")
        self.assertEqual(outcome.execution_payload, {})

    def test_route_action_dispatches_to_registered_handler(self) -> None:
        def create_task_handler(context) -> ActionResult:
            return ActionResult(status="created", reference_id=context.request.target, details={"target": context.request.target})

        self.service.action_dispatcher.register_handler("tasks", "create-task", create_task_handler)
        outcome = self.service.route_action(
            ActionRequest(
                module_id="tasks",
                action_type="create-task",
                mode="internal",
                target="task-7",
            )
        )

        self.assertTrue(outcome.decision.allowed)
        self.assertEqual(
            outcome.execution_payload,
            {"status": "created", "reference_id": "task-7", "target": "task-7"},
        )

    def test_route_action_detaches_dispatched_payload_from_later_mutation(self) -> None:
        captured: dict[str, str] = {}

        def create_task_handler(context) -> ActionResult:
            nonlocal captured
            result = ActionResult(
                status="created",
                reference_id=context.request.target,
                details={"target": context.request.target},
            )
            captured = result.as_payload()
            return result

        self.service.action_dispatcher.register_handler("tasks", "create-task", create_task_handler)
        outcome = self.service.route_action(
            ActionRequest(
                module_id="tasks",
                action_type="create-task",
                mode="internal",
                target="task-7",
            )
        )
        captured["status"] = "mutated"

        self.assertEqual(outcome.execution_payload["status"], "created")

    def test_route_action_records_execution_failure_when_handler_returns_wrong_type(self) -> None:
        self.service.action_dispatcher.register_handler(
            "tasks",
            "create-task",
            lambda context: "not-a-result",  # type: ignore[return-value]
        )

        outcome = self.service.route_action(
            ActionRequest(
                module_id="tasks",
                action_type="create-task",
                mode="internal",
                target="task-9",
            )
        )

        self.assertFalse(outcome.decision.allowed)
        self.assertIn("must return an ActionResult", outcome.decision.reason)
        self.assertEqual(outcome.audit_record.action_type, "execution-failed")

    def test_route_action_rejects_malformed_request(self) -> None:
        with self.assertRaises(ValueError):
            self.service.route_action("bad")  # type: ignore[arg-type]

    def test_route_action_detaches_request_from_later_mutation(self) -> None:
        captured: list[dict[str, str]] = []

        def create_task_handler(context) -> ActionResult:
            captured.append(dict(context.request.details))
            return ActionResult(status="created", reference_id=context.request.target)

        request = ActionRequest(
            module_id="tasks",
            action_type="create-task",
            mode="internal",
            target="task-7",
            details={"title": "Original"},
        )
        self.service.action_dispatcher.register_handler("tasks", "create-task", create_task_handler)

        outcome = self.service.route_action(request)
        request.details["title"] = "mutated"

        self.assertTrue(outcome.decision.allowed)
        self.assertEqual(captured, [{"title": "Original"}])

    def test_compose_briefing_collects_registered_module_signals(self) -> None:
        self.service.signal_registry.register_provider(
            "outlook",
            lambda context: BriefingResult(
                signals=[
                    BriefingSignal(
                        module_id="outlook",
                        summary=f"{context.briefing_type} inbox review",
                        priority="high",
                    )
                ]
            ),
        )
        self.service.signal_registry.register_provider(
            "tasks",
            lambda context: BriefingResult(
                signals=[
                    BriefingSignal(
                        module_id="tasks",
                        summary=f"{context.briefing_type} tasks review",
                        priority="normal",
                    )
                ]
            ),
        )

        packet = self.service.compose_briefing_from_registered_modules("morning")

        self.assertEqual([item.module_id for item in packet.items], ["outlook", "tasks"])
        self.assertEqual(packet.participating_modules, ["outlook", "tasks"])

    def test_compose_briefing_from_registered_modules_rejects_wrong_provider_result_type(self) -> None:
        self.service.signal_registry.register_provider(
            "tasks",
            lambda context: "not-a-result",  # type: ignore[return-value]
        )

        with self.assertRaises(ValueError):
            self.service.compose_briefing_from_registered_modules("morning")

    def test_compose_briefing_rejects_mismatched_signal_owner(self) -> None:
        with self.assertRaises(ValueError):
            self.service.compose_briefing(
                "morning",
                {
                    "tasks": [BriefingSignal(module_id="outlook", summary="Wrong owner", priority="high")],
                },
            )

    def test_compose_briefing_rejects_malformed_signal_buckets(self) -> None:
        with self.assertRaises(ValueError):
            self.service.compose_briefing("morning", {"": []})  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            self.service.compose_briefing("morning", {"tasks": "bad"})  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            self.service.compose_briefing("morning", {"tasks": [object()]})  # type: ignore[list-item]

    def test_compose_briefing_detaches_signals_from_later_mutation(self) -> None:
        signal = BriefingSignal(module_id="tasks", summary="Task item", details={"kind": "open"})

        packet = self.service.compose_briefing("morning", {"tasks": [signal]})
        signal.summary = "mutated"
        signal.details["kind"] = "mutated"

        self.assertEqual(packet.items[0].summary, "Task item")
        self.assertEqual(packet.items[0].details["kind"], "open")

    def test_compose_briefing_from_registered_modules_skips_inactive_packages(self) -> None:
        runtime = KendallRuntime.bootstrap_release_one()
        runtime.data_service.put(
            "email-threads",
            "thread-1",
            {"subject": "Reply to CEO", "priority": "vip-follow-up"},
            "seed",
        )
        runtime.data_service.put(
            "tasks",
            "task-1",
            {"title": "Prepare briefing", "priority": "high", "status": "open"},
            "seed",
        )
        runtime.deactivate_module_package("release-one")

        packet = runtime.orchestration_service.compose_briefing_from_registered_modules("morning")

        self.assertEqual(packet.items, [])
        self.assertEqual(packet.participating_modules, [])

    def test_route_action_blocks_inactive_package_handlers(self) -> None:
        runtime = KendallRuntime.bootstrap_release_one()
        runtime.deactivate_module_package("release-one")

        outcome = runtime.orchestration_service.route_action(
            ActionRequest(
                module_id="tasks",
                action_type="create-task",
                mode="internal",
                target="task-7",
                details={"title": "Blocked by inactive package"},
            )
        )

        self.assertFalse(outcome.decision.allowed)
        self.assertEqual(outcome.decision.reason, "module package for tasks is inactive")
        self.assertEqual(outcome.execution_payload, {})
        self.assertIsNone(runtime.data_service.get("tasks", "task-7"))
        self.assertEqual(len(runtime.audit_service.records), 1)
        self.assertEqual(runtime.audit_service.records[0].action_type, "policy-denied")

    def test_route_action_denies_uninstalled_package_handler(self) -> None:
        runtime = KendallRuntime.bootstrap_release_one()
        runtime.uninstall_module_package("release-one")

        outcome = runtime.orchestration_service.route_action(
            ActionRequest(
                module_id="tasks",
                action_type="create-task",
                mode="internal",
                target="task-8",
            )
        )

        self.assertFalse(outcome.decision.allowed)
        self.assertEqual(outcome.decision.reason, "no handler registered for tasks:create-task")
        self.assertIsNone(runtime.data_service.get("tasks", "task-8"))
        self.assertEqual(runtime.audit_service.records[0].action_type, "policy-denied")

    def test_orchestration_service_rejects_malformed_dependencies(self) -> None:
        with self.assertRaises(ValueError):
            type(self.service)(
                module_manager="bad",  # type: ignore[arg-type]
                briefing_service=self.runtime.briefing_service,
                policy_gate=self.runtime.policy_gate,
                action_dispatcher=self.runtime.action_dispatcher,
                signal_registry=self.runtime.signal_registry,
                data_scope_manager=self.runtime.data_scope_manager,
                memory_scope_manager=self.runtime.memory_scope_manager,
                module_packages=self.runtime.module_packages,
            )

    def test_action_dispatcher_rejects_malformed_dispatch_context(self) -> None:
        dispatcher = ActionDispatcher()
        with self.assertRaises(ValueError):
            dispatcher.dispatch("bad")  # type: ignore[arg-type]

    def test_orchestration_public_paths_reject_malformed_dependency_state(self) -> None:
        runtime = KendallRuntime.bootstrap_release_one()
        runtime.signal_registry.provider_owners["unknown"] = "pkg"
        with self.assertRaises(ValueError):
            runtime.orchestration_service.compose_briefing_from_registered_modules("morning")

        runtime = KendallRuntime.bootstrap_release_one()
        runtime.action_dispatcher.handler_owners[("unknown", "create-task")] = "pkg"
        with self.assertRaises(ValueError):
            runtime.orchestration_service.route_action(
                ActionRequest(
                    module_id="tasks",
                    action_type="create-task",
                    mode="internal",
                    target="task-1",
                )
            )

        runtime = KendallRuntime.bootstrap_release_one()
        runtime.module_packages.packages["release-one"] = "bad"  # type: ignore[assignment]
        with self.assertRaises(ValueError):
            runtime.orchestration_service.compose_briefing(
                "morning",
                {"tasks": [BriefingSignal(module_id="tasks", summary="Task item")]},
            )


if __name__ == "__main__":
    unittest.main()
