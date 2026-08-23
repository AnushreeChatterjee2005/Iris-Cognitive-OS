from fastapi.testclient import TestClient

import main


def test_lifespan_initializes_queues_and_restores_os_state(monkeypatch, tmp_path):
    restored = []
    monkeypatch.setattr(main.meta_engine, "restore_all", lambda: restored.append(True))
    monkeypatch.setattr(main, "IRIS_TOKEN_PATH", str(tmp_path / "launch-token"))

    with TestClient(main.app) as client:
        assert main.main_loop is not None
        assert main.mic_event_queue is not None
        assert main.log_event_queue is not None
        assert client.get("/api/health").status_code == 200

    assert restored == [True]
    assert main.is_shutting_down is True
    assert main.main_loop is None


def test_protected_routes_require_the_per_launch_token():
    client = TestClient(main.app)
    assert client.post("/memory/search", json={"query": "test", "limit": 1}).status_code == 401
    response = client.post(
        "/memory/search",
        json={"query": "test", "limit": 1},
        headers={"X-IRIS-Token": main.IRIS_LAUNCH_TOKEN},
    )
    assert response.status_code == 200


def test_health_remains_available_for_local_startup_checks():
    client = TestClient(main.app)
    assert client.get("/api/health").status_code == 200


def test_readiness_contract_is_public_but_never_exposes_secrets():
    response = TestClient(main.app).get("/api/readiness")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] in {"ready", "degraded"}
    assert payload["automation_contract"]["browser_control_order"][0] == "playwright_dom"
    assert payload["automation_contract"]["fixed_coordinate_clicks"] is False
    assert "OPENAI_API_KEY" not in response.text
    assert "sk-" not in response.text
