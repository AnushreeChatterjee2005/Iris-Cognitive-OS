import time
import threading
import easyocr
import numpy as np
import sys
import win32gui
import win32ui
import win32api
import win32con
from ctypes import windll
import pyautogui
import os

def log_to_file(msg):
    with open(r"c:\Users\Anushree Chatterjee\Hackathon_IRIS\watcher_debug.log", "a", encoding="utf-8") as f:
        f.write(msg + "\n")
    print(msg)

# Force UTF-8 encoding for Windows terminal to prevent EasyOCR progress bar from crashing
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

active_watchers = {}

def capture_window(hwnd):
    if hwnd == 0:
        hwnd = win32gui.GetDesktopWindow()
    left, top, right, bottom = win32gui.GetWindowRect(hwnd)
    width = right - left
    height = bottom - top

    hwndDC = win32gui.GetWindowDC(hwnd)
    mfcDC  = win32ui.CreateDCFromHandle(hwndDC)
    saveDC = mfcDC.CreateCompatibleDC()

    saveBitMap = win32ui.CreateBitmap()
    saveBitMap.CreateCompatibleBitmap(mfcDC, width, height)
    saveDC.SelectObject(saveBitMap)

    # PW_RENDERFULLCONTENT = 2 for Windows 8.1+, fallback to 3 for Chrome
    result = windll.user32.PrintWindow(hwnd, saveDC.GetSafeHdc(), 3)
    
    bmpinfo = saveBitMap.GetInfo()
    bmpstr = saveBitMap.GetBitmapBits(True)
    
    img = np.frombuffer(bmpstr, dtype='uint8')
    img.shape = (bmpinfo['bmHeight'], bmpinfo['bmWidth'], 4)
    
    win32gui.DeleteObject(saveBitMap.GetHandle())
    saveDC.DeleteDC()
    mfcDC.DeleteDC()
    win32gui.ReleaseDC(hwnd, hwndDC)

    if result == 1:
        # Convert BGRA to BGR for EasyOCR / OpenCV consistency
        return img[:, :, :3]
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

GROQ_API_KEY = "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"
groq_client = Groq(api_key=GROQ_API_KEY)

class GroqResponse:
    def __init__(self, text):
        self.text = text

def call_llm_with_retry(model_name, contents, task_id="system"):
    max_retries = 3
    for attempt in range(max_retries):
        try:
            messages = [{"role": "user", "content": []}]
            for item in contents:
                if isinstance(item, str):
                    messages[0]["content"].append({"type": "text", "text": item})
                else: # PIL Image
                    import io
                    import base64
                    buffered = io.BytesIO()
                    item.thumbnail((1024, 1024)) # resize for vision limits
                    item.save(buffered, format="JPEG")
                    img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
                    messages[0]["content"].append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_str}"}})
            
            chat_completion = groq_client.chat.completions.create(
                messages=messages,
                model=model_name,
                temperature=0.0
            )
            return GroqResponse(chat_completion.choices[0].message.content)
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "rate limit" in err_str.lower() or "quota" in err_str.lower() or "400" in err_str:
                if attempt < max_retries - 1:
                    log_to_file(f"[{task_id}] Rate limit hit. Waiting 10s before retry {attempt+1}/{max_retries}...")
                    import time
                    time.sleep(10.0)
                else:
                    log_to_file(f"[{task_id}] Rate limit hit. Max retries reached.")
                    raise e
            else:
                raise e

