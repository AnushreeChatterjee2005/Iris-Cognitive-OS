"""
IRIS Core: UIA Ghost Hook Engine
Autonomous OS Accessibility controller powered by UIAutomation, Flash OCR, and Win32.
"""

import json
import time
import win32gui
import win32con
import win32api
import uia_engine
import ocr_engine
import win32_engine

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

    # 2. Text LLM Fallback (Zero vision tokens)
    try:
        import watcher
        prompt = f"""You are a Semantic OS Ghost Agent.
User command: "{condition}"
What is the target application name? Output ONLY a JSON object:
{{"target_app_name": "name of the app (e.g. Chrome, Notepad, Spotify). Use null if none."}}
"""
        resp = watcher.call_llm_with_retry('llama-3.3-70b-versatile', [prompt], task_id)
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
                    active_watchers[task_id]["status"] = "Success"
                    active_watchers[task_id]["active"] = False
                    active_watchers[task_id]["thought"] = f"Injected text into {edit_elem['name']} natively!"
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
                    active_watchers[task_id]["status"] = "Success"
                    active_watchers[task_id]["active"] = False
                    active_watchers[task_id]["thought"] = f"Invoked {matched['name']} via UIA Pattern!"
                return True

    # 3. Flash OCR Spatial Fallback
    log_msg(task_id, f"[{task_id}] UIA patterns inconclusive. Checking Flash OCR spatial coordinates...")
    ocr_res = ocr_engine.find_text_coordinates(condition, hwnd=target_hwnd or 0)
    if ocr_res:
        import pyautogui
        log_msg(task_id, f"[{task_id}] OCR snapped coordinate to ({ocr_res['cx']}, {ocr_res['cy']}). Executing click...")
        pyautogui.click(ocr_res["cx"], ocr_res["cy"])
        if task_id in active_watchers:
            active_watchers[task_id]["status"] = "Success"
            active_watchers[task_id]["active"] = False
        return True

    return False
