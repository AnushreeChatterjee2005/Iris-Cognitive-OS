"""
Test FastAPI Parallel Desktop Endpoints and Natural Language Routing
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_parallel_desktop_api():
    print("=== Testing FastAPI Parallel Desktop Endpoints ===")

    # 1. GET /api/parallel-desktop/status
    res = client.get("/api/parallel-desktop/status")
    print("1. GET /api/parallel-desktop/status:", res.status_code)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert "metrics" in data
    assert data["metrics"]["desktop_name"] == "IRIS_ParallelDesktop"
    print(f"   Desktop metrics: CPU={data['metrics']['cpu_percent']}%, RAM={data['metrics']['parallel_memory_mb']}MB")

    # 2. GET /api/parallel-desktop/environments
    res = client.get("/api/parallel-desktop/environments")
    print("2. GET /api/parallel-desktop/environments:", res.status_code)
    assert res.status_code == 200
    envs = res.json()["environments"]
    assert len(envs) >= 3
    print(f"   Found {len(envs)} predefined environments: {[e['name'] for e in envs]}")

    # 3. Natural Language Background Intent Detection in /api/chat
    bg_command = "Research top laptops under 80000 in background"
    res = client.post("/api/chat", json={"text": bg_command})
    print("3. POST /api/chat with 'in background':", res.status_code)
    assert res.status_code == 200
    chat_resp = res.json()["response"]
    assert "Parallel Desktop" in chat_resp
    print(f"   Chat response: '{chat_resp}'")

    # 4. GET /api/parallel-desktop/tasks (verify task was recorded)
    res = client.get("/api/parallel-desktop/tasks")
    assert res.status_code == 200
    tasks = res.json()["tasks"]
    assert len(tasks) > 0
    active_task = tasks[0]
    task_id = active_task["task_id"]
    print(f"   Active task spawned: {task_id} (Status: {active_task['status']})")

    # 5. POST /api/parallel-desktop/tasks/{id}/mode (switch to observe)
    res = client.post(f"/api/parallel-desktop/tasks/{task_id}/mode", json={"mode": "observe"})
    assert res.status_code == 200
    print(f"   Switched mode to observe: {res.json()['status']}")

    # 6. POST /api/parallel-desktop/tasks/{id}/pause and resume
    res_pause = client.post(f"/api/parallel-desktop/tasks/{task_id}/pause")
    assert res_pause.status_code == 200
    print(f"   Paused task: {res_pause.json()['status']}")

    res_resume = client.post(f"/api/parallel-desktop/tasks/{task_id}/resume")
    assert res_resume.status_code == 200
    print(f"   Resumed task: {res_resume.json()['status']}")

    # 7. POST /api/parallel-desktop/tasks/{id}/takeover
    res_to = client.post(f"/api/parallel-desktop/tasks/{task_id}/takeover", json={"active": True})
    assert res_to.status_code == 200
    assert res_to.json()["takeover_active"] is True
    print(f"   Take over enabled: {res_to.json()['takeover_active']}")

    # 8. POST /api/parallel-desktop/input
    res_inp = client.post("/api/parallel-desktop/input", json={"action": "click", "x": 500, "y": 300})
    print(f"   Injected click input: {res_inp.status_code}")

    # 9. Release Takeover
    res_rel = client.post(f"/api/parallel-desktop/tasks/{task_id}/takeover", json={"active": False})
    assert res_rel.status_code == 200

    # 10. GET /api/parallel-desktop/frame
    res_frame = client.get(f"/api/parallel-desktop/frame/{task_id}")
    assert res_frame.status_code == 200
    assert res_frame.headers["content-type"] == "image/jpeg"
    print(f"   Frame snapshot generated: {len(res_frame.content)} bytes JPEG")

    # 11. POST /api/parallel-desktop/tasks/{id}/bring-to-desktop
    res_bring = client.post(f"/api/parallel-desktop/tasks/{task_id}/bring-to-desktop", json={"type": "all"})
    assert res_bring.status_code == 200
    print(f"   Bring to desktop result: {res_bring.json()['message']}")

    # 12. Non-background command in /api/chat should NOT trigger Parallel Desktop
    normal_cmd = "what is the capital of France"
    res_normal = client.post("/api/chat", json={"text": normal_cmd})
    assert res_normal.status_code == 200
    assert "Parallel Desktop" not in res_normal.json()["response"]
    print(f"   Normal conversational prompt response: '{res_normal.json()['response'][:40]}...'")

    print("\n=== ALL PARALLEL DESKTOP TESTS PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    test_parallel_desktop_api()
