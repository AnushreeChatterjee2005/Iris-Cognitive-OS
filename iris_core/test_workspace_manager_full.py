"""
Full test suite for IRIS Workspace Manager
Tests CRUD, duplication, startup toggling, application discovery, current layout capture,
and natural language command parsing.
"""

import os
import sys
import time

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from workspace_manager import workspace_engine

def run_tests():
    print("=== Testing IRIS Workspace Manager Engine ===")

    # 1. Test Listing Seed Workspaces
    print("\n1. Listing Workspaces...")
    workspaces = workspace_engine.list_workspaces()
    print(f"Total Workspaces: {len(workspaces)}")
    for ws in workspaces:
        print(f" - [{ws['id']}] {ws['name']} ({len(ws['applications'])} apps) | Startup: {ws['startupEnabled']}")
    assert len(workspaces) >= 4, "Default workspaces should be seeded!"

    # 2. Test Get Workspace
    print("\n2. Getting Workspace 'Coding'...")
    coding_ws = workspace_engine.get_workspace("ws-coding-default")
    assert coding_ws is not None
    assert coding_ws["name"] == "Coding"
    print(f"Found: {coding_ws['name']} with apps: {[a['name'] for a in coding_ws['applications']]}")

    # 3. Test Create Workspace
    print("\n3. Creating Custom Workspace 'Gaming'...")
    gaming_data = {
        "name": "Gaming",
        "description": "Discord + Spotify + Chrome",
        "icon": "Gamepad2",
        "color": "#EC4899",
        "startupEnabled": False,
        "layoutPreset": "split_3_columns",
        "applications": [
            {"name": "Discord", "appIdentifier": "discord", "x": 0.0, "y": 0.0, "width": 0.33, "height": 1.0},
            {"name": "Spotify", "appIdentifier": "spotify", "x": 0.33, "y": 0.0, "width": 0.33, "height": 1.0},
            {"name": "Google Chrome", "appIdentifier": "chrome", "x": 0.66, "y": 0.0, "width": 0.34, "height": 1.0}
        ]
    }
    created = workspace_engine.create_workspace(gaming_data)
    print(f"Created: {created['id']} -> {created['name']}")
    assert created["name"] == "Gaming"

    # 4. Test Duplicate Workspace
    print("\n4. Duplicating Workspace...")
    dup = workspace_engine.duplicate_workspace(created["id"], "Gaming Turbo")
    print(f"Duplicated: {dup['id']} -> {dup['name']}")
    assert dup["name"] == "Gaming Turbo"
    assert len(dup["applications"]) == 3

    # 5. Test Startup Toggle
    print("\n5. Testing Startup Workspace Setting...")
    workspace_engine.set_startup_workspace(coding_ws["id"], True)
    startup_ws = workspace_engine.get_startup_workspace()
    assert startup_ws is not None
    assert startup_ws["id"] == coding_ws["id"]
    print(f"Startup Workspace is now: {startup_ws['name']}")

    # 6. Test Application Discovery
    print("\n6. Testing Application Discovery Layer...")
    apps_info = workspace_engine.get_available_applications()
    print(f"Discovered {len(apps_info['running'])} running windows and {len(apps_info['installed'])} installed apps.")
    print("Sample running:", [a['name'] for a in apps_info['running'][:5]])
    print("Sample installed:", [a['name'] for a in apps_info['installed'][:5]])
    print("Monitors:", len(apps_info['monitors']))
    assert len(apps_info['monitors']) >= 1

    # 7. Test Capture Current Desktop Layout
    print("\n7. Testing Capture Current Desktop Layout...")
    captured = workspace_engine.capture_current_layout("My Live Desktop")
    print(f"Captured layout with {len(captured['applications'])} windows:")
    for a in captured['applications']:
        print(f"  - {a['name']} @ (x={a['x']}, y={a['y']}, w={a['width']}, h={a['height']})")

    # 8. Test Natural Language Command Parsing
    print("\n8. Testing Natural Language Agent Commands...")
    nl_1 = workspace_engine.execute_nl_command("What workspaces do I have?")
    print("NL 1 Response:", nl_1["message"])
    assert nl_1["status"] == "success"

    nl_2 = workspace_engine.execute_nl_command("Make Coding open automatically when I start my laptop")
    print("NL 2 Response:", nl_2["message"])
    assert nl_2["status"] == "success"

    nl_3 = workspace_engine.execute_nl_command("Delete workspace Gaming Turbo")
    print("NL 3 Response:", nl_3["message"])
    assert nl_3["status"] == "success"

    # Cleanup test created workspace
    workspace_engine.delete_workspace(created["id"])

    print("\n=== ALL WORKSPACE MANAGER ENGINE TESTS PASSED (100% OK) ===")

if __name__ == "__main__":
    run_tests()
