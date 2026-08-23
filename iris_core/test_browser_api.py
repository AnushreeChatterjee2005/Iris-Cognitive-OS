from fastapi.testclient import TestClient

import main


AUTH = {"X-IRIS-Token": main.IRIS_LAUNCH_TOKEN}
client = TestClient(main.app, headers=AUTH)


class FakeTask:
    def to_dict(self):
        return {"task_id": "browser_test", "state": "queued", "objective": "Find docs"}


def test_browser_task_contract_requires_explicit_success_criteria():
    response = client.post("/api/browser/tasks", json={"objective": "Find docs"})
    assert response.status_code == 422


def test_browser_task_contract_rejects_non_http_navigation():
    response = client.post("/api/browser/tasks", json={
        "objective": "Open local file",
        "initial_url": "file:///C:/secret.txt",
        "expected_text": "secret",
    })
    assert response.status_code == 422


def test_browser_task_creation_returns_truthful_queued_contract(monkeypatch):
    captured = {}

    def fake_start_task(**kwargs):
        captured.update(kwargs)
        return FakeTask()

    monkeypatch.setattr(main.browser_task_manager, "start_task", fake_start_task)
    response = client.post("/api/browser/tasks", json={
        "objective": "Find official docs",
        "initial_url": "https://example.test",
        "expected_text": "Documentation",
        "max_steps": 10,
    })

    assert response.status_code == 202
    assert response.json()["task"]["state"] == "queued"
    assert captured["config"].max_steps == 10


def test_browser_task_routes_require_authentication():
    unauthenticated = TestClient(main.app)
    response = unauthenticated.post("/api/browser/tasks", json={
        "objective": "Find docs",
        "expected_text": "Documentation",
    })
    assert response.status_code == 401
