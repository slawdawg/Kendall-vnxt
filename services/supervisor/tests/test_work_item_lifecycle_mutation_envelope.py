from supervisor.api import main as main_module
from supervisor.api.schemas import WorkItemApiEnvelope, WorkItemView


def _route(path: str):
    return next(route for route in main_module.app.routes if getattr(route, "path", None) == path)


def test_retry_and_action_routes_use_work_item_envelope() -> None:
    for path in ("/work-items/{work_item_id}/retry", "/work-items/{work_item_id}/actions"):
        route = _route(path)
        assert route.response_model is WorkItemApiEnvelope

    assert WorkItemApiEnvelope.model_fields["data"].annotation is WorkItemView
    assert WorkItemApiEnvelope.model_config["extra"] == "forbid"
