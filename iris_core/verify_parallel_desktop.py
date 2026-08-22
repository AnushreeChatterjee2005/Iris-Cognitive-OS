"""
IRIS Parallel Desktop — Direct End-to-End Verification Script
Tests background intent routing, parallel desktop task execution,
frame generation, and Bring to Desktop file transfers.
"""

import os
import sys
import time
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from main import is_background_task, strip_background_clause
from parallel_desktop_engine import parallel_engine, PREDEFINED_ENVIRONMENTS

def verify():
    print("================================================================")
    print("   IRIS PARALLEL DESKTOP: END-TO-END VERIFICATION TEST")
    print("================================================================")

    # 1. Test Natural Language Trigger Detection
    print("\n--- 1. Natural Language Background Trigger Detection ---")
    bg_prompts = [
        "Research the best laptops under 80000 in background",
        "Open project and inspect files while I work",
        "Download these PDFs and summarize them in the background",
        "Do this in parallel desktop",
        "Open my Coding workspace in background"
    ]
    for p in bg_prompts:
        is_bg = is_background_task(p)
        clean = strip_background_clause(p)
        print(f"  [OK] Prompt: \"{p}\" -> Background: {is_bg} | Clean Objective: \"{clean}\"")
        assert is_bg, f"Failed to detect background trigger in '{p}'"

    normal_prompts = [
        "Open Visual Studio Code",
        "What is the weather today?",
        "Tile my windows 70/30",
        "Hello IRIS"
    ]
    for p in normal_prompts:
        is_bg = is_background_task(p)
        print(f"  [OK] Foreground Prompt: \"{p}\" -> Background: {is_bg}")
        assert not is_bg, f"False positive background trigger for '{p}'"

    # 2. Test Parallel Desktop Environments
    print("\n--- 2. Persistent Environments Registry ---")
    print(f"  [OK] Found {len(PREDEFINED_ENVIRONMENTS)} environments: {[e.name for e in PREDEFINED_ENVIRONMENTS]}")
    assert len(PREDEFINED_ENVIRONMENTS) >= 3

    # 3. Test Live Parallel Desktop Execution
    print("\n--- 3. Autonomous Parallel Task Execution ---")
    test_query = "Research the best laptops under 80,000 and prepare a comparison in background"
    clean_goal = strip_background_clause(test_query)
    
    print(f"  Launching autonomous task: \"{clean_goal}\"")
    task = parallel_engine.start_task(clean_goal, mode="autonomous")
    print(f"  Task created with ID: {task.task_id} (Status: {task.status})")

    # Wait for task to execute through steps
    max_wait = 15
    start_t = time.time()
    while task.status in ["queued", "running"] and (time.time() - start_t < max_wait):
        time.sleep(0.5)
        print(f"    -> Progress: {task.progress}% | Step: {task.current_step} | Status: {task.status}")

    print(f"\n  Final Task Status: {task.status} (Progress: {task.progress}%)")
    assert task.status == "completed", f"Task did not complete, status is: {task.status}"
    assert task.progress == 100

    # 4. Inspect Timeline & Results
    print("\n--- 4. Task Timeline & Results Inspection ---")
    print(f"  Total Timeline Events: {len(task.timeline)}")
    for ev in task.timeline:
        print(f"    [{ev['time']}] {ev['action']}: {ev['details']}")

    assert len(task.timeline) >= 4, "Expected at least 4 timeline events"
    assert task.results.get("summary"), "Expected non-empty research summary"
    print("\n  Generated Summary Preview:")
    print("  " + "\n  ".join(task.results["summary"].splitlines()[:10]))
    print("  ...")

    # 5. Test Live Preview Frame Generation
    print("\n--- 5. Live Preview Desktop Frame Rendering ---")
    frame_bytes = parallel_engine.get_frame_bytes()
    print(f"  [OK] Successfully rendered virtual desktop frame: {len(frame_bytes)} bytes JPEG")
    assert len(frame_bytes) > 1000

    # 6. Test Bring to Desktop Transfer
    print("\n--- 6. Bring Results to Host Desktop ---")
    transfer_res = parallel_engine.bring_to_desktop(task.task_id, transfer_type="all")
    print(f"  [OK] {transfer_res.get('message')}")
    assert transfer_res.get("status") == "success"
    print(f"  Transferred items: {transfer_res.get('items')}")

    print("\n================================================================")
    print("   ALL TESTS PASSED! PARALLEL DESKTOP IS WORKING PERFECTLY!     ")
    print("================================================================")

if __name__ == "__main__":
    verify()