def watch_loop_full(task_id: str, source_bbox: dict, target_bbox: dict, condition: str, action_text: str, mode: str):
    import time
    time.sleep(1.0)
    log_to_file(f"[{task_id}] Mode selected: {mode}")
    
    import re
    # --- DYNAMIC INTENT PARSING ---
    # If action_text is empty, the frontend sent the raw unparsed command in 'condition'.
    if not action_text and mode in ["when", "always"]:
        log_to_file(f"[{task_id}] Parsing raw intent with Gemini...")
        try:
            split_prompt = f"""
You are an intent parser for an automation AI. 
The user provided a raw command: "{condition}"

Split this command into two distinct parts:
1. "condition": The trigger condition that the system should watch for. Make it concise. (e.g. "when an email arrives")
2. "action": The action the system should perform. (e.g. "type thank you received")

Output ONLY a JSON object:
{{"condition": "...", "action": "..."}}
"""
            resp = call_llm_with_retry('llama-3.3-70b-versatile', [split_prompt], task_id)
            json_match = re.search(r'\{.*\}', resp.text, re.DOTALL)
            if json_match:
                parsed = json.loads(json_match.group(0))
                condition = parsed.get("condition", condition)
                action_text = parsed.get("action", "")
                log_to_file(f"[{task_id}] Parsed Condition: {condition}")
                log_to_file(f"[{task_id}] Parsed Action: {action_text}")
                
                # Update the shared state so the frontend UI can display the correct parsed action
                if task_id in active_watchers:
                    active_watchers[task_id]["condition"] = condition
                    active_watchers[task_id]["action"] = action_text
        except Exception as e:
            log_to_file(f"[{task_id}] Intent parsing failed: {e}")
    # -------------------------------
    
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
                page = playwright_context.pages[0]
                
                # We ask Gemini to generate Playwright commands based on the intent!
                prompt = f'''
You are an expert Web AI agent.
User Intent: "{action_text}"

The user wants to execute this intent on the active web page.
Return ONLY a raw JSON array of objects representing Playwright actions.
Format:
[
  {{"action": "fill", "placeholder": "To", "value": "email@gmail.com"}},
  {{"action": "fill", "placeholder": "Subject", "value": "Hello"}},
  {{"action": "fill_body", "value": "Body text"}},
  {{"action": "click", "text": "Send"}}
]

If you just need to click a button by its text:
[ {{"action": "click", "text": "Send"}} ]

If you need to fill a specific field by placeholder:
[ {{"action": "fill", "placeholder": "Search", "value": "query"}} ]
'''
                resp = call_llm_with_retry('llama-3.3-70b-versatile', [prompt], task_id)
                import json, re
                json_match = re.search(r'\[.*\]', resp.text, re.DOTALL)
                if json_match:
                    actions = json.loads(json_match.group(0))
                    for act in actions:
                        if act["action"] == "click":
                            page.get_by_text(act["text"]).first.click(timeout=3000)
                        elif act["action"] == "fill":
                            page.get_by_placeholder(act["placeholder"]).first.fill(act["value"])
                        elif act["action"] == "fill_body":
                            # For Gmail body, it's often an aria-label="Message Body"
                            page.get_by_label("Message Body", exact=False).first.fill(act["value"])
                    log_to_file(f"[{task_id}] Playwright Web Execution Successful!")
                    return True
            except Exception as e:
                log_to_file(f"[{task_id}] Playwright Execution Failed: {e}. Falling back to Vision.")

        # Layer 2 & 3: Vision/Native Fallback (PyAutoGUI)
        import cv2
        import pyautogui
        t_crop = None
        try:
            t_img_np = capture_window(target_hwnd)
            if t_img_np is not None:
                t_orig_left, t_orig_top, _, _ = win32gui.GetWindowRect(target_hwnd)
                t_rel_x, t_rel_y = target_bbox['x'] - t_orig_left, target_bbox['y'] - t_orig_top
                t_win_h, t_win_w, _ = t_img_np.shape
                t_crop = t_img_np[max(0, t_rel_y):min(t_win_h, t_rel_y + target_bbox['h']), max(0, t_rel_x):min(t_win_w, t_rel_x + target_bbox['w'])]
        except Exception as e:
            pass

        prompt = f'''
You are an expert AI agent executing a user's intent on a GUI.
User Intent: "{action_text}"

Determine what physical action to take on the Target Box to fulfill the user's intent.
You MUST output ONLY a valid JSON object.
If the intent requires typing data into fields, output a flat list:
{{"action": "type", "values": ["string 1", "string 2"]}}
If the intent is just to click a button, output:
{{"action": "click"}}
'''
        action_type = "type"
        values_to_type = []
        try:
            contents = [prompt]
            if s_crop_img is not None and s_crop_img.size > 0:
                from PIL import Image
                s_pil = Image.fromarray(cv2.cvtColor(s_crop_img, cv2.COLOR_BGR2RGB))
                contents.extend(["Source Data Image:", s_pil])
            elif extracted_text:
                contents.extend([f"Source Data Text: {extracted_text}"])
                
            if t_crop is not None and t_crop.size > 0:
                from PIL import Image
                t_pil = Image.fromarray(cv2.cvtColor(t_crop, cv2.COLOR_BGR2RGB))
                contents.extend(["Target Form Image:", t_pil])

            response = call_llm_with_retry('llama-3.2-90b-vision-preview', contents, task_id)
            json_match = re.search(r'\{.*\}', response.text, re.DOTALL)
            if json_match:
                parsed = json.loads(json_match.group(0))
                action_type = parsed.get("action", "type")
                values_to_type = parsed.get("values", [])
                if not isinstance(values_to_type, list): values_to_type = [values_to_type]
                log_to_file(f"[{task_id}] Dynamic Action Decided: {action_type} | Values: {values_to_type}")
        except Exception as e:
            log_to_file(f"[{task_id}] Gemini Vision Action parsing failed: {e}")
            active_watchers[task_id]["status"] = f"Error: API Limit"
            return False

        final_tx, final_ty = tx, ty
        try:
            if t_crop is not None and t_crop.size > 0:
                gray = cv2.cvtColor(t_crop, cv2.COLOR_BGR2GRAY)
                edges = cv2.Canny(gray, 10, 30)
                contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                input_fields = [cv2.boundingRect(c) for c in contours if cv2.boundingRect(c)[2]*cv2.boundingRect(c)[3] > 1000 and 25 < cv2.boundingRect(c)[3] < 80 and cv2.boundingRect(c)[2] > 100]
                if input_fields:
                    input_fields.sort(key=lambda f: (f[1], f[0]))
                    rx, ry, rw, rh = input_fields[0]
                    final_tx, final_ty = target_bbox['x'] + rx + rw // 2, target_bbox['y'] + ry + rh // 2
                    log_to_file(f"[{task_id}] Auto-Aim engaged!")
        except Exception:
            pass

        # Native Desktop Execution (Layer 2: UIAutomation)
        uia_success = False
        try:
            from pywinauto import Desktop
            ctrl = Desktop(backend="uia").from_point(tx, ty)
            if action_type == "click":
                if hasattr(ctrl, 'invoke'):
                    ctrl.invoke()
                else:
                    ctrl.click_input()
                log_to_file(f"[{task_id}] UIA Native Execution Successful!")
                uia_success = True
            elif action_type == "type":
                # UIA can set text without moving the mouse!
                if hasattr(ctrl, 'set_edit_text'):
                    ctrl.set_edit_text(str(values_to_type[0]))
                else:
                    ctrl.type_keys(str(values_to_type[0]), with_spaces=True)
                log_to_file(f"[{task_id}] UIA Native Execution Successful!")
                uia_success = True
        except Exception as e:
            log_to_file(f"[{task_id}] UIA Native Execution Failed: {e}. Falling back to Vision.")

        if not uia_success:
            # Layer 3: Vision Fallback (PyAutoGUI)
            pyautogui.click(x=final_tx, y=final_ty)
            time.sleep(0.5)

            if action_type == "type":
                import pyperclip
                for r_idx, val in enumerate(values_to_type):
                    pyperclip.copy(str(val))
                    time.sleep(0.05)
                    pyautogui.hotkey('ctrl', 'v')
                    time.sleep(0.1)
                    if r_idx < len(values_to_type) - 1:
                        pyautogui.press('tab')
                        time.sleep(0.1)
        return True

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
            if not extracted_text_lower:
                img_np = capture_window(source_hwnd)
                if img_np is not None:
                    win_h, win_w, _ = img_np.shape
                    crop_y1, crop_y2 = max(0, rel_y), min(win_h, rel_y + h)
                    crop_x1, crop_x2 = max(0, rel_x), min(win_w, rel_x + w)
                    cropped_img = img_np[crop_y1:crop_y2, crop_x1:crop_x2]
                    
                    if cropped_img.size > 0:
                        if mode == "now":
                            log_to_file(f"[{task_id}] Mode=Now. Triggering immediately.")
                            execute_dynamic_action(cropped_img)
                            active_watchers[task_id]["active"] = False
                            active_watchers[task_id]["status"] = "finished"
                            break

                        results = global_reader.readtext(cropped_img, detail=0, workers=0)
                        extracted_text = " ".join(results).strip()
                        extracted_text_lower = extracted_text.lower()
            
            # Hybrid Condition Evaluation
            if mode == "now":
                pass # Handled above for OCR, for Web/UIA we just trigger
            else:
                is_condition_met = False
                text_changed = (last_extracted_text is None) or (extracted_text != last_extracted_text)
                if text_changed:
                    log_to_file(f"[{task_id}] State change or initial frame detected. Verifying condition with Gemini...")
                    try:
                        if cropped_img is not None and cropped_img.size > 0:
                            import cv2
                            from PIL import Image
                            img_rgb = cv2.cvtColor(cropped_img, cv2.COLOR_BGR2RGB)
                            pil_img = Image.fromarray(img_rgb)
                            eval_prompt = f"Does this image meet the following condition: '{condition}'? Answer EXACTLY 'YES' or 'NO'."
                            resp = call_llm_with_retry('llama-3.2-90b-vision-preview', [eval_prompt, pil_img], task_id)
                        else:
                            # Send text to Groq instead of Image (Zero Cost & Ultra Fast!)
                            eval_prompt = f"Does the following text state meet this condition: '{condition}'? Answer EXACTLY 'YES' or 'NO'.\n\nText State:\n{extracted_text_lower[:5000]}"
                            resp = call_llm_with_retry('llama-3.3-70b-versatile', [eval_prompt], task_id)
                            
                        answer = resp.text.strip().upper()
                        log_to_file(f"[{task_id}] Gemini Evaluation: {answer}")
                        if "YES" in answer:
                            is_condition_met = True
                        else:
                            import time
                            time.sleep(2.0)
                        last_extracted_text = extracted_text_lower
                    except Exception as e:
                        log_to_file(f"[{task_id}] Gemini Evaluation Error: {e}")
                        import time
                        time.sleep(2.0)
                
                if is_condition_met:
                    log_to_file(f"[{task_id}] CONDITION MET! Firing Background Strike!")
                    success = execute_dynamic_action(cropped_img, extracted_text)
                    
                    if success is False:
                        active_watchers[task_id]["active"] = False
                        break
                    
                    if mode == "always":
                        log_to_file(f"[{task_id}] Mode=Always. Entering 5-second cooldown before looping...")
                        import time
                        time.sleep(5)
                    else:
                        active_watchers[task_id]["active"] = False
                        active_watchers[task_id]["status"] = "finished"
                        break
        except Exception as e:
            log_to_file(f"[{task_id}] Error: {e}")
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
