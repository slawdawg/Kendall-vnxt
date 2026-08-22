from supervisor.api import main as main_module
from supervisor.api.schemas import WorkItemApiEnvelope, WorkItemView


def _route(path: str):
    return next(route for route in main_module.app.routes if getattr(route, "path", None) == path)


def test_assignment_and_escalation_routes_use_work_item_envelope() -> None:
    for path in ("/work-items/{work_item_id}/assignment", "/work-items/{work_item_id}/escalation"):
        assert _route(path).response_model is WorkItemApiEnvelope

    assert WorkItemApiEnvelope.model_fields["data"].annotation is WorkItemView


def test_retired_follow_up_candidate_route_is_not_registered() -> None:
    assert all(
        getattr(route, "path", None) != "/work-packets/{packet_id}/learn-follow-up-candidate-work"
        for route in main_module.app.routes
    )
