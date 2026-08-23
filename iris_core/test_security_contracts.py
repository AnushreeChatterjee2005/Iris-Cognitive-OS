from fastapi.testclient import TestClient

import main


AUTH = {"X-IRIS-Token": main.IRIS_LAUNCH_TOKEN}


def test_invalid_token_is_rejected_without_internal_details():
    response = TestClient(main.app).get("/api/pipelines", headers={"X-IRIS-Token": "wrong"})
    assert response.status_code == 401
    assert response.json() == {"status": "error", "message": "Authentication required."}


def test_untrusted_browser_origin_is_rejected_even_with_valid_token():
    response = TestClient(main.app).get(
        "/api/pipelines",
        headers={**AUTH, "Origin": "https://attacker.example"},
    )
    assert response.status_code == 403


def test_backend_rejects_oversized_request_body():
    response = TestClient(main.app).post(
        "/api/ai/command",
        content=b"x" * (main.MAX_REQUEST_BODY_BYTES + 1),
        headers={**AUTH, "Content-Type": "application/json"},
    )
    assert response.status_code == 413


def test_backend_rejects_non_json_mutating_payload():
    response = TestClient(main.app).post(
        "/api/ai/command",
        content=b"command=open+notepad",
        headers={**AUTH, "Content-Type": "application/x-www-form-urlencoded"},
    )
    assert response.status_code == 415


def test_sensitive_command_requires_confirmation(monkeypatch):
    started = []
    monkeypatch.setattr(main.watcher, "start_watcher", lambda **kwargs: started.append(kwargs))
    client = TestClient(main.app, headers=AUTH)

    blocked = client.post("/api/ai/command", json={"command": "delete my account"})
    assert blocked.status_code == 428
    assert started == []

    approved = client.post("/api/ai/command", json={
        "command": "delete my account",
        "confirmed_sensitive": True,
    })
    assert approved.status_code == 200
    assert len(started) == 1


def test_chat_cannot_bypass_sensitive_action_confirmation(monkeypatch):
    started = []
    monkeypatch.setattr(main.watcher, "start_watcher", lambda **kwargs: started.append(kwargs))
    client = TestClient(main.app, headers=AUTH)

    blocked = client.post("/api/chat", json={"text": "delete my account"})
    assert blocked.status_code == 428
    assert started == []

    approved = client.post("/api/chat", json={
        "text": "delete my account",
        "confirmed_sensitive": True,
    })
    assert approved.status_code == 200
    assert len(started) == 1


def test_mutating_route_rate_limit(monkeypatch):
    monkeypatch.setattr(main, "RATE_LIMIT_REQUESTS", 2)
    main._request_times.clear()
    client = TestClient(main.app, headers=AUTH)

    assert client.post("/memory/search", json={"query": "one", "limit": 1}).status_code == 200
    assert client.post("/memory/search", json={"query": "two", "limit": 1}).status_code == 200
    assert client.post("/memory/search", json={"query": "three", "limit": 1}).status_code == 429
    main._request_times.clear()
