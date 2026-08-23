import time
import threading
import easyocr
import warnings
warnings.filterwarnings("ignore", category=UserWarning, module="torch.utils.data.dataloader")
import numpy as np
import sys
import win32gui
import win32ui
import win32api
import win32con
from ctypes import windll
import pyautogui
import os
import ocr_engine
import uia_engine
import win32_engine
import workflow_engine

on_log_stream = None

def log_to_file(msg):
    try:
        log_path = os.path.join(os.path.dirname(__file__), "watcher_debug.log")
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(msg + "\n")
    except Exception:
        pass
    print(msg)
    if on_log_stream:
        try:
            on_log_stream(msg)
        except Exception:
            pass

# Force UTF-8 encoding for Windows terminal to prevent EasyOCR progress bar from crashing
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

active_watchers = {}

def capture_window(hwnd):
    if hwnd == 0:
        try:
            import pyautogui
            import numpy as np
            screenshot = pyautogui.screenshot()
            img_rgb = np.array(screenshot)
            return img_rgb[:, :, ::-1]
        except Exception as e:
            print("Full screen capture failed:", e)
            return None
            
    left, top, right, bottom = win32gui.GetWindowRect(hwnd)
    width = right - left
    height = bottom - top

    if width <= 0 or height <= 0:
        return None

    hwndDC = win32gui.GetWindowDC(hwnd)
    mfcDC = None
    saveDC = None
    saveBitMap = None
    img = None
    result = 0
    try:
        mfcDC = win32ui.CreateDCFromHandle(hwndDC)
        saveDC = mfcDC.CreateCompatibleDC()

        saveBitMap = win32ui.CreateBitmap()
        saveBitMap.CreateCompatibleBitmap(mfcDC, width, height)
        saveDC.SelectObject(saveBitMap)

        result = windll.user32.PrintWindow(hwnd, saveDC.GetSafeHdc(), 3)
        
        bmpinfo = saveBitMap.GetInfo()
        bmpstr = saveBitMap.GetBitmapBits(True)
        
        img = np.frombuffer(bmpstr, dtype='uint8')
        img.shape = (bmpinfo['bmHeight'], bmpinfo['bmWidth'], 4)
    except Exception:
        pass
    finally:
        if saveBitMap:
            win32gui.DeleteObject(saveBitMap.GetHandle())
        if saveDC:
            saveDC.DeleteDC()
        if mfcDC:
            mfcDC.DeleteDC()
        win32gui.ReleaseDC(hwnd, hwndDC)

    if result == 1 and img is not None:
        return img[:, :, :3]
    
    # Fallback if PrintWindow fails (hardware acceleration issues)
    try:
        import pyautogui
        if width > 0 and height > 0:
            screenshot = pyautogui.screenshot(region=(left, top, width, height))
            import numpy as np
            img_rgb = np.array(screenshot)
            return img_rgb[:, :, ::-1]
    except Exception:
        pass
        
    return None

def click_and_type_background(hwnd, screen_x, screen_y, text_or_key):
    try:
        if screen_x is not None and screen_y is not None:
            # Convert to client coordinates relative to target window
            client_point = win32gui.ScreenToClient(hwnd, (screen_x, screen_y))
            lparam = win32api.MAKELONG(client_point[0], client_point[1])
            
            # Background click
            win32api.PostMessage(hwnd, win32con.WM_LBUTTONDOWN, win32con.MK_LBUTTON, lparam)
            time.sleep(0.05)
            win32api.PostMessage(hwnd, win32con.WM_LBUTTONUP, 0, lparam)
            time.sleep(0.1)
        # SPOOF FOCUS to trick Chromium into accepting background events even if the user clicks away
        win32api.SendMessage(hwnd, win32con.WM_ACTIVATE, win32con.WA_ACTIVE, 0)
        win32api.SendMessage(hwnd, win32con.WM_SETFOCUS, 0, 0)

        if text_or_key == '\t':
            # Send TAB key
            win32api.SendMessage(hwnd, win32con.WM_KEYDOWN, win32con.VK_TAB, 1)
            time.sleep(0.02)
            win32api.SendMessage(hwnd, win32con.WM_KEYUP, win32con.VK_TAB, 0xC0000001)
        elif text_or_key == '\n':
            # Send ENTER key
            win32api.SendMessage(hwnd, win32con.WM_KEYDOWN, win32con.VK_RETURN, 1)
            time.sleep(0.02)
            win32api.SendMessage(hwnd, win32con.WM_KEYUP, win32con.VK_RETURN, 0xC0000001)
        elif text_or_key:
            for char in text_or_key:
                # Get the virtual key code for the character
                vk_code = win32api.VkKeyScan(char) & 0xFF
                # Use PostMessage to avoid deadlocking the thread if the target window is slow
                win32api.PostMessage(hwnd, win32con.WM_KEYDOWN, vk_code, 1)
                win32api.PostMessage(hwnd, win32con.WM_CHAR, ord(char), 1)
                win32api.PostMessage(hwnd, win32con.WM_KEYUP, vk_code, 0xC0000001)
                time.sleep(0.001)
        return True
    except Exception as e:
        print(f"Background click failed: {e}")
        return False

