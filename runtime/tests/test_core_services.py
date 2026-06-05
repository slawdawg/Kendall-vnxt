from __future__ import annotations

import unittest

from kendall_runtime.services.audit import AuditService
from kendall_runtime.services.data import DataService, DataRecord
from kendall_runtime.services.memory import MemoryService, MemoryEntry
from kendall_runtime.services.trust import TrustPolicyService, DomainTrustState
from kendall_runtime.actions import ActionDispatchResult, ActionDispatcher
from kendall_runtime.module_service_registry import ModuleServiceRegistry
from kendall_runtime.signal_registry import BriefingSignalRegistry


class CoreServiceTests(unittest.TestCase):
    def test_memory_service_stores_entries_by_class(self) -> None:
        service = MemoryService()
        service.put("core_preference", "briefing_time", "08:00", "user")
        entry = service.get("core_preference", "briefing_time")
        self.assertIsNotNone(entry)
        self.assertEqual(entry.value, "08:00")
        self.assertEqual(service.entry_count(), 1)
        self.assertEqual(service.entry_count_by_class()["core_preference"], 1)

    def test_trust_service_tracks_domain_events(self) -> None:
        service = TrustPolicyService()
        state = service.record_accepted_suggestion("scheduling")
        self.assertEqual(state.accepted_suggestions, 1)
        self.assertEqual(state.domain, "scheduling")
        state.accepted_suggestions = 99
        self.assertEqual(service.get_domain("scheduling").accepted_suggestions, 1)

    def test_trust_service_rejects_unknown_posture(self) -> None:
        service = TrustPolicyService()

        with self.assertRaises(ValueError):
            service.set_posture("scheduling", "automatic")

        with self.assertRaises(ValueError):
            service.resolve_posture("scheduling", fallback_posture="automatic")

    def test_trust_service_rejects_malformed_domain(self) -> None:
        service = TrustPolicyService()

        with self.assertRaises(ValueError):
            service.ensure_domain("")
        with self.assertRaises(ValueError):
            service.record_accepted_suggestion("")

    def test_audit_service_returns_reversible_records(self) -> None:
        service = AuditService()
        service.append(actor="tasks", action_type="create-task", target="task-1", reversible=True)
        service.append(actor="tasks", action_type="summarize", target="task-list", reversible=False)
        self.assertEqual(len(service.reversible_records()), 1)
        reversible = service.reversible_records()
        reversible[0].target = "mutated"
        self.assertEqual(service.reversible_records()[0].target, "task-1")

    def test_audit_service_constructor_validates_and_detaches_records(self) -> None:
        record = AuditService().append(actor="tasks", action_type="create-task", target="task-1")
        records = [record]
        service = AuditService(records=records)
        record.target = "mutated"
        records[0] = AuditService().append(actor="tasks", action_type="other", target="task-2")

        self.assertEqual(service.list_records()[0].target, "task-1")

        with self.assertRaises(ValueError):
            AuditService(records="bad")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            AuditService(records=["bad"])  # type: ignore[list-item]

    def test_memory_service_returns_copied_entries(self) -> None:
        service = MemoryService()
        created = service.put("core_preference", "briefing_time", "08:00", "user")
        created.value = "09:00"
        loaded = service.get("core_preference", "briefing_time")
        loaded.value = "10:00"
        reloaded = service.get("core_preference", "briefing_time")

        self.assertEqual(reloaded.value, "08:00")

    def test_audit_service_copies_details(self) -> None:
        service = AuditService()
        details = {"title": "Prepare brief"}
        created = service.append(actor="tasks", action_type="create-task", target="task-1", details=details)
        details["title"] = "Mutated outside"
        created.details["title"] = "Mutated returned copy"

        self.assertEqual(service.records[0].details["title"], "Prepare brief")
        self.assertEqual(service.reversible_records(), [])

    def test_direct_record_and_dispatch_types_detach_constructor_inputs(self) -> None:
        payload = {"title": "Follow up"}
        record = DataRecord(record_id="task-1", payload=payload, source="tasks")
        payload["title"] = "mutated"
        self.assertEqual(record.payload["title"], "Follow up")

        details = {"title": "Prepare brief"}
        audit_record = AuditService().append(
            actor="tasks",
            action_type="create-task",
            target="task-1",
            details=details,
        )
        details["title"] = "mutated"
        self.assertEqual(audit_record.details["title"], "Prepare brief")

        dispatch_payload = {"status": "ok"}
        dispatch = ActionDispatchResult(handler_called=True, payload=dispatch_payload)
        dispatch_payload["status"] = "mutated"
        self.assertEqual(dispatch.payload["status"], "ok")

    def test_audit_and_trust_services_return_detached_reads(self) -> None:
        audit = AuditService()
        audit.append(actor="tasks", action_type="create-task", target="task-1", reversible=True)
        listed = audit.list_records()
        listed[0].details["title"] = "mutated"
        self.assertNotIn("title", audit.list_records()[0].details)

        trust = TrustPolicyService()
        trust.record_shadow_success("tasks")
        snapshot = trust.get_domain("tasks")
        snapshot.shadow_successes = 42
        self.assertEqual(trust.get_domain("tasks").shadow_successes, 1)
        listed_domains = trust.list_domains()
        listed_domains[0].posture = "shadow"
        self.assertEqual(trust.get_domain("tasks").posture, "advisory")

    def test_audit_service_rejects_malformed_fields(self) -> None:
        service = AuditService()

        with self.assertRaises(ValueError):
            service.append(actor="", action_type="create-task", target="task-1")
        with self.assertRaises(ValueError):
            service.append(actor="tasks", action_type="", target="task-1")
        with self.assertRaises(ValueError):
            service.append(actor="tasks", action_type="create-task", target="")
        with self.assertRaises(ValueError):
            service.append(actor="tasks", action_type="create-task", target="task-1", details={"": "x"})
        with self.assertRaises(ValueError):
            service.append(actor="tasks", action_type="create-task", target="task-1", details={"title": 1})  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            service.append(actor="tasks", action_type="create-task", target="task-1", reversible="yes")  # type: ignore[arg-type]

    def test_data_service_rejects_malformed_identifiers_and_payload(self) -> None:
        service = DataService()

        with self.assertRaises(ValueError):
            service.put("", "task-1", {"title": "Follow up"}, "tasks")
        with self.assertRaises(ValueError):
            service.put("tasks", "", {"title": "Follow up"}, "tasks")
        with self.assertRaises(ValueError):
            service.put("tasks", "task-1", {"title": 1}, "tasks")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            service.put("tasks", "task-1", {"": "Follow up"}, "tasks")
        with self.assertRaises(ValueError):
            service.get("", "task-1")
        with self.assertRaises(ValueError):
            service.delete("tasks", "")

        with self.assertRaises(ValueError):
            DataRecord(record_id="", payload={"title": "Follow up"}, source="tasks")
        with self.assertRaises(ValueError):
            DataRecord(record_id="task-1", payload={"": "Follow up"}, source="tasks")

    def test_memory_service_rejects_malformed_identifiers_and_values(self) -> None:
        service = MemoryService()

        with self.assertRaises(ValueError):
            service.put("core_preference", "", "08:00", "user")
        with self.assertRaises(ValueError):
            service.put("core_preference", "briefing_time", 800, "user")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            service.put("core_preference", "briefing_time", "08:00", "")
        with self.assertRaises(ValueError):
            service.get("core_preference", "")
        with self.assertRaises(ValueError):
            service.delete("", "briefing_time")

        with self.assertRaises(ValueError):
            MemoryEntry(key="", value="08:00", source="user")
        with self.assertRaises(ValueError):
            MemoryEntry(key="briefing_time", value=800, source="user")  # type: ignore[arg-type]

    def test_dispatch_and_registry_types_reject_malformed_inputs(self) -> None:
        with self.assertRaises(ValueError):
            ActionDispatchResult(handler_called="yes")  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            ActionDispatchResult(handler_called=True, payload=[("status", "ok")])  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            ActionDispatchResult(handler_called=True, payload={"": "value"})
        with self.assertRaises(ValueError):
            ActionDispatchResult(handler_called=True, payload={"status": 1})  # type: ignore[arg-type]

        services = ModuleServiceRegistry()
        with self.assertRaises(ValueError):
            services.register("", object())
        with self.assertRaises(ValueError):
            services.register("tasks", None)  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            services.has("")

        signals = BriefingSignalRegistry()
        with self.assertRaises(ValueError):
            signals.register_provider("", lambda context: None)  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            signals.register_provider("tasks", None)  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            signals.provider_for("")
        with self.assertRaises(ValueError):
            signals.has_provider("")

        dispatcher = ActionDispatcher()
        with self.assertRaises(ValueError):
            dispatcher.register_handler("", "create-task", lambda context: None)  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            dispatcher.register_handler("tasks", "create-task", None)  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            dispatcher.has_handler("tasks", "")
        with self.assertRaises(ValueError):
            dispatcher.list_action_types("")
        dispatcher.register_handler("tasks", "create-task", lambda context: "not-a-result")  # type: ignore[arg-type]
        fake_request = type("Request", (), {"module_id": "tasks", "action_type": "create-task"})()
        fake_context = type("Context", (), {"request": fake_request})()
        with self.assertRaises(ValueError):
            dispatcher.dispatch(fake_context)

    def test_core_service_constructor_types_validate_and_detach_state(self) -> None:
        record = DataRecord(record_id="task-1", payload={"title": "Follow up"}, source="tasks")
        data_buckets = {"tasks": {"task-1": record}}
        data_service = DataService(buckets=data_buckets)
        data_buckets["tasks"]["task-1"] = DataRecord(record_id="task-1", payload={"title": "Mutated"}, source="tasks")
        self.assertEqual(data_service.get("tasks", "task-1").payload["title"], "Follow up")

        entry = MemoryEntry(key="briefing_time", value="08:00", source="user")
        memory_buckets = {"core_preference": {"briefing_time": entry}}
        memory_service = MemoryService(buckets=memory_buckets)
        memory_buckets["core_preference"]["briefing_time"] = MemoryEntry(key="briefing_time", value="09:00", source="user")
        self.assertEqual(memory_service.get("core_preference", "briefing_time").value, "08:00")

        state = DomainTrustState(domain="tasks", accepted_suggestions=1)
        domains = {"tasks": state}
        trust_service = TrustPolicyService(domains=domains)
        state.accepted_suggestions = 99
        self.assertEqual(trust_service.get_domain("tasks").accepted_suggestions, 1)

        handler = lambda context: None  # type: ignore[return-value]
        dispatcher = ActionDispatcher(handlers={("tasks", "create-task"): handler})
        self.assertTrue(dispatcher.has_handler("tasks", "create-task"))

        provider = lambda context: None  # type: ignore[return-value]
        signals = BriefingSignalRegistry(providers={"tasks": provider})
        self.assertTrue(signals.has_provider("tasks"))

        services = ModuleServiceRegistry(services={"tasks": object()})
        self.assertTrue(services.has("tasks"))

    def test_core_service_constructors_reject_malformed_internal_state(self) -> None:
        with self.assertRaises(ValueError):
            DataService(buckets={"tasks": []})  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            DataService(
                buckets={"tasks": {"task-1": DataRecord(record_id="task-2", payload={"title": "x"}, source="tasks")}}
            )
        with self.assertRaises(ValueError):
            MemoryService(buckets={"unknown": {}})
        with self.assertRaises(ValueError):
            MemoryService(
                buckets={"core_preference": {"briefing_time": MemoryEntry(key="other", value="08:00", source="user")}}
            )
        with self.assertRaises(ValueError):
            TrustPolicyService(domains={"tasks": DomainTrustState(domain="other")})
        with self.assertRaises(ValueError):
            ActionDispatcher(handlers={"bad": lambda context: None})  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            ActionDispatcher(handler_owners={("tasks", "create-task"): "pkg"})
        with self.assertRaises(ValueError):
            BriefingSignalRegistry(providers={"tasks": None})  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            BriefingSignalRegistry(provider_owners={"tasks": "pkg"})
        with self.assertRaises(ValueError):
            ModuleServiceRegistry(services={"tasks": None})  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            ModuleServiceRegistry(service_owners={"tasks": "pkg"})

    def test_trust_service_list_domains_rejects_malformed_internal_state(self) -> None:
        service = TrustPolicyService()
        service.ensure_domain("tasks")
        service.domains["tasks"] = "bad"  # type: ignore[assignment]

        with self.assertRaises(ValueError):
            service.ensure_domain("other")
        with self.assertRaises(ValueError):
            service.get_domain("tasks")
        with self.assertRaises(ValueError):
            service.list_domains()

    def test_registry_and_audit_reads_reject_malformed_internal_state(self) -> None:
        audit = AuditService()
        audit.append(actor="tasks", action_type="create-task", target="task-1")
        audit.records[0] = "bad"  # type: ignore[list-item]
        with self.assertRaises(ValueError):
            audit.append(actor="tasks", action_type="create-task", target="task-2")
        with self.assertRaises(ValueError):
            audit.list_records()
        with self.assertRaises(ValueError):
            audit.reversible_records()

        services = ModuleServiceRegistry(services={"tasks": object()})
        services.service_owners["unknown"] = "pkg"
        with self.assertRaises(ValueError):
            services.register("other", object())
        with self.assertRaises(ValueError):
            services.get("tasks")
        with self.assertRaises(ValueError):
            services.has("tasks")
        with self.assertRaises(ValueError):
            services.owner_for("tasks")
        with self.assertRaises(ValueError):
            services.unregister("tasks")
        with self.assertRaises(ValueError):
            services.list_module_ids()

        signals = BriefingSignalRegistry(providers={"tasks": lambda context: None})  # type: ignore[arg-type]
        signals.provider_owners["unknown"] = "pkg"
        with self.assertRaises(ValueError):
            signals.register_provider("other", lambda context: None)  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            signals.provider_for("tasks")
        with self.assertRaises(ValueError):
            signals.has_provider("tasks")
        with self.assertRaises(ValueError):
            signals.owner_for("tasks")
        with self.assertRaises(ValueError):
            signals.unregister_provider("tasks")
        with self.assertRaises(ValueError):
            signals.list_module_ids()

        dispatcher = ActionDispatcher(handlers={("tasks", "create-task"): lambda context: None})  # type: ignore[arg-type]
        dispatcher.handler_owners[("unknown", "create-task")] = "pkg"
        with self.assertRaises(ValueError):
            dispatcher.register_handler("other", "create-task", lambda context: None)  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            dispatcher.has_handler("tasks", "create-task")
        with self.assertRaises(ValueError):
            dispatcher.owner_for("tasks", "create-task")
        with self.assertRaises(ValueError):
            dispatcher.unregister_handler("tasks", "create-task")
        with self.assertRaises(ValueError):
            dispatcher.unregister_module("tasks")
        with self.assertRaises(ValueError):
            dispatcher.list_action_types("tasks")

        data = DataService(buckets={"tasks": {"task-1": DataRecord(record_id="task-1", payload={"title": "x"}, source="tasks")}})
        data.buckets["tasks"]["task-1"] = "bad"  # type: ignore[index]
        with self.assertRaises(ValueError):
            data.put("tasks", "task-2", {"title": "y"}, "tasks")
        with self.assertRaises(ValueError):
            data.get("tasks", "task-1")
        with self.assertRaises(ValueError):
            data.list("tasks")
        with self.assertRaises(ValueError):
            data.delete("tasks", "task-1")

        memory = MemoryService()
        memory.put("core_preference", "briefing_time", "08:00", "user")
        memory.buckets["core_preference"]["briefing_time"] = "bad"  # type: ignore[index]
        with self.assertRaises(ValueError):
            memory.put("core_preference", "other", "09:00", "user")
        with self.assertRaises(ValueError):
            memory.get("core_preference", "briefing_time")
        with self.assertRaises(ValueError):
            memory.delete("core_preference", "briefing_time")
        with self.assertRaises(ValueError):
            memory.entry_count()
        with self.assertRaises(ValueError):
            memory.entry_count_by_class()

    def test_domain_trust_state_rejects_malformed_fields(self) -> None:
        with self.assertRaises(ValueError):
            DomainTrustState(domain="", posture="advisory")
        with self.assertRaises(ValueError):
            DomainTrustState(domain="tasks", posture="automatic")
        with self.assertRaises(ValueError):
            DomainTrustState(domain="tasks", reversed_actions=-1)


if __name__ == "__main__":
    unittest.main()
