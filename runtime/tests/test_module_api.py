from __future__ import annotations

import unittest

from kendall_runtime.briefing import BriefingSignal
from kendall_runtime.module_api import ActionContext, ActionResult, BriefingContext, BriefingResult
from kendall_runtime.policy import ActionRequest
from kendall_runtime.runtime import KendallRuntime


class ModuleApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.runtime = KendallRuntime.bootstrap()

    def test_action_result_exposes_normalized_payload(self) -> None:
        result = ActionResult(status="created", reference_id="task-9", details={"task_id": "task-9"})

        self.assertEqual(
            result.as_payload(),
            {"status": "created", "reference_id": "task-9", "task_id": "task-9"},
        )

    def test_briefing_result_wraps_signal_list(self) -> None:
        result = BriefingResult(
            signals=[BriefingSignal(module_id="tasks", summary="Morning task", priority="high")]
        )

        self.assertEqual(len(result.signals), 1)
        self.assertEqual(result.signals[0].module_id, "tasks")

    def test_action_result_rejects_malformed_fields(self) -> None:
        with self.assertRaises(ValueError):
            ActionResult(status="", reference_id="task-9")
        with self.assertRaises(ValueError):
            ActionResult(status=1, reference_id="task-9")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            ActionResult(status="created", reference_id="")
        with self.assertRaises(ValueError):
            ActionResult(status="created", reference_id=1)  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            ActionResult(status="created", reference_id="task-9", details="bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            ActionResult(status="created", reference_id="task-9", details={"": "task-9"})
        with self.assertRaises(ValueError):
            ActionResult(status="created", reference_id="task-9", details={"task_id": 9})  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            ActionResult(status="created", reference_id="task-9", details={"status": "override"})

    def test_contexts_reject_malformed_fields(self) -> None:
        with self.assertRaises(ValueError):
            BriefingContext(
                module_id="",
                briefing_type="morning",
                data=self.runtime.data_for_module("tasks"),
                memory=self.runtime.memory_for_module("tasks"),
            )
        with self.assertRaises(ValueError):
            BriefingContext(
                module_id=1,  # type: ignore[arg-type]
                briefing_type="morning",
                data=self.runtime.data_for_module("tasks"),
                memory=self.runtime.memory_for_module("tasks"),
            )
        with self.assertRaises(ValueError):
            BriefingContext(
                module_id="tasks",
                briefing_type=1,  # type: ignore[arg-type]
                data=self.runtime.data_for_module("tasks"),
                memory=self.runtime.memory_for_module("tasks"),
            )
        with self.assertRaises(ValueError):
            ActionContext(
                module_id="outlook",
                request=ActionRequest(
                    module_id="tasks",
                    action_type="create-task",
                    mode="internal",
                    target="task-1",
                ),
                data=self.runtime.data_for_module("tasks"),
                memory=self.runtime.memory_for_module("tasks"),
            )
        with self.assertRaises(ValueError):
            ActionContext(
                module_id=1,  # type: ignore[arg-type]
                request=ActionRequest(
                    module_id="tasks",
                    action_type="create-task",
                    mode="internal",
                    target="task-1",
                ),
                data=self.runtime.data_for_module("tasks"),
                memory=self.runtime.memory_for_module("tasks"),
            )
        with self.assertRaises(ValueError):
            BriefingContext(
                module_id="tasks",
                briefing_type="morning",
                data="bad",  # type: ignore[arg-type]
                memory=self.runtime.memory_for_module("tasks"),
            )
        with self.assertRaises(ValueError):
            ActionContext(
                module_id="tasks",
                request="bad",  # type: ignore[arg-type]
                data=self.runtime.data_for_module("tasks"),
                memory=self.runtime.memory_for_module("tasks"),
            )
        with self.assertRaises(ValueError):
            BriefingContext(
                module_id="tasks",
                briefing_type="morning",
                data=self.runtime.data_for_module("outlook"),
                memory=self.runtime.memory_for_module("tasks"),
            )
        with self.assertRaises(ValueError):
            ActionContext(
                module_id="tasks",
                request=ActionRequest(
                    module_id="tasks",
                    action_type="create-task",
                    mode="internal",
                    target="task-1",
                ),
                data=self.runtime.data_for_module("tasks"),
                memory=self.runtime.memory_for_module("outlook"),
            )

    def test_briefing_result_rejects_non_list_signals(self) -> None:
        with self.assertRaises(ValueError):
            BriefingResult(signals="not-a-list")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            BriefingResult(signals=["not-a-signal"])  # type: ignore[list-item]

    def test_briefing_result_clone_and_action_payload_are_detached(self) -> None:
        result = BriefingResult(
            signals=[BriefingSignal(module_id="tasks", summary="Morning task", details={"source": "seed"})]
        )
        cloned = result.clone()
        cloned.signals[0].details["source"] = "mutated"

        self.assertEqual(result.signals[0].details["source"], "seed")

        action_result = ActionResult(status="created", reference_id="task-9", details={"task_id": "task-9"})
        payload = action_result.as_payload()
        payload["status"] = "mutated"

        self.assertEqual(action_result.status, "created")

    def test_result_types_detach_constructor_inputs(self) -> None:
        details = {"task_id": "task-9"}
        action_result = ActionResult(status="created", reference_id="task-9", details=details)
        details["task_id"] = "mutated"
        self.assertEqual(action_result.details["task_id"], "task-9")

        signal = BriefingSignal(module_id="tasks", summary="Morning task", details={"source": "seed"})
        signals = [signal]
        briefing_result = BriefingResult(signals=signals)
        signal.details["source"] = "mutated"
        signals[0] = BriefingSignal(module_id="outlook", summary="Other")
        self.assertEqual(briefing_result.signals[0].module_id, "tasks")
        self.assertEqual(briefing_result.signals[0].details["source"], "seed")

    def test_action_context_detaches_request_object(self) -> None:
        request = ActionRequest(
            module_id="tasks",
            action_type="create-task",
            mode="internal",
            target="task-1",
            details={"title": "Prepare brief"},
        )
        context = ActionContext(
            module_id="tasks",
            request=request,
            data=self.runtime.data_for_module("tasks"),
            memory=self.runtime.memory_for_module("tasks"),
        )
        request.module_id = "outlook"
        request.details["title"] = "mutated"

        self.assertEqual(context.request.module_id, "tasks")
        self.assertEqual(context.request.details["title"], "Prepare brief")

    def test_contexts_detach_scope_objects(self) -> None:
        data = self.runtime.data_for_module("tasks")
        memory = self.runtime.memory_for_module("tasks")
        briefing = BriefingContext(
            module_id="tasks",
            briefing_type="morning",
            data=data,
            memory=memory,
        )
        action = ActionContext(
            module_id="tasks",
            request=ActionRequest(
                module_id="tasks",
                action_type="create-task",
                mode="internal",
                target="task-1",
            ),
            data=data,
            memory=memory,
        )
        data.module_id = "outlook"
        memory.module_id = "outlook"

        self.assertEqual(briefing.data.module_id, "tasks")
        self.assertEqual(briefing.memory.module_id, "tasks")
        self.assertEqual(action.data.module_id, "tasks")
        self.assertEqual(action.memory.module_id, "tasks")


if __name__ == "__main__":
    unittest.main()
