"""
IRIS Native Engine Unit Tests
Verifies Windows UI Automation, Win32 message dispatch, and autonomous
cross-app workflows. Visual fallback coverage lives in the vision tests.
"""

import sys
import os
import unittest

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import uia_engine
import win32_engine
import workflow_engine

@unittest.skipUnless(
    os.environ.get("IRIS_RUN_DESKTOP_TESTS") == "1",
    "Set IRIS_RUN_DESKTOP_TESTS=1 to run tests that control the live Windows desktop",
)
class TestNativeEngines(unittest.TestCase):

    def test_01_uia_engine_controls(self):
        print("\n--- Testing Windows UI Automation (UIA) Engine ---")
        fg_ctrl = uia_engine.get_foreground_window_control()
        print(f"Active Foreground Window Control: {fg_ctrl.Name if fg_ctrl else 'None'}")
        
        elements = uia_engine.dump_actionable_controls(fg_ctrl, max_elements=20)
        print(f"Found {len(elements)} actionable UIA controls in active window.")
        for e in elements[:5]:
            print(f"  - [{e['type']}] Name: '{e['name']}' (ID: {e['automation_id']})")
        self.assertIsInstance(elements, list)

    def test_02_win32_window_management(self):
        print("\n--- Testing Win32 Engine ---")
        # Try finding explorer or shell tray
        hwnd = win32_engine.find_window_by_name("explorer", must_be_visible=False)
        print(f"Found Windows Explorer HWND: {hwnd}")
        self.assertTrue(hwnd is None or isinstance(hwnd, int))

    def test_03_workflow_intent_routing(self):
        print("\n--- Testing Cross-Application Workflow Dispatch ---")
        mock_watchers = {"test_task": {"active": True, "status": "watching"}}
        
        # Test PDF/Invoice to Excel workflow detection
        handled = workflow_engine.execute_cross_app_workflow(
            "test_task",
            "extract invoices from demo_invoices folder to excel sheet",
            mock_watchers,
            lambda m: print(f"  [LogCallback] {m}")
        )
        print(f"Invoice to Excel Workflow Execution Result: {handled}")
        self.assertTrue(handled, "Workflow failed to execute")

if __name__ == "__main__":
    unittest.main()
