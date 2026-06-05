from __future__ import annotations

import unittest

from kendall_runtime.briefing import BriefingService, BriefingSignal
from kendall_runtime.module_manager import ModuleManager
from kendall_runtime.paths import modules_root
from kendall_runtime.policy import ActionOutcome, ActionRequest, PolicyDecision, PolicyGate
from kendall_runtime.services.audit import AuditRecord, AuditService
from kendall_runtime.services.trust import TrustPolicyService


class BriefingServiceTests(unittest.TestCase):
    def test_compose_orders_high_priority_signals_first(self) -> None:
        service = BriefingService()
        packet = service.compose(
            "morning",
            [
                BriefingSignal(module_id="tasks", summary="Review backlog", priority="normal"),
                BriefingSignal(module_id="outlook", summary="VIP follow-up overdue", priority="critical"),
                BriefingSignal(module_id="scheduling", summary="Back-to-back travel risk", priority="high"),
            ],
        )

        self.assertEqual(packet.items[0].module_id, "outlook")
        self.assertEqual(packet.items[1].module_id, "scheduling")
        self.assertEqual(packet.participating_modules, ["outlook", "scheduling", "tasks"])

    def test_rejects_unknown_priority(self) -> None:
        with self.assertRaises(ValueError):
            BriefingSignal(module_id="tasks", summary="Bad priority", priority="urgent")

    def test_rejects_malformed_signal_details_and_category(self) -> None:
        with self.assertRaises(ValueError):
            BriefingSignal(module_id="tasks", summary="Bad category", category="")
        with self.assertRaises(ValueError):
            BriefingSignal(module_id=object(), summary="Bad module")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            BriefingSignal(module_id="tasks", summary=object())  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            BriefingSignal(module_id="tasks", summary="Bad details", details=[("task_id", "1")])  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            BriefingSignal(module_id="tasks", summary="Bad detail key", details={"": "value"})
        with self.assertRaises(ValueError):
            BriefingSignal(module_id="tasks", summary="Bad detail value", details={"task_id": 1})  # type: ignore[arg-type]

    def test_compose_rejects_invalid_briefing_type_and_max_items(self) -> None:
        service = BriefingService()

        with self.assertRaises(ValueError):
            service.compose("", [])
        with self.assertRaises(ValueError):
            service.compose("morning", "bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            service.compose("morning", [object()])  # type: ignore[list-item]
        with self.assertRaises(ValueError):
            service.compose("morning", [], max_items=-1)
        with self.assertRaises(ValueError):
            service.compose(object(), [])  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            service._build_headline("", [])
        with self.assertRaises(ValueError):
            service._build_headline("morning", "bad")  # type: ignore[arg-type]

    def test_compose_returns_detached_signal_payloads(self) -> None:
        service = BriefingService()
        original = BriefingSignal(module_id="tasks", summary="Review backlog", details={"record_id": "task-1"})

        packet = service.compose("morning", [original])
        packet.items[0].details["record_id"] = "mutated"
        packet.participating_modules[0] = "mutated"

        self.assertEqual(original.details["record_id"], "task-1")
        refreshed = service.compose("morning", [original])
        self.assertEqual(refreshed.participating_modules, ["tasks"])
        self.assertEqual(refreshed.items[0].details["record_id"], "task-1")

    def test_signal_and_packet_detach_constructor_inputs(self) -> None:
        details = {"record_id": "task-1"}
        signal = BriefingSignal(module_id="tasks", summary="Review backlog", details=details)
        details["record_id"] = "mutated"

        items = [signal]
        packet = BriefingService().compose("morning", items)
        items[0].details["record_id"] = "changed again"
        direct_packet = BriefingService().compose("morning", [signal])
        signal.details["record_id"] = "signal-mutated"

        self.assertEqual(packet.items[0].details["record_id"], "task-1")
        self.assertEqual(direct_packet.items[0].details["record_id"], "changed again")


class PolicyGateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.module_manager = ModuleManager.discover(modules_root())
        self.audit_service = AuditService()
        self.trust_service = TrustPolicyService()
        self.policy_gate = PolicyGate(self.module_manager, self.trust_service, self.audit_service)

    def test_blocks_forbidden_outlook_send_action(self) -> None:
        outcome = self.policy_gate.execute(
            ActionRequest(
                module_id="outlook",
                action_type="autonomous-email-send",
                mode="external",
                target="thread-123",
            )
        )

        self.assertFalse(outcome.decision.allowed)
        self.assertIn("forbidden", outcome.decision.reason)
        self.assertTrue(outcome.decision.audit_recorded)
        self.assertEqual(len(self.audit_service.records), 1)
        self.assertEqual(self.audit_service.records[0].action_type, "policy-denied")

    def test_allows_tasks_internal_action_and_audits_it(self) -> None:
        outcome = self.policy_gate.execute(
            ActionRequest(
                module_id="tasks",
                action_type="create-task",
                mode="internal",
                target="task-123",
                details={"title": "Follow up with customer"},
            )
        )

        self.assertTrue(outcome.decision.allowed)
        self.assertTrue(outcome.decision.audit_recorded)
        self.assertIsNotNone(outcome.audit_record)
        self.assertEqual(outcome.audit_record.actor, "tasks")
        self.assertEqual(outcome.audit_record.action_type, "create-task")
        self.assertTrue(outcome.audit_record.reversible)

    def test_requires_approval_for_disruptive_scheduling_hold(self) -> None:
        outcome = self.policy_gate.execute(
            ActionRequest(
                module_id="scheduling",
                action_type="create-tentative-internal-hold",
                mode="internal",
                target="calendar-block-1",
                user_visible_disruption=True,
            )
        )

        self.assertFalse(outcome.decision.allowed)
        self.assertTrue(outcome.decision.requires_approval)
        self.assertEqual(len(self.audit_service.records), 1)
        self.assertEqual(self.audit_service.records[0].action_type, "policy-denied")

    def test_policy_gate_rejects_invalid_trust_posture_configuration(self) -> None:
        self.trust_service.set_posture("tasks", "advisory")
        self.trust_service.domains["tasks"].posture = "automatic"

        with self.assertRaises(ValueError):
            self.policy_gate.evaluate(
                ActionRequest(
                    module_id="tasks",
                    action_type="create-task",
                    mode="internal",
                    target="task-123",
                )
            )

    def test_policy_gate_rejects_unsupported_active_posture(self) -> None:
        self.trust_service.set_posture("tasks", "approval-bound")

        outcome = self.policy_gate.execute(
            ActionRequest(
                module_id="tasks",
                action_type="create-task",
                mode="internal",
                target="task-123",
            )
        )

        self.assertFalse(outcome.decision.allowed)
        self.assertIn("not supported by contract", outcome.decision.reason)
        self.assertEqual(self.audit_service.records[0].action_type, "policy-denied")

    def test_rejects_unknown_action_mode(self) -> None:
        with self.assertRaises(ValueError):
            ActionRequest(
                module_id="tasks",
                action_type="create-task",
                mode="automatic",
                target="task-123",
            )

    def test_rejects_malformed_action_request_details_and_flags(self) -> None:
        with self.assertRaises(ValueError):
            ActionRequest(
                module_id=object(),  # type: ignore[arg-type]
                action_type="create-task",
                mode="internal",
                target="task-123",
            )
        with self.assertRaises(ValueError):
            ActionRequest(
                module_id="tasks",
                action_type=object(),  # type: ignore[arg-type]
                mode="internal",
                target="task-123",
            )
        with self.assertRaises(ValueError):
            ActionRequest(
                module_id="tasks",
                action_type="create-task",
                mode="internal",
                target=object(),  # type: ignore[arg-type]
            )
        with self.assertRaises(ValueError):
            ActionRequest(
                module_id="tasks",
                action_type="create-task",
                mode=object(),  # type: ignore[arg-type]
                target="task-123",
            )
        with self.assertRaises(ValueError):
            ActionRequest(
                module_id="tasks",
                action_type="create-task",
                mode="internal",
                target="task-123",
                details=[("title", "value")],  # type: ignore[arg-type]
            )
        with self.assertRaises(ValueError):
            ActionRequest(
                module_id="tasks",
                action_type="create-task",
                mode="internal",
                target="task-123",
                details={"": "value"},
            )
        with self.assertRaises(ValueError):
            ActionRequest(
                module_id="tasks",
                action_type="create-task",
                mode="internal",
                target="task-123",
                details={"title": 1},  # type: ignore[arg-type]
            )
        with self.assertRaises(ValueError):
            ActionRequest(
                module_id="tasks",
                action_type="create-task",
                mode="internal",
                target="task-123",
                approval_present="yes",  # type: ignore[arg-type]
            )
        with self.assertRaises(ValueError):
            ActionRequest(
                module_id="tasks",
                action_type="create-task",
                mode="internal",
                target="task-123",
                user_visible_disruption="yes",  # type: ignore[arg-type]
            )

    def test_action_request_and_outcome_detach_constructor_inputs(self) -> None:
        details = {"title": "Follow up"}
        request = ActionRequest(
            module_id="tasks",
            action_type="create-task",
            mode="internal",
            target="task-123",
            details=details,
        )
        details["title"] = "mutated"
        self.assertEqual(request.details["title"], "Follow up")

        payload = {"status": "ok"}
        outcome = ActionOutcome(
            decision=PolicyDecision(allowed=True, reason="ok"),
            execution_payload=payload,
        )
        payload["status"] = "mutated"
        self.assertEqual(outcome.execution_payload["status"], "ok")

        decision = PolicyDecision(allowed=True, reason="ok")
        audit_record = AuditRecord(
            timestamp="2026-06-03T00:00:00+00:00",
            actor="tasks",
            action_type="create-task",
            target="task-1",
            details={"title": "Follow up"},
        )
        nested_outcome = ActionOutcome(
            decision=decision,
            audit_record=audit_record,
            execution_payload={"status": "ok"},
        )
        decision.reason = "mutated"
        audit_record.details["title"] = "mutated"

        self.assertEqual(nested_outcome.decision.reason, "ok")
        self.assertEqual(nested_outcome.audit_record.details["title"], "Follow up")

    def test_policy_types_reject_malformed_construction(self) -> None:
        with self.assertRaises(ValueError):
            PolicyDecision(allowed="yes", reason="bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            PolicyDecision(allowed=True, reason="")
        with self.assertRaises(ValueError):
            ActionOutcome(decision="bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            ActionOutcome(
                decision=PolicyDecision(allowed=True, reason="ok"),
                execution_payload=[("status", "ok")],  # type: ignore[arg-type]
            )
        with self.assertRaises(ValueError):
            ActionOutcome(
                decision=PolicyDecision(allowed=True, reason="ok"),
                audit_record=AuditRecord(
                    timestamp="2026-06-03T00:00:00+00:00",
                    actor="tasks",
                    action_type="create-task",
                    target="task-1",
                    details={},
                ),
                execution_payload={"": "bad"},
            )
        with self.assertRaises(ValueError):
            PolicyGate("bad", self.trust_service, self.audit_service)  # type: ignore[arg-type]

    def test_policy_gate_rejects_malformed_request_entrypoints(self) -> None:
        with self.assertRaises(ValueError):
            self.policy_gate.evaluate("bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            self.policy_gate.execute("bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            self.policy_gate.record_denied(
                "bad",  # type: ignore[arg-type]
                PolicyDecision(allowed=False, reason="denied"),
            )
        with self.assertRaises(ValueError):
            self.policy_gate.record_allowed("bad", "allowed")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            self.policy_gate.record_execution_failure("bad", "failed")  # type: ignore[arg-type]

    def test_policy_gate_detaches_request_instances_at_entrypoints(self) -> None:
        request = ActionRequest(
            module_id="tasks",
            action_type="create-task",
            mode="internal",
            target="task-123",
            details={"title": "Follow up"},
        )

        denied = self.policy_gate.record_denied(
            request,
            PolicyDecision(allowed=False, reason="denied"),
        )
        allowed = self.policy_gate.record_allowed(request, "allowed")
        failed = self.policy_gate.record_execution_failure(request, "failed")
        request.details["title"] = "mutated"

        self.assertEqual(denied.audit_record.details["requested_action_type"], "create-task")
        self.assertEqual(allowed.audit_record.details["title"], "Follow up")
        self.assertEqual(failed.audit_record.details["requested_action_type"], "create-task")


if __name__ == "__main__":
    unittest.main()
