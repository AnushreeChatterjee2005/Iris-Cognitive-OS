"""
Test Suite for Meta-OS Intelligent Workspace Manager
Tests 2-way split, 3-way split, ratio parsing, app resolution, and LLM spatial orchestration.
"""

import sys
import os
import time

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from meta_os import meta_engine

def test_workspace_manager():
    print("\n=== Testing Intelligent Meta-OS Workspace Manager ===")

    # 1. Test 2-App Split Screen (Notepad & Chrome in 60/40 split)
    print("\n1. Testing 2-App 60/40 Split: 'Put Notepad and Chrome in 60/40 split screen'...")
    res1 = meta_engine.smart_arrange_workspace("Put Notepad and Chrome in 60/40 split screen")
    print("Result 1:", res1)
    assert res1["status"] == "success"
    time.sleep(1.0)

    # 2. Test 3-App Split Screen (Notepad, Chrome, and Excel)
    print("\n2. Testing 3-App 3-way Split: 'Split screen between Notepad, Chrome, and Excel'...")
    res2 = meta_engine.smart_arrange_workspace("Split screen between Notepad, Chrome, and Excel")
    print("Result 2:", res2)
    assert res2["status"] == "success"
    time.sleep(1.0)

    # 3. Test 3-Column Layout: 'Arrange Notepad, Chrome, and Excel in three vertical columns'
    print("\n3. Testing 3-Column Layout: 'Arrange Notepad, Chrome, and Excel in three vertical columns'...")
    res3 = meta_engine.smart_arrange_workspace("Arrange Notepad, Chrome, and Excel in three vertical columns")
    print("Result 3:", res3)
    assert res3["status"] == "success"
    time.sleep(1.0)

    # 4. Test Zen Mode
    print("\n4. Testing Zen Fullscreen Mode: 'Activate Zen mode on Notepad'...")
    res4 = meta_engine.smart_arrange_workspace("Activate Zen mode on Notepad")
    print("Result 4:", res4)
    assert res4["status"] == "success"
    time.sleep(1.0)

    # 5. Test Restore Desktop
    print("\n5. Testing Desktop Restoration: 'Restore all windows to normal'...")
    res5 = meta_engine.smart_arrange_workspace("Restore all windows to normal")
    print("Result 5:", res5)
    assert res5["status"] == "success"

    print("\n=== ALL WORKSPACE MANAGER LAYOUT TESTS PASSED (OK)! ===")

if __name__ == "__main__":
    test_workspace_manager()
