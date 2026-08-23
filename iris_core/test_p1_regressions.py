from fastapi.testclient import TestClient

import main
import vision_grounding
import workflow_engine


client = TestClient(main.app, headers={"X-IRIS-Token": main.IRIS_LAUNCH_TOKEN})


def test_memory_compatibility_routes_rank_matching_session():
    record = {
        "id": "session-p1",
        "name": "YouTube Music research",
        "urls": ["https://music.youtube.com"],
        "files": [],
    }
    assert client.post("/memory/embed", json=record).status_code == 200
    response = client.post("/memory/search", json={"query": "youtube music", "limit": 5})
    assert response.status_code == 200
    assert response.json()[0]["id"] == "session-p1"


def test_status_route_preserves_terminal_failure_details():
    main.watcher.active_watchers["failed-p1"] = {
        "active": False,
        "state": "failed",
        "thought": "Playback could not be verified.",
        "current_step": "Task stopped.",
        "error_details": "Playback could not be verified.",
    }
    response = client.get("/api/status/failed-p1")
    assert response.status_code == 200
    assert response.json()["state"] == "failed"
    assert response.json()["thought"] == "Playback could not be verified."


def test_ai_command_compatibility_route_starts_watcher(monkeypatch):
    started = {}

    def fake_start_watcher(**kwargs):
        started.update(kwargs)

    monkeypatch.setattr(main.watcher, "start_watcher", fake_start_watcher)
    response = client.post("/api/ai/command", json={"command": "open notepad"})
    assert response.status_code == 200
    assert started["condition"] == "open notepad"


def test_timeline_chat_has_local_fallback_without_api_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    response = client.post("/api/timeline/chat", json={
        "query": "youtube session",
        "sessions": [{"id": "s1", "name": "YouTube session", "urls": [], "files": [], "dominantApps": ["Chrome"]}],
    })
    assert response.status_code == 200
    assert response.json()["matchedSessionId"] == "s1"


class _FakePyAutoGUI:
    def moveTo(self, *_args, **_kwargs):
        return None

    def click(self, *_args, **_kwargs):
        return None


class _FakeBrowserAdapter:
    def capture(self):
        return type("Observation", (), {"fingerprint": "unchanged"})()

    def act_dom(self, *_args, **_kwargs):
        return type("Result", (), {"success": False})()

    def close(self):
        return None

def _run_media_workflow(monkeypatch, verified: bool):
    monkeypatch.setattr(workflow_engine, "pyautogui", _FakePyAutoGUI())
    monkeypatch.setattr(workflow_engine, "browser_adapter_factory", _FakeBrowserAdapter)
    monkeypatch.setattr(workflow_engine.time, "sleep", lambda _seconds: None)
    monkeypatch.setattr(workflow_engine.uia_engine, "get_foreground_window_control", lambda: None)
    monkeypatch.setattr(workflow_engine, "decompose_command_with_llm", lambda _command: [{
        "step": 1,
        "action": "click",
        "target": "first song track",
        "description": "Start playback",
    }])
    monkeypatch.setattr(vision_grounding, "detect_element_with_vlm_vision", lambda _description: {
        "source": "OpenAI_VLM_Vision",
        "center_x": 500,
        "center_y": 400,
    })
    monkeypatch.setattr(vision_grounding, "verify_screen_state_with_vlm", lambda _description: {
        "verified": verified,
        "confidence": 0.95 if verified else 0.1,
        "evidence": "test verdict",
    })
    watchers = {"media-p1": {"task_id": "media-p1", "condition": "play a song", "active": True}}
    result = workflow_engine.execute_cross_app_workflow(
        "media-p1",
        "play a song on YouTube Music",
        watchers,
    )
    return result, watchers["media-p1"]


def test_media_workflow_succeeds_only_after_vision_verification(monkeypatch):
    result, state = _run_media_workflow(monkeypatch, verified=True)
    assert result is True
    assert state["state"] == "success"


def test_media_workflow_reports_error_when_vision_cannot_verify(monkeypatch):
    result, state = _run_media_workflow(monkeypatch, verified=False)
    assert result is False
    assert state["state"] == "failed"
    assert "Could not locate or verify" in state["thought"]
