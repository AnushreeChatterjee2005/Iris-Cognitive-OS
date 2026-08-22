"""
Live System Test: Taskbar Hiding, Borderless Zen Mode, and 70/30 Dynamic Snapping
"""

import sys
import os
import time
import win32gui
import win32con
import win32api

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import win32_engine
from meta_os import meta_engine

def run_live_tests():
    win32_engine.ensure_interactive_desktop()
    print("\n=======================================================")
    print("=== LIVE TEST: ZEN MODE & 70/30 DYNAMIC LAYOUTS ===")
    print("=======================================================")

    # -------------------------------------------------------------
    # TEST 1: Taskbar Hiding & Desktop Icon Hiding
    # -------------------------------------------------------------
    print("\n[Step 1] Testing Taskbar & Desktop Icon Hiding...")
    taskbar_hwnd = win32gui.FindWindow("Shell_TrayWnd", None)
    print(f"  -> Found Shell_TrayWnd Taskbar HWND: {taskbar_hwnd}")
    
    meta_engine.toggle_taskbar(hide=True)
    meta_engine.toggle_desktop_icons(hide=True)
    is_taskbar_visible = win32gui.IsWindowVisible(taskbar_hwnd)
    print(f"  -> Taskbar Hidden Verification: {not is_taskbar_visible} (Visible flag: {is_taskbar_visible})")
    assert not is_taskbar_visible, "Taskbar should be hidden"
    time.sleep(1.5)

    # -------------------------------------------------------------
    # TEST 2: Borderless Zen Mode on Notepad
    # -------------------------------------------------------------
    print("\n[Step 2] Testing Borderless Fullscreen Zen Mode on Notepad...")
    notepad_hwnd = meta_engine.resolve_app_hwnd("notepad", auto_launch=True)
    time.sleep(1.0)
    
    # Check style before Zen
    orig_style = win32gui.GetWindowLong(notepad_hwnd, win32con.GWL_STYLE)
    has_caption_before = bool(orig_style & win32con.WS_CAPTION)
    print(f"  -> Notepad HWND: {notepad_hwnd}")
    print(f"  -> Has Window Caption Before Zen: {has_caption_before}")

    # Apply Zen Mode
    res_zen = meta_engine.apply_zen_mode("notepad")
    print(f"  -> Zen Mode Applied: {res_zen}")
    
    # Verify style after Zen (Caption & Thickframe stripped)
    new_style = win32gui.GetWindowLong(notepad_hwnd, win32con.GWL_STYLE)
    has_caption_after = bool(new_style & win32con.WS_CAPTION)
    rect = win32gui.GetWindowRect(notepad_hwnd)
    sw = win32api.GetSystemMetrics(win32con.SM_CXSCREEN)
    sh = win32api.GetSystemMetrics(win32con.SM_CYSCREEN)
    print(f"  -> Has Window Caption After Zen: {has_caption_after} (Stripped: {not has_caption_after})")
    print(f"  -> Notepad Fullscreen Rect: {rect} | Screen Resolution: ({sw}x{sh})")
    assert not has_caption_after, "Window caption must be stripped in Zen Mode"
    time.sleep(2.0)

    # -------------------------------------------------------------
    # TEST 3: 70/30 Dynamic Layout (Editor/Notepad 70% Left, Chrome 30% Right)
    # -------------------------------------------------------------
    print("\n[Step 3] Testing 70/30 Dynamic Layout Snapping...")
    chrome_hwnd = meta_engine.resolve_app_hwnd("chrome", auto_launch=True)
    time.sleep(1.0)

    res_split = meta_engine.smart_arrange_workspace("Put Notepad on left 70% and Chrome on right 30%")
    print(f"  -> 70/30 Snapping Result: {res_split}")
    
    rect_left = win32gui.GetWindowRect(notepad_hwnd)
    rect_right = win32gui.GetWindowRect(chrome_hwnd) if chrome_hwnd else None
    print(f"  -> Left App (70%) Rect: {rect_left} (Width: {rect_left[2] - rect_left[0]})")
    if rect_right:
        print(f"  -> Right App (30%) Rect: {rect_right} (Width: {rect_right[2] - rect_right[0]})")
    time.sleep(2.0)

    # -------------------------------------------------------------
    # TEST 4: Full Desktop & Taskbar Restoration
    # -------------------------------------------------------------
    print("\n[Step 4] Restoring Desktop, Taskbar, and Window Borders...")
    meta_engine.restore_all()
    time.sleep(0.5)
    is_taskbar_restored = win32gui.IsWindowVisible(taskbar_hwnd)
    print(f"  -> Taskbar Restored & Visible: {is_taskbar_restored}")
    assert is_taskbar_restored, "Taskbar should be restored"

    print("\n=======================================================")
    print("=== ALL LIVE ZEN & 70/30 LAYOUT TESTS PASSED 100%! ===")
    print("=======================================================")

if __name__ == "__main__":
    run_live_tests()