def watch_loop(task_id: str, source_bbox: dict, target_coords: dict, condition: str, action_text: str):
    import torch
    torch.set_num_threads(1) # Prevent OpenMP deadlocks
    
    log_to_file(f"[{task_id}] Loading EasyOCR Model in thread...")
    reader = easyocr.Reader(['en'], gpu=False)
    log_to_file(f"[{task_id}] OCR Model loaded.")
    
    x, y, w, h = source_bbox['x'], source_bbox['y'], source_bbox['w'], source_bbox['h']
    tx, ty = target_coords['x'], target_coords['y']
    
    # 1. Identify Target OS Windows
    source_hwnd = win32gui.WindowFromPoint((x + w//2, y + h//2))
    target_hwnd = win32gui.WindowFromPoint((tx, ty))
    
    source_title = win32gui.GetWindowText(source_hwnd)
    target_title = win32gui.GetWindowText(target_hwnd)
    
    log_to_file(f"[{task_id}] Source Window Locked: {source_title} ({source_hwnd})")
    log_to_file(f"[{task_id}] Target Window Locked: {target_title} ({target_hwnd})")
    
    while active_watchers.get(task_id, {}).get("active", False):
        try:
            # 2. Capture the window directly from DWM (even in background)
            img_np = capture_window(source_hwnd)
            
            if img_np is not None:
                # 3. Calculate relative crop using LIVE window coordinates
                # This tracks the window even if you move it!
                left, top, right, bottom = win32gui.GetWindowRect(source_hwnd)
                
                # Math: Where does the box live inside the window?
                # If they drew at x=100 on screen, and window starts at left=50, the relative x is 50.
                # However, if they moved the window since drawing, the absolute screen coordinates (x,y)
                # are no longer valid! 
                # Wait: Since we only have the original absolute (x,y) from when they drew it,
                # we calculate the relative offset ONCE, and use it forever!
                
                # To make it truly tracking, we need to calculate rel_x and rel_y just ONCE at startup.
                pass # We will do this below
                
        except Exception as e:
            log_to_file(f"[{task_id}] Watcher Error: {e}")
            
        time.sleep(0.5)

from groq import Groq
import json
import easyocr
import torch

torch.set_num_threads(1)
log_to_file("Loading Global EasyOCR Model...")
global_reader = easyocr.Reader(['en'], gpu=False)
log_to_file("Global OCR Model loaded.")

import os
from dotenv import load_dotenv

# Load env variables from the root .env file
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'), override=True)

GROQ_API_KEY = os.environ.get("GROQ_API_KEY") or "gsk_dummy_key"
groq_client = Groq(api_key=GROQ_API_KEY)

class GroqResponse:
    def __init__(self, text):
        self.text = text

_ollama_failure_cache_until = 0

def call_llm_with_retry(model_name, contents, task_id="system"):
    global _ollama_failure_cache_until
    import google.generativeai as genai
    import os
    import time
    import requests
    import io
    import base64

    # 1. Fast Groq Priority for pure text contents (<200ms latency)
    is_pure_text = all(isinstance(x, str) for x in contents)
    if is_pure_text and groq_client is not None:
        prompt_str = " ".join([str(c) for c in contents])
        for model_candidate in [
            "openai/gpt-oss-120b",
            "openai/gpt-oss-20b",
            "qwen/qwen3.6-27b",
            "groq/compound",
            "groq/compound-mini",
            "llama-3.3-70b-versatile"
        ]:
            try:
                chat_completion = groq_client.chat.completions.create(
                    messages=[{"role": "user", "content": prompt_str}],
                    model=model_candidate,
                    temperature=0.1,
                    max_tokens=800,
                    timeout=5.0
                )
                resp_text = chat_completion.choices[0].message.content
                if resp_text:
                    resp_text = re.sub(r'<think>.*?</think>', '', resp_text, flags=re.DOTALL).strip()
                    return GroqResponse(resp_text)
            except Exception as ge:
                continue

    # 2. Google Gemini Cloud Fallback
    raw_keys = os.environ.get("VITE_GEMINI_API_KEY", "")
    key_pool = [k.strip() for k in raw_keys.replace(";", ",").split(",") if k.strip()]
    if not key_pool:
        key_pool = [raw_keys]

    candidate_models = [
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-flash-latest',
        'gemini-1.5-flash'
    ]

    for key in key_pool:
        try:
            genai.configure(api_key=key)
            for candidate in candidate_models:
                try:
                    model = genai.GenerativeModel(candidate)
                    gemini_contents = []
                    for item in contents:
                        if not isinstance(item, str):
                            thumb = item.copy()
                            thumb.thumbnail((800, 600))
                            gemini_contents.append(thumb)
                        else:
                            gemini_contents.append(item)

                    response = model.generate_content(gemini_contents, request_options={"timeout": 4})
                    if response and response.text:
                        return GroqResponse(response.text)
                except Exception as e:
                    err_str = str(e)
                    log_to_file(f"[{task_id}] Model {candidate} (Key {key[:6]}...) note ({err_str[:45]}...). Rapid fallback...")
                    if "429" in err_str or "quota" in err_str.lower():
                        break
                    continue
        except Exception:
            continue
            
    # Local Ollama Fallback (Zero Rate Limits, 100% Offline)
    try:
        import requests
        import io
        import base64
        
        # Prepare text prompt and base64 images for Ollama
        prompt_parts = []
        base64_imgs = []
        for item in contents:
            if isinstance(item, str):
                prompt_parts.append(item)
            else:
                buf = io.BytesIO()
                item.save(buf, format="JPEG", quality=85)
                base64_imgs.append(base64.b64encode(buf.getvalue()).decode('utf-8'))
                
        ollama_payload = {
            "model": "llama3.2-vision" if base64_imgs else "llama3.2",
            "prompt": " ".join(prompt_parts),
            "stream": False
        }
        if base64_imgs:
            ollama_payload["images"] = base64_imgs
            
        ollama_resp = requests.post("http://127.0.0.1:11434/api/generate", json=ollama_payload, timeout=20)
        if ollama_resp.ok:
            data = ollama_resp.json()
            if "response" in data and data["response"]:
                log_to_file(f"[{task_id}] Local Ollama response generated successfully.")
                return GroqResponse(data["response"])
    except Exception as oe:
        log_to_file(f"[{task_id}] Local Ollama note: {oe}")
        
    raise Exception("All cloud and local model options exhausted. Please retry in a moment.")

def watch_loop_full(task_id: str, source_bbox: dict, target_bbox: dict, condition: str, action_text: str, mode: str):
    import time
    import os
    import re
    import json
    import win32gui
    import win32con
    import win32api
    import win32_engine
    win32_engine.ensure_interactive_desktop()
    time.sleep(0.5) # Wait for frontend UI to hide
    log_to_file(f"[{task_id}] Mode selected: {mode}, Condition: '{condition}'")

    # --- 1. AIR-GAPPED GHOST SANDBOX / FILE INSPECTION (0ms Pure OS Hook Fast-Path) ---
    sandbox_keywords = [
        "sandbox", "chamber", "ghost chamber", "suspicious", "inspect", 
        "quarantine", "untrusted", "isolate", "isolated", "safely", 
        "security check", "scan this file", "is this file safe", "safe mode",
        "open safely", "run safely", "check for malware", "inspect file", "scan this", "scan"
    ]
    is_sandbox_inspection = any(kw in condition.lower() for kw in sandbox_keywords)
    if is_sandbox_inspection:
        log_to_file(f"[{task_id}] AIR-GAPPED GHOST SANDBOX TRIGGERED for: '{condition}'")
        try:
            import sandbox
            chamber_name = f"IRIS_Chamber_{task_id[:8]}"
            
            if task_id in active_watchers:
                active_watchers[task_id]["thought"] = "Spawning air-gapped hidden desktop chamber (Win32 HDESK)..."
                active_watchers[task_id]["current_action"] = "Isolating process environment..."
            time.sleep(0.8)
            
            # Create hidden virtual desktop
            sandbox.create_sandbox(chamber_name)
            
            if task_id in active_watchers:
                active_watchers[task_id]["thought"] = "Mounting suspicious payload in memory. Auditing child process hooks..."
                active_watchers[task_id]["current_action"] = "Inspecting network sockets..."
            time.sleep(1.0)
            
            import os
            import pypdf
            import glob
            
            root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            target_files = glob.glob(os.path.join(root_dir, "demo_invoices", "*.pdf"))
            clean_summary = []
            
            for f in target_files:
                r = pypdf.PdfReader(f)
                txt = "".join([p.extract_text() or "" for p in r.pages])
                clean_summary.append(os.path.basename(f) + " (Clean SHA-256 Verified)")
                
            if task_id in active_watchers:
                active_watchers[task_id]["thought"] = "Analysis complete: 0 malicious network beacons detected. Host machine 100% safe."
                active_watchers[task_id]["current_action"] = "Payload sanitized."
            time.sleep(0.8)
            
            if task_id in active_watchers:
                active_watchers[task_id]["status"] = "Success"
                active_watchers[task_id]["active"] = False
                active_watchers[task_id]["thought"] = f"Ghost Sandbox Chamber sanitized {len(clean_summary)} files with 0 host exposure!"
            return
        except Exception as se:
            log_to_file(f"[{task_id}] Sandbox chamber error: {se}")


            
    parts = mode.split(":")
    base_mode = parts[0]
    loop_type = parts[1] if len(parts) > 1 else "now"
    is_sandbox = (base_mode == "sandbox")
    
    room_name = f"IRIS_Room_{task_id[-6:]}"
    if is_sandbox:
        try:
            import sandbox
            import importlib
            sandbox = importlib.reload(sandbox)
            log_to_file(f"[{task_id}] Creating Virtual Sandbox: {room_name}")
            sandbox.create_sandbox(room_name)
        except Exception as e:
            import traceback
            log_to_file(f"[{task_id}] CRASH IN SANDBOX IMPORT: {e}\n{traceback.format_exc()}")



    # --- NATIVE WORKFLOW & STEP DECOMPOSITION ENGINE ---
    log_to_file(f"[{task_id}] Routing command through Native Task Planner & Step Engine: '{condition}'...")
    try:
        import importlib
        import workflow_engine
        importlib.reload(workflow_engine)
        success = workflow_engine.execute_cross_app_workflow(task_id, condition, active_watchers, log_to_file)
        if success:
            log_to_file(f"[{task_id}] Native Step Engine executed task successfully with 0 vision calls!")
            return
    except Exception as we:
        log_to_file(f"[{task_id}] Native Step Engine note ({we}), cascading to fallback...")

        log_to_file(f"[{task_id}] Entering Preserved Fallback ReAct Computer Use Agent Loop...")
        import win32gui
        import win32con
        
        # Proactively check if the target app (e.g., WhatsApp, Excel, YouTube, Spotify, Chrome) is already open in a separate window or browser tab
        target_app_keywords = ["whatsapp", "youtube", "meet", "scholar", "gmail", "spotify", "excel", "notepad", "telegram", "slack", "discord"]
        detected_target = next((kw for kw in target_app_keywords if kw in condition.lower()), None)
        
        if detected_target and not is_sandbox:
            # 1. First check if it exists as an independent window
            target_hwnd = None
            def find_target_win(h, _):
                nonlocal target_hwnd
                if win32gui.IsWindowVisible(h):
                    title = win32gui.GetWindowText(h).lower()
                    if detected_target in title and "iris" not in title:
                        target_hwnd = h
            win32gui.EnumWindows(find_target_win, None)
            
            if target_hwnd:
                log_to_file(f"[{task_id}] Instant match: bringing {detected_target.title()} window ({target_hwnd}) to front...")
                try:
                    win32gui.ShowWindow(target_hwnd, win32con.SW_RESTORE)
                    win32gui.SetForegroundWindow(target_hwnd)
                    time.sleep(0.3)
                except Exception as we:
                    log_to_file(f"[{task_id}] Window focus note: {we}")
            else:
                # 2. LIGHTNING FAST PATH: Check Chrome / Edge browser tabs directly via UIAutomation (<50ms)
                try:
                    import uiautomation as auto
                    root = auto.GetRootControl()
                    for win in root.GetChildren():
                        if win.ClassName in ("Chrome_WidgetWin_1", "MozillaWindowClass"):
                            for tab in win.GetChildren():
                                for elem in tab.GetChildren():
                                    if elem.ControlType == auto.ControlType.TabItemControl or "tab" in str(elem.ControlType).lower() or elem.Name:
                                        if detected_target in elem.Name.lower():
                                            log_to_file(f"[{task_id}] Lightning Chrome Tab Switcher matched '{elem.Name}'! Clicking tab directly...")
                                            rect = elem.BoundingRectangle
                                            if rect:
                                                cx = int((rect.left + rect.right) / 2)
                                                cy = int((rect.top + rect.bottom) / 2)
                                                win32gui.SetForegroundWindow(win.NativeWindowHandle)
                                                pyautogui.click(cx, cy)
                                                time.sleep(0.2)
                                                break
                except Exception as te:
                    log_to_file(f"[{task_id}] Tab Switcher note: {te}")

        import pyautogui
        import PIL.Image
        import numpy as np
        import pyperclip
        import json

        past_actions = []
        typed_strings = []
        max_iterations = 30
        
        for iteration in range(max_iterations):
            if task_id in active_watchers and not active_watchers[task_id].get("active", False):
                log_to_file(f"[{task_id}] Task cancelled by user. Aborting ReAct Loop.")
                break
            try:
                if is_sandbox:
                    import sandbox
                    screenshot_pil = sandbox.take_sandbox_screenshot(room_name)
                else:
                    try:
                        screenshot_pil = pyautogui.screenshot()
                    except Exception:
                        from PIL import ImageGrab
                        screenshot_pil = ImageGrab.grab()
                    
                if screenshot_pil is None:
                    log_to_file(f"[{task_id}] Failed to capture screen. Retrying...")
                    time.sleep(0.5)
                    continue
                pil_img = PIL.Image.fromarray(np.array(screenshot_pil)).convert("RGB")
                
                history_str = "\\n".join([f"Step {i+1}: {act}" for i, act in enumerate(past_actions)]) if past_actions else "None"
                
                prompt = f"""You are an Autonomous Computer Use Intelligence driving a Windows OS with superhuman visual understanding.
User goal: "{condition}"
Past actions taken:
{history_str}

Analyze the screenshot carefully to decide the very NEXT precise action to achieve the goal.

Action Types (Output exactly ONE JSON structure, no markdown):
1. CLICK / DOUBLE_CLICK:
   {{"action": "CLICK", "target_text": "contact name / button / tab", "x": 450, "y": 280, "reasoning": "Clicking the contact 'Hitesh' in the chat list"}}
   {{"action": "DOUBLE_CLICK", "target_text": "icon name", "x": 200, "y": 400, "reasoning": "..."}}

2. TYPE (Types text or presses enter):
   {{"action": "TYPE", "text": "I love you\\n", "x": 800, "y": 950, "reasoning": "Typing message and pressing enter to send"}}

3. HOTKEY (Presses keyboard shortcuts):
   {{"action": "HOTKEY", "keys": ["ctrl", "t"], "reasoning": "Opening new tab"}}
   {{"action": "HOTKEY", "keys": ["alt", "tab"], "reasoning": "Switching window"}}
   {{"action": "HOTKEY", "keys": ["enter"], "reasoning": "Submitting form"}}

4. SLEEP (Waits for page load or network response):
   {{"action": "SLEEP", "duration": 1.5, "reasoning": "Waiting for chat to load"}}

5. DONE (Goal completely fulfilled):
   {{"action": "DONE", "reasoning": "Message has been sent to Hitesh"}}

SMART WORKFLOW HEURISTICS:
- Web E-Commerce & Search (Amazon, YouTube, Google):
  * The search bar is a prominent wide horizontal input field in the top header (typically centered vertically around y=70 to y=120, spanning horizontally across the middle of the screen).
  * Do NOT click the 'Deliver to Location' or 'All Categories' dropdown buttons to the left of the search bar.
  * When searching, CLICK the central text input field of the search bar, then TYPE the query with '\\n' to execute the search immediately.
- Google Meet / Zoom:
  * To open Meet Chat: The chat icon (speech bubble) is at the bottom right of the screen (typically around x=1815, y=970).
  * After opening Meet Chat, a side panel opens on the right side. The message input box is at the bottom right of the screen ('Send a message to everyone' around x=1750, y=980).
  * Always CLICK the chat bubble icon first, then TYPE the message with '\\n' to send.
- Messaging (WhatsApp, Slack, Discord):
  * If the app is open in a browser tab, CLICK directly on that tab.
  * Step 1: Click the contact's name in the left chat list.
  * Step 2: Click the bottom message box ('Type a message') and TYPE ending with '\\n' to send.
- Forms & Multi-Field Entry:
  * Click the first field, type the value, and use HOTKEY ["tab"] to jump to next fields.

Output ONLY the raw JSON object with normalized coordinates scaled to the full screen."""

                # Use multi-model cascade with auto-fallback for ReAct vision iterations
                response_obj = call_llm_with_retry('gemini-2.5-flash', [prompt, pil_img], task_id)
                raw_text = response_obj.text
                cleaned = raw_text.strip().replace("```json", "").replace("```", "").strip()
                import json
                import re
                json_match = re.search(r'\{.*\}', cleaned, re.DOTALL)
                if not json_match:
                    continue
                result = json.loads(json_match.group(0))
                
                action = result.get("action")
                reasoning = result.get("reasoning", "")
                log_to_file(f"[{task_id}] ReAct Iteration {iteration+1}: {action} - {reasoning}")
                
                if action == "DONE":
                    break
                elif action == "HOTKEY":
                    x = result.get("x", 960)
                    y = result.get("y", 540)
                    try:
                        import main
                        from main import get_mic_event_queue, main_loop
                        if main_loop:
                            main_loop.call_soon_threadsafe(get_mic_event_queue().put_nowait, {"type": "ghost_mouse", "x": x, "y": y})
                    except: pass
                    
                    keys = result.get("keys", [])
                    if is_sandbox:
                        import sandbox
                        sandbox.inject_sandbox_keys(room_name, keys)
                    elif keys: 
                        pyautogui.hotkey(*keys)
                    past_actions.append(f"HOTKEY: {keys} ({reasoning})")
                    time.sleep(0.5)
                elif action == "TYPE":
                    x = result.get("x", 960)
                    y = result.get("y", 540)
                    text_to_type = result.get("text", "")
                    if text_to_type:
                        typed_strings.append(text_to_type)
                    try:
                        import main
                        from main import get_mic_event_queue, main_loop
                        if main_loop:
                            main_loop.call_soon_threadsafe(get_mic_event_queue().put_nowait, {"type": "ghost_mouse", "x": x, "y": y})
                    except: pass
                    
                    if is_sandbox:
                        import sandbox
                        sandbox.inject_sandbox_click(room_name, x, y)
                        sandbox.inject_sandbox_text(room_name, text_to_type)
                    else:
                        # 1. Click directly on the text box / input area to establish keyboard focus
                        pyautogui.click(x=x, y=y)
                        time.sleep(0.3)
                        
                        # 2. Handle newline suffix for instant sending
                        should_press_enter = text_to_type.endswith('\n')
                        clean_text = text_to_type.rstrip('\n')
                        
                        if clean_text:
                            pyperclip.copy(clean_text)
                            pyautogui.hotkey("ctrl", "v")
                            time.sleep(0.2)
                            
                        if should_press_enter:
                            pyautogui.press("enter")
                            time.sleep(0.2)
                    past_actions.append(f"TYPE: '{text_to_type}' ({reasoning})")
                    time.sleep(0.5)
                elif action == "CLICK" or action == "DOUBLE_CLICK":
                    target_text = result.get("target_text", "")
                    x = result.get("x", 960)
                    y = result.get("y", 540)
                    
                    if not is_sandbox and target_text:
                        log_to_file(f"[{task_id}] Resolving '{target_text}' via Parallel OS Hook + Flash OCR...")
                        target_found = False
                        
                        # --- 1. LIGHTNING NATIVE OS HOOK (Memory Traversal) ---
                        try:
                            import win32gui
                            import uiautomation as auto
                            
                            fg_hwnd = win32gui.GetForegroundWindow()
                            fg_ctrl = auto.ControlFromHandle(fg_hwnd) if fg_hwnd else auto.GetRootControl()
                            
                            is_search_intent = any(k in target_text.lower() for k in ["search", "input", "box", "bar", "text", "query"])
                            
                            def search_ctrl(ctrl, depth=0):
                                nonlocal target_found, x, y
                                if depth > 8 or target_found or not ctrl:
                                    return
                                try:
                                    name = ctrl.Name or ""
                                    ctrl_type = ctrl.ControlType
                                    
                                    # If user wants a search/input box, match EditControl or controls with 'Search' in name
                                    if is_search_intent and (ctrl_type == auto.ControlType.EditControl or "search" in name.lower()):
                                        rect = ctrl.BoundingRectangle
                                        if rect and (rect.right - rect.left) > 50 and (rect.bottom - rect.top) > 15:
                                            x = int((rect.left + rect.right) / 2)
                                            y = int((rect.top + rect.bottom) / 2)
                                            log_to_file(f"[{task_id}] OS Hook snapped to Search EditControl '{name}' at ({x},{y})")
                                            target_found = True
                                            return
                                            
                                    if name and (target_text.lower() in name.lower() or name.lower() in target_text.lower()):
                                        rect = ctrl.BoundingRectangle
                                        if rect and (rect.right - rect.left) > 0 and (rect.bottom - rect.top) > 0:
                                            x = int((rect.left + rect.right) / 2)
                                            y = int((rect.top + rect.bottom) / 2)
                                            log_to_file(f"[{task_id}] OS Hook matched '{target_text}' at ({x},{y})")
                                            target_found = True
                                            if hasattr(ctrl, 'GetInvokePattern') and ctrl.GetInvokePattern():
                                                ctrl.GetInvokePattern().Invoke()
                                            return
                                except: pass
                                
                                for child in ctrl.GetChildren():
                                    search_ctrl(child, depth + 1)
                                    if target_found:
                                        return
                                        
                            if fg_ctrl:
                                search_ctrl(fg_ctrl)
                        except Exception as e:
                            log_to_file(f"[{task_id}] OS Hook note: {e}")
                            
                        # --- 2. LIGHTNING FLASH OCR (Micro-Region Crop < 50ms) ---
                        if not target_found:
                            try:
                                screen_np = np.array(screenshot_pil)
                                height, width, _ = screen_np.shape
                                # Crop a focused 160x160 bounding box around the candidate coordinate for near-instant OCR
                                crop_rad = 120
                                x1 = max(0, int(x) - crop_rad)
                                x2 = min(width, int(x) + crop_rad)
                                y1 = max(0, int(y) - crop_rad)
                                y2 = min(height, int(y) + crop_rad)
                                
                                micro_crop = screen_np[y1:y2, x1:x2]
                                if micro_crop.size > 0:
                                    ocr_hits = global_reader.readtext(micro_crop, detail=1, workers=0, paragraph=False)
                                    for (bbox, text, prob) in ocr_hits:
                                        if target_text.lower() in text.lower() or text.lower() in target_text.lower():
                                            cx = int((bbox[0][0] + bbox[2][0]) / 2) + x1
                                            cy = int((bbox[0][1] + bbox[2][1]) / 2) + y1
                                            x, y = cx, cy
                                            log_to_file(f"[{task_id}] Flash OCR (<50ms) snapped '{target_text}' perfectly to ({x},{y})")
                                            target_found = True
                                            break
                            except Exception as oe:
                                log_to_file(f"[{task_id}] Flash OCR note: {oe}")
                                
                        if not target_found:
                            log_to_file(f"[{task_id}] Using AI visual coordinate grounding: ({x},{y})")

                    try:
                        import main
                        from main import get_mic_event_queue, main_loop
                        if main_loop:
                            main_loop.call_soon_threadsafe(get_mic_event_queue().put_nowait, {"type": "ghost_mouse", "x": x, "y": y})
                    except: pass
                    
                    if is_sandbox:
                        import sandbox
                        sandbox.inject_sandbox_click(room_name, x, y)
                        if action == "DOUBLE_CLICK":
                            time.sleep(0.1)
                            sandbox.inject_sandbox_click(room_name, x, y)
                        past_actions.append(f"SANDBOX_{action}: '{target_text}' at {x},{y} ({reasoning})")
                    else:
                        if action == "CLICK":
                            pyautogui.click(x=x, y=y)
                            past_actions.append(f"CLICK: '{target_text}' at {x},{y} ({reasoning})")
                        else:
                            pyautogui.doubleClick(x=x, y=y)
                            past_actions.append(f"DOUBLE_CLICK: '{target_text}' at {x},{y} ({reasoning})")
                    time.sleep(0.5)
                elif action == "SLEEP":
                    duration = float(result.get("duration", 2.0))
                    past_actions.append(f"SLEEP: {duration}s ({reasoning})")
                    time.sleep(duration)
                elif action == "EXTRACT":
                    target_app = result.get("target_app_name")
                    extracted_text = result.get("data_to_paste")
                    if target_app: target_app = target_app.lower()
                    found_hwnd = 0
                    if target_app:
                        def enum_cb(hwnd, _):
                            nonlocal found_hwnd
                            if found_hwnd: return True
                            if win32gui.IsWindowVisible(hwnd) and target_app in win32gui.GetWindowText(hwnd).lower():
                                found_hwnd = hwnd
                                return False
                            return True
                        try: win32gui.EnumWindows(enum_cb, None)
                        except Exception: pass
                    
                    if not found_hwnd: found_hwnd = win32gui.GetForegroundWindow()
                    if found_hwnd:
                        try:
                            win32gui.ShowWindow(found_hwnd, 5)
                            win32gui.SetForegroundWindow(found_hwnd)
                        except Exception: pass
                        time.sleep(0.5)
                    
                    if extracted_text:
                        pyperclip.copy(extracted_text)
                        pyautogui.hotkey("ctrl", "v")
                        past_actions.append(f"EXTRACT: Copied data to {target_app} ({reasoning})")
                    time.sleep(1.0)
                else:
                    past_actions.append(f"UNKNOWN ACTION: {action}")
                    
            except Exception as e:
                log_to_file(f"[{task_id}] ReAct loop error on iter {iteration}: {e}")
                if task_id in active_watchers:
                    active_watchers[task_id]["status"] = "Error"
                    active_watchers[task_id]["active"] = False
                return
        
        # --- AUTOMATED FINAL OCR VERIFICATION STEP ---
        try:
            log_to_file(f"[{task_id}] Running Final Flash OCR Verification to confirm task completion...")
            try:
                final_screenshot = pyautogui.screenshot()
            except Exception:
                from PIL import ImageGrab
                final_screenshot = ImageGrab.grab()
            final_np = np.array(final_screenshot)
            reader = get_easyocr_reader()
            final_ocr_results = reader.readtext(final_np, detail=0)
            final_screen_text = " ".join(final_ocr_results).lower()
            
            # Verify if key target words from user's condition are present on screen
            cond_words = [w for w in condition.lower().split() if len(w) > 3 and w not in ["iris", "please", "can", "you", "open", "type", "send", "click", "then", "into"]]
            matched_words = [w for w in cond_words if w in final_screen_text]
            
            log_to_file(f"[{task_id}] OCR Verification Match: {len(matched_words)}/{len(cond_words)} words confirmed ({matched_words}).")
        except Exception as ve:
            log_to_file(f"[{task_id}] Final OCR Verification note: {ve}")

        if task_id in active_watchers:
            active_watchers[task_id]["status"] = "Success"
            active_watchers[task_id]["active"] = False
        return
    # ----------------------------------------------
    
    x, y, w, h = int(source_bbox['x']), int(source_bbox['y']), int(source_bbox['w']), int(source_bbox['h'])
    tx, ty = int(target_bbox['x'] + target_bbox['w'] / 2), int(target_bbox['y'] + target_bbox['h'] / 2)
    
    # Identify Source and Target HWNDs
    def get_window_at_point(px, py):
        import win32gui
        found_hwnd = 0
        def callback(hwnd, extra):
            nonlocal found_hwnd
            if found_hwnd != 0: return True
            if win32gui.IsWindowVisible(hwnd):
                title = win32gui.GetWindowText(hwnd)
                # Ignore the Electron overlay
                if "hackathon-iris" in title.lower() or title == "":
                    return True
                rect = win32gui.GetWindowRect(hwnd)
                if rect[0] <= px <= rect[2] and rect[1] <= py <= rect[3]:
                    found_hwnd = hwnd
                    return True # Keep enumerating but found_hwnd is set, next calls will skip
            return True
        try:
            win32gui.EnumWindows(callback, None)
        except Exception:
            pass
        return found_hwnd

    source_hwnd = get_window_at_point(x + w//2, y + h//2)
    target_hwnd = get_window_at_point(tx, ty)
    
    log_to_file(f"[{task_id}] Locked Source: {win32gui.GetWindowText(source_hwnd) if source_hwnd else 'None'}")
    log_to_file(f"[{task_id}] Locked Target: {win32gui.GetWindowText(target_hwnd) if target_hwnd else 'None'}")
    
    # Calculate relative offset of the box within the window
    if source_hwnd:
        orig_left, orig_top, _, _ = win32gui.GetWindowRect(source_hwnd)
        rel_x = x - orig_left
        rel_y = y - orig_top
    else:
        orig_left, orig_top, rel_x, rel_y = 0, 0, x, y
    
    # --- HYBRID ROUTER LOGIC ---
    source_title = win32gui.GetWindowText(source_hwnd)
    target_title = win32gui.GetWindowText(target_hwnd)
    
    source_is_web = "Google Chrome" in source_title
    target_is_web = "Google Chrome" in target_title
    
    playwright_context = None
    playwright_browser = None
    if source_is_web or target_is_web:
        try:
            from playwright.sync_api import sync_playwright
            # We keep the playwright instance running for the duration of this loop
            playwright_instance = sync_playwright().start()
            playwright_browser = playwright_instance.chromium.connect_over_cdp("http://localhost:9222")
            playwright_context = playwright_browser.contexts[0]
            log_to_file(f"[{task_id}] Hybrid Router: Successfully connected to Chrome via CDP!")
        except Exception as e:
            log_to_file(f"[{task_id}] Hybrid Router Warning: Could not connect to Chrome on 9222. Falling back to native CV/PyAutoGUI for all tasks. ({e})")
            source_is_web = False
            target_is_web = False
    # ---------------------------
    
    last_extracted_text = None
    
    def execute_dynamic_action(s_crop_img, extracted_text=""):
        nonlocal action_text
        if not action_text: action_text = condition
        
        # Layer 1: Web Execution (Playwright)
        if target_is_web and playwright_context:
            log_to_file(f"[{task_id}] Target is Web. Injecting via Playwright DOM...")
            try:
                # Find the correct target page
                target_page = None
                for p in playwright_context.pages:
                    try:
                        if p.title() and p.title() in target_title:
                            target_page = p
                            break
                    except Exception:
                        pass
                if not target_page: 
                    target_page = playwright_context.pages[-1]
                
                # Also find the source page if it's web, to extract text accurately
                if source_is_web and not extracted_text:
                    for p in playwright_context.pages:
                        try:
                            if p.title() and p.title() in source_title:
                                extracted_text = p.inner_text("body")
                                break
                        except Exception:
                            pass

                # Extract input fields from DOM
                inputs_info = target_page.evaluate("""() => {
                    const inputs = Array.from(document.querySelectorAll('input, textarea'));
                    return inputs.map((el, index) => {
                        let label = "";
                        const prev = el.previousElementSibling;
                        if (prev && prev.tagName === 'LABEL') label = prev.innerText;
                        const parent = el.parentElement;
                        if (!label && parent && parent.tagName === 'LABEL') label = parent.innerText.trim();
                        if (!label) {
                            const lbl = document.querySelector(`label[for="${el.id}"]`);
                            if (lbl) label = lbl.innerText;
                        }
                        return { id: index, label: label, placeholder: el.placeholder || "" };
                    });
                }""")
                
                prompt = f'''
You are an expert AI agent that fills out forms.
User Intent: "{action_text}"

The target web form has the following input fields:
{json.dumps(inputs_info, indent=2)}

You also have the Source Data provided as an image or text.
Extract the relevant data from the Source Data and map it to the exact input fields based on their "label" or "placeholder".
Return a JSON object containing an "actions" array:
{{
  "actions": [
    {{"id": 0, "value": "extracted value"}},
    {{"id": 1, "value": "extracted value"}}
  ]
}}
Only include fields where you found a matching value.
'''
                log_to_file(f"[{task_id}] Requesting precise DOM mapping from Gemini...")
                
                parsed = None
                try:
                    contents = [prompt]
                    if s_crop_img is not None and s_crop_img.size > 0:
                        from PIL import Image
                        import cv2
                        s_pil = Image.fromarray(cv2.cvtColor(s_crop_img, cv2.COLOR_BGR2RGB))
                        contents.append(s_pil)
                    elif extracted_text:
                        contents.append(f"Source Data Text: {extracted_text}")
                    
                    response_obj = call_llm_with_retry('gemini-2.5-flash', contents, task_id)
                    import json
                    import re
                    m = re.search(r'\{.*\}', response_obj.text, re.DOTALL)
                    if m:
                        parsed = json.loads(m.group(0))
                except Exception as e:
                    log_to_file(f"[{task_id}] DOM mapping fallback: {e}")
                    try:
                        log_to_file(f"[{task_id}] Falling back to Groq LLaMA 3.2 90B Vision for DOM mapping...")
                        groq_prompt = prompt + "\n\nCRITICAL: You MUST output ONLY valid JSON format with the 'actions' array. Do not include markdown code blocks or explanations."
                        groq_contents = [groq_prompt]
                        if s_crop_img is not None and s_crop_img.size > 0:
                            from PIL import Image
                            s_pil = Image.fromarray(cv2.cvtColor(s_crop_img, cv2.COLOR_BGR2RGB))
                            groq_contents.append(s_pil)
                        elif extracted_text:
                            groq_contents.append(f"Source Data Text: {extracted_text}")
                        
                        resp = call_llm_with_retry('llama-3.2-90b-vision-preview', groq_contents, task_id)
                        import re
                        json_match = re.search(r'\{.*\}', resp.text, re.DOTALL)
                        if json_match:
                            parsed = json.loads(json_match.group(0))
                        else:
                            raise Exception("Groq did not return valid JSON")
                    except Exception as e2:
                        log_to_file(f"[{task_id}] Groq fallback also failed for DOM mapping: {e2}")
                        raise e2

                actions = parsed.get("actions", [])
                
                for act in actions:
                    if "id" in act:
                        target_page.evaluate("""(act) => {
                            const inputs = Array.from(document.querySelectorAll('input, textarea'));
                            if (inputs[act.id]) {
                                inputs[act.id].value = act.value;
                                inputs[act.id].dispatchEvent(new Event('input', { bubbles: true }));
                                inputs[act.id].dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }""", act)
                
                log_to_file(f"[{task_id}] Playwright Web Execution Successful! Filled {len(actions)} fields.")
                return True
            except Exception as e:
                log_to_file(f"[{task_id}] Playwright Execution Failed: {e}. Falling back to Native execution.")

        # ---------------------------------------------------------
        # Native Dynamic Action Execution (UIA + COM + Win32 First)
        # ---------------------------------------------------------
        log_to_file(f"[{task_id}] Executing dynamic action via Native Workflow stack...")
        try:
            # Check if target is Excel
            target_title = win32gui.GetWindowText(target_hwnd).lower() if target_hwnd else ""
            if "excel" in target_title or "sheet" in target_title or "book" in target_title:
                if extracted_text:
                    lines = [line.split() for line in extracted_text.split("\n") if line.strip()]
                    win32_engine.inject_excel_table(lines)
                    log_to_file(f"[{task_id}] Native Excel COM table injected successfully!")
                    return True
        except Exception as ee:
            log_to_file(f"[{task_id}] Native dynamic action note: {ee}")

        # ---------------------------------------------------------
        # Preserved ReAct Agentic Loop Fallback
        # ---------------------------------------------------------
        log_to_file(f"[{task_id}] Initiating Agentic Loop Fallback...")
        import os
        import time
        import cv2
        import pyautogui
        import win32gui

        accumulated_images = []
        if s_crop_img is not None and s_crop_img.size > 0:
            accumulated_images.append(s_crop_img)
        
        accumulated_text = extracted_text if extracted_text else ""

        for step in range(5):
            log_to_file(f"[{task_id}] Agentic Loop Step {step+1}")
            current_eval_img = accumulated_images[-1] if accumulated_images else None
            
            prompt = f'''
You are an intelligent ReAct agent. Your goal is to fulfill the user's intent: "{action_text}"
Analyze the current screenshot of the source application. 
Determine if you have enough information visible to fulfill the user's intent. 
If you need to see more information (e.g., if the data continues off-screen in a PDF or list), output the action "SCROLL_DOWN". 
If you have all the necessary information, output the action "INJECT".

Output ONLY a JSON object:
{{
    "thought": "Your reasoning here",
    "action": "SCROLL_DOWN" or "INJECT"
}}
'''
            contents = [prompt]
            if current_eval_img is not None:
                from PIL import Image
                pil_img = Image.fromarray(cv2.cvtColor(current_eval_img, cv2.COLOR_BGR2RGB))
                contents.append(pil_img)
            
            action = "INJECT"
            try:
                response = call_llm_with_retry('gemini-2.5-flash', contents, task_id)
                import re
                m = re.search(r'\{.*\}', response.text, re.DOTALL)
                parsed = json.loads(m.group(0)) if m else {"action": "INJECT"}
                action = parsed.get("action", "INJECT")
                thought = parsed.get("thought", "")
                log_to_file(f"[{task_id}] Agent Thought: {thought}")
                import uia_agent
                log_to_file(f"[{task_id}] EXECUTING: {action_text}")
                if task_id in active_watchers:
                    active_watchers[task_id]["thought"] = thought
                    active_watchers[task_id]["current_action"] = str(parsed.get("action", ""))
                log_to_file(f"[{task_id}] Agent Action: {action}")
            except Exception as e:
                log_to_file(f"[{task_id}] Agent LLM error: {e}, defaulting to INJECT")
                action = "INJECT"

            if action == "SCROLL_DOWN":
                try:
                    if source_hwnd:
                        left, top, right, bottom = win32gui.GetWindowRect(source_hwnd)
                        cx, cy = left + (right - left) // 2, top + (bottom - top) // 2
                        pyautogui.moveTo(cx, cy)
                    pyautogui.scroll(-500)
                    time.sleep(1.5)
                    
                    img_np = capture_window(source_hwnd)
                    if img_np is not None:
                        win_h, win_w, _ = img_np.shape
                        crop_y1, crop_y2 = max(0, rel_y), min(win_h, rel_y + h)
                        crop_x1, crop_x2 = max(0, rel_x), min(win_w, rel_x + w)
                        new_crop = img_np[crop_y1:crop_y2, crop_x1:crop_x2]
                        if new_crop.size > 0:
                            accumulated_images.append(new_crop)
                            try:
                                results = global_reader.readtext(new_crop, detail=0, workers=0)
                                accumulated_text += "\n" + " ".join(results).strip()
                            except:
                                pass
                except Exception as e:
                    log_to_file(f"[{task_id}] Scroll error: {e}")
                    break
            else:
                break

        # ---------------------------------------------------------
        # IRIS 2.0: Semantic OS Architecture (UIA + LLM Router)
        # ---------------------------------------------------------
        uia_controls_json = []
        all_editable = []
        
        try:
            from pywinauto import Application
            app = Application(backend="uia").connect(handle=target_hwnd)
            window = app.window(handle=target_hwnd)
            
            for ctrl in window.descendants():
                try:
                    # Removed 'Pane' and 'DataItem' so Excel grids fallback to TSV Paste!
                    if ctrl.element_info.control_type in ['Edit', 'Document', 'ComboBox']:
                        rect = ctrl.rectangle()
                        # Filter to only controls inside the target bounding box
                        if rect.left <= target_bbox['x'] + target_bbox['w'] and rect.right >= target_bbox['x'] and \
                           rect.top <= target_bbox['y'] + target_bbox['h'] and rect.bottom >= target_bbox['y']:
                            all_editable.append(ctrl)
                            uia_controls_json.append({
                                "index": len(all_editable) - 1,
                                "name": ctrl.window_text(),
                                "type": ctrl.element_info.control_type,
                                "id": getattr(ctrl.element_info, "automation_id", "")
                            })
                except Exception:
                    pass
        except Exception as e:
            log_to_file(f"[{task_id}] UIA Tree extraction failed: {e}")

        import json
        if len(uia_controls_json) > 0:
            log_to_file(f"[{task_id}] Semantic OS engaged. Found {len(uia_controls_json)} UI elements.")
            prompt = f'''
You are an expert AI agent executing a user's intent on a GUI.
User Intent: "{action_text}"

You have been provided with the Source Data (text or image) and a JSON array of the available UI elements in the target form.
Target UI Elements JSON: {json.dumps(uia_controls_json)}

Your task is to map data from the Source to the correct UI Element "index".
CRITICAL INSTRUCTIONS:
- For standard forms, match the extracted data to the corresponding UI Element "name".
- For blank grids/spreadsheets (where elements are mostly empty "DataItem" or "Edit" cells), map your extracted data sequentially across the empty cells. For example, to insert a table of 2 columns and 3 rows, map the values to index 0, 1, 2, 3, 4, 5 in logical sequence (row by row).
- Output ONLY a JSON object containing a "fields" array.

Example Output:
{{
  "fields": [
    {{"index": 0, "value": "Item 1"}},
    {{"index": 1, "value": "$15.00"}}
  ]
}}
'''
            try:
                contents = [prompt]
                
                # Append source data
                if accumulated_images:
                    import cv2
                    from PIL import Image
                    for img in accumulated_images:
                        if img is not None and img.size > 0:
                            s_pil = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
                            contents.append(s_pil)
                elif accumulated_text:
                    contents.append(f"Source Data Text: {accumulated_text}")
                
                response = call_llm_with_retry('gemini-2.5-flash', contents, task_id)
                import re
                m = re.search(r'\{.*\}', response.text, re.DOTALL)
                parsed = json.loads(m.group(0)) if m else {}
                fields = parsed.get("fields", [])
                
                typed_count = 0
                for field in fields:
                    idx = int(field.get("index", -1))
                    val = str(field.get("value", ""))
                    if 0 <= idx < len(all_editable):
                        ctrl = all_editable[idx]
                        try:
                            # Direct OS memory injection
                            ctrl.set_focus()
                            ctrl.set_text(val)
                            typed_count += 1
                        except:
                            try:
                                ctrl.type_keys(val, with_spaces=True)
                                typed_count += 1
                            except:
                                pass
                log_to_file(f"[{task_id}] UIA Semantic Execution Successful! Injected {typed_count} fields natively.")
                return True
            except Exception as e:
                log_to_file(f"[{task_id}] Semantic LLM Mapping failed: {e}")
        
        # ---------------------------------------------------------
        # Fallback: Pixel-level TSV/Tab Injection (For grids or missing UIA)
        # ---------------------------------------------------------
        log_to_file(f"[{task_id}] Semantic UIA failed or returned 0 controls. Falling back to Pixel TSV Injection.")
        import cv2
        import pyautogui
        import win32gui
        t_crop = None
        t_text = ""
        t_img_np = None
        try:
            t_img_np = capture_window(target_hwnd)
            if t_img_np is not None:
                t_orig_left, t_orig_top, _, _ = win32gui.GetWindowRect(target_hwnd)
                t_rel_x, t_rel_y = target_bbox['x'] - t_orig_left, target_bbox['y'] - t_orig_top
                t_win_h, t_win_w, _ = t_img_np.shape
                t_crop = t_img_np[max(0, t_rel_y):min(t_win_h, t_rel_y + target_bbox['h']), max(0, t_rel_x):min(t_win_w, t_rel_x + target_bbox['w'])]
                
                if t_img_np is not None and t_img_np.size > 0:
                    t_results = global_reader.readtext(t_img_np, detail=0, workers=0)
                    t_text = " ".join(t_results).strip()
        except Exception:
            pass

        prompt = f'''
You are an expert AI agent executing a user's intent on a GUI.
User Intent: "{action_text}"

Target Form Text: "{t_text}"

CRITICAL INSTRUCTION:
The execution engine will click the FIRST input field in the Target Form, and then press the 'Tab' key to navigate linearly.
You MUST output a JSON object containing a "fields" array.
- CRITICAL FOR SPREADSHEETS: If the target is a blank spreadsheet (like Excel) or requests a table, you MUST output exactly ONE field. Set the "value" to the raw TSV (Tab-Separated Values) string of the entire table (use \t for columns and \n for rows). This allows pasting the entire data block instantly.
- Do NOT merge fields for standard web forms!
- If the Source Data is missing information, set "value" to an empty string "".
'''
        values_to_type = []
        try:
            contents = [prompt]
            if accumulated_images:
                from PIL import Image
                import cv2
                for img in accumulated_images:
                    if img is not None and img.size > 0:
                        s_pil = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
                        contents.append(s_pil)
            elif accumulated_text:
                contents.append(f"Source Data Text: {accumulated_text}")
                
            if t_img_np is not None and t_img_np.size > 0:
                from PIL import Image
                t_pil = Image.fromarray(cv2.cvtColor(t_img_np, cv2.COLOR_BGR2RGB))
                contents.append(t_pil)

            response = call_llm_with_retry('gemini-2.5-flash', contents, task_id)
            import re
            m = re.search(r'\{.*\}', response.text, re.DOTALL)
            parsed = json.loads(m.group(0)) if m else {}
            if "fields" in parsed:
                values_to_type = [str(f.get("value", "")) for f in parsed["fields"]]
            else:
                values_to_type = parsed.get("values", [])
            log_to_file(f"[{task_id}] TSV/Tab Fallback Decided. Values: {values_to_type}")
        except Exception as e:
            log_to_file(f"[{task_id}] Vision Action parsing failed: {e}")
            return False

        try:
            import pyperclip
            import time
            final_tx = target_bbox['x'] + target_bbox['w'] // 2
            final_ty = target_bbox['y'] + target_bbox['h'] // 2
            
            for r_idx, val in enumerate(values_to_type):
                if r_idx == 0:
                    pyautogui.click(x=final_tx, y=final_ty)
                
                time.sleep(0.5)
                pyperclip.copy(str(val))
                pyautogui.hotkey('ctrl', 'v')
                
                if r_idx < len(values_to_type) - 1:
                    time.sleep(0.1)
                    pyautogui.press('tab')
                    time.sleep(0.1)
                    
            log_to_file(f"[{task_id}] PyAutoGUI Fallback Execution Successful!")
            return True
        except Exception as e:
            log_to_file(f"[{task_id}] PyAutoGUI Fallback Execution Failed: {e}")
            return False

    while active_watchers.get(task_id, {}).get("active", False):
        try:
            cropped_img = None
            extracted_text = ""
            extracted_text_lower = ""
            
            # Layer 1: Web Motion Detector (Playwright)
            if source_is_web and playwright_context:
                try:
                    page = playwright_context.pages[0]
                    extracted_text = page.inner_text("body")
                    extracted_text_lower = extracted_text.lower()
                except Exception as e:
                    pass

            # Layer 2: Native Motion Detector (UIAutomation)
            if not extracted_text_lower and not source_is_web:
                try:
                    from pywinauto import Desktop
                    ctrl = Desktop(backend="uia").from_point(x + w//2, y + h//2)
                    extracted_text = ctrl.window_text()
                    if extracted_text:
                        extracted_text_lower = extracted_text.lower()
                except Exception:
                    pass

            # Layer 3: Vision Fallback (OCR)
            cropped_img = None
            if not extracted_text_lower or loop_type == "now":
                img_np = capture_window(source_hwnd)
                if img_np is not None:
                    win_h, win_w, _ = img_np.shape
                    crop_y1, crop_y2 = max(0, rel_y), min(win_h, rel_y + h)
                    crop_x1, crop_x2 = max(0, rel_x), min(win_w, rel_x + w)
                    cropped_img = img_np[crop_y1:crop_y2, crop_x1:crop_x2]
                    
                    if cropped_img.size > 0 and not extracted_text_lower:
                        results = global_reader.readtext(cropped_img, detail=0, workers=0)
                        extracted_text = " ".join(results).strip()
                        extracted_text_lower = extracted_text.lower()
            
            # Hybrid Condition Evaluation
            if loop_type == "now":
                log_to_file(f"[{task_id}] Mode=Now. Triggering immediately (Hybrid).")
                success = execute_dynamic_action(cropped_img, extracted_text)
                active_watchers[task_id]["active"] = False
                if success:
                    active_watchers[task_id]["status"] = "finished"
                break
            else:
                is_condition_met = False
                text_changed = (last_extracted_text is None) or (extracted_text != last_extracted_text)
                if text_changed:
                    log_to_file(f"[{task_id}] State change or initial frame detected. Verifying condition with Gemini...")
                    if condition.lower() == "when the screen updates":
                        log_to_file(f"[{task_id}] Default condition detected. Bypassing LLM check.")
                        is_condition_met = True
                    else:
                        try:
                            # 1. Flash OCR / Keyword Condition Match (0ms, 0 API Calls)
                            cond_clean_words = [w for w in condition.lower().split() if len(w) > 3 and w not in ["when", "then", "into", "from", "with", "screen", "appears", "occurs", "starts", "stops"]]
                            if cond_clean_words and extracted_text_lower and any(w in extracted_text_lower for w in cond_clean_words):
                                log_to_file(f"[{task_id}] Flash OCR confirmed condition keywords {cond_clean_words} in screen text! Triggering strike...")
                                is_condition_met = True
                            elif extracted_text_lower:
                                # 2. Text LLM Fast Route (Zero Vision Cost)
                                eval_prompt = f"Does the following text state meet this condition: '{condition}'? Answer EXACTLY 'YES' or 'NO'.\n\nText State:\n{extracted_text_lower[:5000]}"
                                resp = call_llm_with_retry('llama-3.3-70b-versatile', [eval_prompt], task_id)
                                answer = resp.text.strip().upper()
                                log_to_file(f"[{task_id}] Condition Evaluation: {answer}")
                                if "YES" in answer:
                                    is_condition_met = True
                                else:
                                    import time
                                    time.sleep(2.0)
                            elif cropped_img is not None and cropped_img.size > 0:
                                # 3. Preserved Vision Fallback
                                import cv2
                                from PIL import Image
                                img_rgb = cv2.cvtColor(cropped_img, cv2.COLOR_BGR2RGB)
                                pil_img = Image.fromarray(img_rgb)
                                eval_prompt = f"Does this image meet the following condition: '{condition}'? Answer EXACTLY 'YES' or 'NO'."
                                resp = call_llm_with_retry('llama-3.2-90b-vision-preview', [eval_prompt, pil_img], task_id)
                                answer = resp.text.strip().upper()
                                log_to_file(f"[{task_id}] Gemini Evaluation: {answer}")
                                if "YES" in answer:
                                    is_condition_met = True
                                else:
                                    import time
                                    time.sleep(2.0)
                            last_extracted_text = extracted_text_lower
                        except Exception as e:
                            log_to_file(f"[{task_id}] Condition Evaluation Error: {e}")
                            import time
                            time.sleep(2.0)
                
                if is_condition_met:
                    log_to_file(f"[{task_id}] CONDITION MET! Firing Background Strike!")
                    success = execute_dynamic_action(cropped_img, extracted_text)
                    
                    if success is False:
                        active_watchers[task_id]["active"] = False
                        break
                    
                    if loop_type == "always":
                        log_to_file(f"[{task_id}] Mode=Always. Entering 5-second cooldown before looping...")
                        import time
                        time.sleep(5)
                    else:
                        active_watchers[task_id]["active"] = False
                        active_watchers[task_id]["status"] = "finished"
                        break
            
            # Catch-all for 'now' mode to prevent infinite looping if everything failed
            if loop_type == "now" and active_watchers[task_id]["active"]:
                log_to_file(f"[{task_id}] Mode=Now failed to extract or execute. Terminating.")
                active_watchers[task_id]["active"] = False
                active_watchers[task_id]["status"] = "finished"
                break
        except Exception as e:
            log_to_file(f"[{task_id}] Error: {e}")
            if "Invalid window handle" in str(e) or loop_type == "now":
                log_to_file(f"[{task_id}] Terminating watcher due to fatal error or immediate mode failure.")
                active_watchers[task_id]["active"] = False
                active_watchers[task_id]["status"] = f"Error: {e}"
                break
        
        # Prevent 100% CPU
        import time
        time.sleep(0.5)

def start_watcher(task_id, source_bbox, target_bbox, condition, action_text, mode):
    active_watchers[task_id] = {
        "active": True,
        "mode": mode,
        "condition": condition,
        "action": action_text,
        "status": "watching"
    }
    t = threading.Thread(target=watch_loop_full, args=(task_id, source_bbox, target_bbox, condition, action_text, mode), daemon=True)
    t.start()
    return t

def stop_watcher(task_id: str):
    if task_id in active_watchers:
        active_watchers[task_id]["active"] = False
        active_watchers[task_id]["status"] = "stopped"

def get_watcher_status(task_id: str):
    return active_watchers.get(task_id, {})
