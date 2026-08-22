"""
Test FastAPI Workspace Endpoints and Natural Language Routing
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_api():
    print("=== Testing FastAPI Workspaces Endpoints ===")

    # 1. GET /api/workspaces
    res = client.get("/api/workspaces")
    print("1. GET /api/workspaces status:", res.status_code)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert len(data["workspaces"]) >= 4
    print(f"   Found {len(data['workspaces'])} workspaces: {[w['name'] for w in data['workspaces']]}")

    # 2. GET /api/workspaces/available-apps
    res = client.get("/api/workspaces/available-apps")
    print("2. GET /api/workspaces/available-apps status:", res.status_code)
    assert res.status_code == 200
    app_data = res.json()["data"]
    print(f"   Running apps: {len(app_data['running'])}, Installed apps: {len(app_data['installed'])}, Monitors: {len(app_data['monitors'])}")

    # 3. GET /api/workspaces/current-layout
    res = client.get("/api/workspaces/current-layout")
    print("3. GET /api/workspaces/current-layout status:", res.status_code)
    assert res.status_code == 200
    captured_ws = res.json()["workspace"]
    print(f"   Captured layout with {len(captured_ws['applications'])} windows.")

    # 4. POST /api/workspaces (Create)
    new_ws = {
        "name": "Design & Prototyping",
        "description": "Figma + Chrome + Notion",
        "icon": "Sparkles",
        "color": "#A855F7",
        "startupEnabled": False,
        "applications": [
            {"id": "app-1", "name": "Google Chrome", "appIdentifier": "chrome", "monitor": 0, "x": 0, "y": 0, "width": 0.5, "height": 1},
            {"id": "app-2", "name": "Notepad", "appIdentifier": "notepad", "monitor": 0, "x": 0.5, "y": 0, "width": 0.5, "height": 1}
        ]
    }
    res = client.post("/api/workspaces", json=new_ws)
    print("4. POST /api/workspaces status:", res.status_code)
    assert res.status_code == 200
    created = res.json()["workspace"]
    print(f"   Created workspace: {created['id']} ({created['name']})")

    # 5. PUT /api/workspaces/{id} (Update)
    updated_payload = dict(created)
    updated_payload["description"] = "Updated design workflow"
    res = client.put(f"/api/workspaces/{created['id']}", json=updated_payload)
    print("5. PUT /api/workspaces/{id} status:", res.status_code)
    assert res.status_code == 200

    # 6. POST /api/workspaces/{id}/startup
    res = client.post(f"/api/workspaces/{created['id']}/startup", json={"enabled": True})
    print("6. POST /api/workspaces/{id}/startup status:", res.status_code)
    assert res.status_code == 200

    # 7. GET /api/workspaces/startup
    res = client.get("/api/workspaces/startup")
    print("7. GET /api/workspaces/startup status:", res.status_code)
    assert res.status_code == 200
    assert res.json()["workspace"]["id"] == created["id"]

    # 8. POST /api/chat with Workspace NL Command
    res = client.post("/api/chat", json={"text": "What workspaces do I have?"})
    print("8. POST /api/chat ('What workspaces do I have?'):", res.json().get("response"))
    assert "workspaces" in res.json().get("response", "").lower()

    # 9. POST /api/meta-os with Workspace command
    res = client.post("/api/meta-os", json={"command": "Make Coding open automatically when I start my laptop"})
    print("9. POST /api/meta-os response:", res.json().get("message"))
    assert res.json().get("status") == "success"

    # 10. DELETE /api/workspaces/{id}
    res = client.delete(f"/api/workspaces/{created['id']}")
    print("10. DELETE /api/workspaces/{id} status:", res.status_code)
    assert res.status_code == 200

    print("\n=== ALL FASTAPI WORKSPACES ENDPOINTS & INTENTS PASSED (100% OK) ===")

if __name__ == "__main__":
    test_api()
