"""
IRIS Core: UIA Ghost Hook Engine
Autonomous OS accessibility controller powered by UIAutomation, OpenAI vision, and Win32.
"""

import json
import time
import win32gui
import win32con
import win32api
import uia_engine
import win32_engine
from task_state import TaskState, transition_task_record

def log_msg(task_id: str, msg: str):
    import watcher
    watcher.log_to_file(msg)

def get_target_app_name(condition: str, task_id: str) -> str:
    # 1. Fast local keyword matching (<0.1ms)
    cond_lower = condition.lower()
    app_map = {
        "notepad": "Notepad",
        "excel": "Excel",
        "sheet": "Excel",
        "spreadsheet": "Excel",
        "chrome": "Chrome",
        "browser": "Chrome",
        "spotify": "Spotify",
        "slack": "Slack",
        "discord": "Discord",
        "vscode": "Code",
        "vs code": "Code",
        "code": "Code",
        "terminal": "cmd",
        "cmd": "cmd",
        "calculator": "Calculator",
        "word": "Word",
        "explorer": "explorer"
    }
    for k, v in app_map.items():
        if k in cond_lower:
            return v

    # 2. OpenAI text classification fallback
    try:
        import watcher
        prompt = f"""You are a Semantic OS Ghost Agent.
User command: "{condition}"
What is the target application name? Output ONLY a JSON object:
{{"target_app_name": "name of the app (e.g. Chrome, Notepad, Spotify). Use null if none."}}
"""
        resp = watcher.call_llm_with_retry('openai', [prompt], task_id)
        cleaned = resp.text.strip().replace("```json", "").replace("```", "").strip()
        return json.loads(cleaned).get("target_app_name")
    except Exception:
        return None

def run_ghost_agent(task_id: str, condition: str, active_watchers: dict):
    import watcher
    log_msg(task_id, f"[{task_id}] Entering UIA Ghost Hook Engine for: '{condition}'")
    
    target_app = get_target_app_name(condition, task_id)
    target_hwnd = None
    window = None

    if target_app:
        log_msg(task_id, f"[{task_id}] Target App identified: {target_app}")
        if task_id in active_watchers:
            active_watchers[task_id]["thought"] = f"Hooking into {target_app} via OS Accessibility Tree..."
            active_watchers[task_id]["current_action"] = f"Focusing {target_app}"

        target_hwnd = win32_engine.launch_or_focus_app(target_app)
        window = uia_engine.get_window_control_by_name(target_app)
    
    if not window:
        window = uia_engine.get_foreground_window_control()
        if not target_hwnd:
            target_hwnd = win32gui.GetForegroundWindow()

    log_msg(task_id, f"[{task_id}] Bound to Window: {window.Name if window else target_hwnd}")

    # Inspect Elements
    elements = uia_engine.dump_actionable_controls(window) if window else []
    log_msg(task_id, f"[{task_id}] Dumped {len(elements)} actionable UIA controls.")

    # 1. Check for text injection intent
    cond_lower = condition.lower()
    text_to_type = None
    for prefix in ["type", "write", "enter", "set text", "send", "insert"]:
        if prefix in cond_lower:
            parts = condition.split(prefix, 1)
            if len(parts) > 1:
                raw = parts[1].strip()
                if target_app and target_app.lower() in raw.lower():
                    raw = raw.replace(f"in {target_app.lower()}", "").replace(f"into {target_app.lower()}", "").strip()
                text_to_type = raw.strip('"').strip("'")
                break

    if text_to_type and elements:
        # Find first editable control
        edit_elem = next((e for e in elements if e["type"] in ["Edit", "Document"]), None)
        if edit_elem:
            log_msg(task_id, f"[{task_id}] Setting value '{text_to_type}' on '{edit_elem['name']}'...")
            success = uia_engine.set_control_value(edit_elem["control"], text_to_type)
            if success:
                if task_id in active_watchers:
                    active_watchers[task_id]["thought"] = f"Injected text into {edit_elem['name']} natively!"
                    transition_task_record(active_watchers[task_id], TaskState.SUCCESS, current_step="Text injected")
                return True

    # 2. Check for button click / invocation intent
    if any(k in cond_lower for k in ["click", "press", "submit", "hit", "select", "invoke"]):
        target_name = cond_lower
        for prefix in ["click on", "click the", "click", "press the", "press", "submit"]:
            if prefix in target_name:
                target_name = target_name.split(prefix, 1)[1].strip()
                break
        target_name = target_name.replace("button", "").replace("icon", "").strip()

        matched = uia_engine.find_control_by_intent(window, target_name)
        if matched:
            log_msg(task_id, f"[{task_id}] Invoking UIA control '{matched['name']}' ({matched['type']})...")
            success = uia_engine.invoke_control(matched["control"])
            if success:
                if task_id in active_watchers:
                    active_watchers[task_id]["thought"] = f"Invoked {matched['name']} via UIA Pattern!"
                    transition_task_record(active_watchers[task_id], TaskState.SUCCESS, current_step="Control invoked")
                return True

    # 3. OpenAI vision fallback after accessibility targeting fails.
    log_msg(task_id, f"[{task_id}] UIA patterns inconclusive. Checking OpenAI visual grounding...")
    try:
        import pyautogui
        from vision_grounding import detect_element_with_vlm_vision
        grounded = detect_element_with_vlm_vision(condition)
    except Exception as exc:
        log_msg(task_id, f"[{task_id}] OpenAI visual grounding failed: {exc}")
        grounded = None
    if grounded and isinstance(grounded.get("center_x"), int) and isinstance(grounded.get("center_y"), int):
        pyautogui.click(grounded["center_x"], grounded["center_y"])
        if task_id in active_watchers:
            transition_task_record(active_watchers[task_id], TaskState.SUCCESS, current_step="Visually grounded control clicked")
        return True

    return False
