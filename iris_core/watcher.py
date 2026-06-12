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
                # Send full keydown, char, keyup sequence to prevent Chromium caret desync
                win32api.SendMessage(hwnd, win32con.WM_KEYDOWN, vk_code, 1)
                win32api.SendMessage(hwnd, win32con.WM_CHAR, ord(char), 1)
                win32api.SendMessage(hwnd, win32con.WM_KEYUP, vk_code, 0xC0000001)
                time.sleep(0.01)
        return True
    except Exception as e:
        print(f"Background click failed: {e}")
        return False

def watch_loop(task_id: str, source_bbox: dict, target_coords: dict, condition: str, action_text: str):
    import torch
    torch.set_num_threads(1) # Prevent OpenMP deadlocks
    
    print(f"[{task_id}] Loading EasyOCR Model in thread...")
    reader = easyocr.Reader(['en'], gpu=False)
    print(f"[{task_id}] OCR Model loaded.")
    
    x, y, w, h = source_bbox['x'], source_bbox['y'], source_bbox['w'], source_bbox['h']
    tx, ty = target_coords['x'], target_coords['y']
    
    # 1. Identify Target OS Windows
    source_hwnd = win32gui.WindowFromPoint((x + w//2, y + h//2))
    target_hwnd = win32gui.WindowFromPoint((tx, ty))
    
    source_title = win32gui.GetWindowText(source_hwnd)
    target_title = win32gui.GetWindowText(target_hwnd)
    
    print(f"[{task_id}] Source Window Locked: {source_title} ({source_hwnd})")
    print(f"[{task_id}] Target Window Locked: {target_title} ({target_hwnd})")
    
    while active_watchers.get(task_id, False):
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
            print(f"[{task_id}] Watcher Error: {e}")
            
        time.sleep(0.5)

import google.generativeai as genai
import json
import easyocr
import torch

torch.set_num_threads(1)
print("Loading Global EasyOCR Model...")
global_reader = easyocr.Reader(['en'], gpu=False)
print("Global OCR Model loaded.")

GEMINI_API_KEY = "AQ.Ab8RN6LzEPJnTWzG21u7fh-s1kKGTzxE0JYNzg1Aicox2Ck5jQ"
try:
    genai.configure(api_key=GEMINI_API_KEY)
except Exception:
    pass

def watch_loop_full(task_id: str, source_bbox: dict, target_bbox: dict, condition: str, action_text: str, mode: str):
    print(f"[{task_id}] Mode selected: {mode}")
    
    x, y, w, h = source_bbox['x'], source_bbox['y'], source_bbox['w'], source_bbox['h']
    tx, ty = target_bbox['x'] + target_bbox['w'] // 2, target_bbox['y'] + target_bbox['h'] // 2
    
    # Identify Source and Target HWNDs
    source_hwnd = win32gui.WindowFromPoint((x + w//2, y + h//2))
    target_hwnd = win32gui.WindowFromPoint((tx, ty))
    
    print(f"[{task_id}] Locked Source: {win32gui.GetWindowText(source_hwnd)}")
    print(f"[{task_id}] Locked Target: {win32gui.GetWindowText(target_hwnd)}")
    
    # Calculate relative offset of the box within the window
    orig_left, orig_top, _, _ = win32gui.GetWindowRect(source_hwnd)
    rel_x = x - orig_left
    rel_y = y - orig_top
    
    last_extracted_text = None
    
    # ---------------------------------------------------------
    # LLM COMPILER STEP
    # ---------------------------------------------------------
    compiled_condition = None
    compiled_action = None
    
    if mode in ["when", "always"]:
        print(f"[{task_id}] Compiling intent via LLM...")
        compiler_prompt = f"""
You are an expert compiler. Translate the user's natural language condition and action into raw executable logic.
Condition: "{condition}"
Action: "{action_text}"

You must output a JSON object with exactly two keys: "condition_eval" and "action_json".
"condition_eval": A valid Python expression that returns True if the condition is met. You have access to variables: `curr` (current OCR string) and `prev` (previous OCR string, can be None). Use `prev` for state change conditions.
"action_json": A JSON list of objects representing the action sequence. Supported types: {{"type": "text", "value": "hello"}}, {{"type": "key", "value": "tab"}}, {{"type": "key", "value": "enter"}}.

Output ONLY the raw JSON object, no markdown.
Example 1:
Condition: "when a new text arrives"
Action: "type yay and send it"
Output: {{"condition_eval": "prev is not None and curr != prev", "action_json": [{{"type": "text", "value": "yay"}}, {{"type": "key", "value": "enter"}}]}}

Example 2:
Condition: "when it says error"
Action: "type fix"
Output: {{"condition_eval": "'error' in curr.lower()", "action_json": [{{"type": "text", "value": "fix"}}]}}
"""
        try:
            import requests, json
            API_BASE_URL = "https://api.cloudflare.com/client/v4/accounts/895f8c7b633eccf9438f9c233b93049b/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast"
            headers = {"Authorization": "Bearer cfut_2KqZpUwpIsNcHK4jkgrc7mH6PuKSaubdYhD2Rmad50d12dbc"}
            inputs = {"max_tokens": 500, "messages": [{"role": "system", "content": "You are a raw compiler. Output ONLY valid JSON."}, {"role": "user", "content": compiler_prompt}]}
            response = requests.post(API_BASE_URL, headers=headers, json=inputs).json()
            resp_val = response.get("result", {}).get("response", "").strip()
            if resp_val.startswith("```json"): resp_val = resp_val[7:]
            if resp_val.startswith("```"): resp_val = resp_val[3:]
            if resp_val.endswith("```"): resp_val = resp_val[:-3]
            resp_val = resp_val.strip()
            
            compiled_data = json.loads(resp_val)
            compiled_condition = compiled_data.get("condition_eval")
            compiled_action = compiled_data.get("action_json")
            print(f"[{task_id}] LLM Compiled Condition: {compiled_condition}")
            print(f"[{task_id}] LLM Compiled Action: {compiled_action}")
        except Exception as e:
            print(f"[{task_id}] Compiler Failed: {e}. Falling back to basic logic.")
            
    while active_watchers.get(task_id, False):
        try:
            # Capture background window for ALL modes
            img_np = capture_window(source_hwnd)
            if img_np is not None:
                win_h, win_w, _ = img_np.shape
                
                # Ensure crop is within bounds
                crop_y1 = max(0, rel_y)
                crop_y2 = min(win_h, rel_y + h)
                crop_x1 = max(0, rel_x)
                crop_x2 = min(win_w, rel_x + w)
                
                cropped_img = img_np[crop_y1:crop_y2, crop_x1:crop_x2]
                
                if cropped_img.size > 0:
                    results = global_reader.readtext(cropped_img, detail=0, workers=0)
                    
                    if mode == "now":
                        # Semantic mapping with Gemini!
                        extracted_text = " ".join(results)
                        print(f"[{task_id}] Mode=Now. OCR Extracted: '{extracted_text}'")
                        print(f"[{task_id}] Asking Gemini to map data based on intent: '{action_text}'")
                        
                        import cv2
                        import numpy as np
                        target_text = ""
                        try:
                            # Use relative capture on target_hwnd instead of pyautogui
                            t_img_np = capture_window(target_hwnd)
                            if t_img_np is not None:
                                t_orig_left, t_orig_top, _, _ = win32gui.GetWindowRect(target_hwnd)
                                t_rel_x = target_bbox['x'] - t_orig_left
                                t_rel_y = target_bbox['y'] - t_orig_top
                                
                                t_win_h, t_win_w, _ = t_img_np.shape
                                t_crop_y1 = max(0, t_rel_y)
                                t_crop_y2 = min(t_win_h, t_rel_y + target_bbox['h'])
                                t_crop_x1 = max(0, t_rel_x)
                                t_crop_x2 = min(t_win_w, t_rel_x + target_bbox['w'])
                                
                                t_crop = t_img_np[t_crop_y1:t_crop_y2, t_crop_x1:t_crop_x2]
                                if t_crop.size > 0:
                                    target_results = global_reader.readtext(t_crop, detail=0, workers=0)
                                    target_text = " ".join(target_results)
                                    print(f"[{task_id}] Target Form Labels Extracted: '{target_text}'")
                        except Exception as e:
                            print(f"[{task_id}] Failed to read target form: {e}")
                        
                        prompt = f"""
You are an expert data extraction agent.
The user's intent is: "{action_text}"

Here is the unstructured text from the SOURCE:
{extracted_text}

Here are the input field labels found in the TARGET form (in order):
{target_text}

Map the source data to these target fields. 
Return EXACTLY AND ONLY a valid JSON array of strings containing the values in the exact order of the target fields.
If a field has no matching data in the source, use an empty string "" for that value.
Do not wrap it in markdown block quotes. Just the raw JSON array.
Example output: ["Alexander Wright", "awright.dev@example.com", "Stanford University"]
"""
                        try:
                            import requests
                            API_BASE_URL = "https://api.cloudflare.com/client/v4/accounts/895f8c7b633eccf9438f9c233b93049b/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast"
                            headers = {"Authorization": "Bearer cfut_2KqZpUwpIsNcHK4jkgrc7mH6PuKSaubdYhD2Rmad50d12dbc"}
                            inputs = {
                              "max_tokens": 1000,
                              "messages": [
                                {"role": "system", "content": "You are a rigid data mapping API. You ONLY output valid JSON arrays like [\"val1\", \"val2\"]. Never output plain text."},
                                {"role": "user", "content": prompt + "\n\nRespond with the JSON array now:"}
                              ]
                            }
                            response = requests.post(API_BASE_URL, headers=headers, json=inputs)
                            result = response.json()
                            import json
                            resp_val = result.get("result", {}).get("response", "")
                            if isinstance(resp_val, list):
                                raw_output = json.dumps(resp_val)
                            else:
                                raw_output = str(resp_val).strip()
                            print(f"[{task_id}] Cloudflare Llama3 Response: {raw_output}")
                            
                            raw_output = raw_output.strip()
                            if raw_output.startswith("```json"):
                                raw_output = raw_output[7:]
                            if raw_output.startswith("```"):
                                raw_output = raw_output[3:]
                            if raw_output.endswith("```"):
                                raw_output = raw_output[:-3]
                            raw_output = raw_output.strip()
                            
                            # COMPUTER VISION AUTO-AIM (GUI Element Detection)
                            import cv2
                            tx, ty = target_bbox['x'] + target_bbox['w'] // 2, target_bbox['y'] + target_bbox['h'] // 2
                            
                            try:
                                t_img_np = capture_window(target_hwnd)
                                if t_img_np is not None:
                                    t_orig_left, t_orig_top, _, _ = win32gui.GetWindowRect(target_hwnd)
                                    t_rel_x = target_bbox['x'] - t_orig_left
                                    t_rel_y = target_bbox['y'] - t_orig_top
                                    
                                    t_win_h, t_win_w, _ = t_img_np.shape
                                    t_crop_y1 = max(0, t_rel_y)
                                    t_crop_y2 = min(t_win_h, t_rel_y + target_bbox['h'])
                                    t_crop_x1 = max(0, t_rel_x)
                                    t_crop_x2 = min(t_win_w, t_rel_x + target_bbox['w'])
                                    
                                    t_crop = t_img_np[t_crop_y1:t_crop_y2, t_crop_x1:t_crop_x2]
                                    
                                    if t_crop.size > 0:
                                        gray = cv2.cvtColor(t_crop, cv2.COLOR_BGR2GRAY)
                                        # Use very low thresholds for dark mode UI
                                        edges = cv2.Canny(gray, 10, 30)
                                        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                                        
                                        input_fields = []
                                        for cnt in contours:
                                            rx, ry, rw, rh = cv2.boundingRect(cnt)
                                            area = rw * rh
                                            # Looking for input fields: typical height 25-80px, wide enough
                                            if area > 1000 and 25 < rh < 80 and rw > 100:
                                                input_fields.append((rx, ry, rw, rh))
                                                
                                        if input_fields:
                                            input_fields.sort(key=lambda f: (f[1], f[0]))
                                            rx, ry, rw, rh = input_fields[0]
                                            # tx, ty are relative to screen. t_crop was relative to target_bbox.
                                            tx = target_bbox['x'] + rx + rw // 2
                                            ty = target_bbox['y'] + ry + rh // 2
                                            print(f"[{task_id}] CV Auto-Aim engaged! Shifted click to exact FIRST input box.")
                                        else:
                                            print(f"[{task_id}] CV Auto-Aim failed to find contour. Falling back to center of target box.")
                                            # Fallback to center of the target box
                                            tx = target_bbox['x'] + target_bbox['w'] // 2
                                            ty = target_bbox['y'] + target_bbox['h'] // 2
                            except Exception as e:
                                print(f"[{task_id}] CV Auto-Aim failed: {e}")
                            
                            # Headless Background Click and Type
                            click_and_type_background(target_hwnd, tx, ty, "")
                            time.sleep(0.8)
                            
                            if raw_output.startswith('[') and raw_output.endswith(']'):
                                values_to_type = json.loads(raw_output)
                                print(f"[{task_id}] Final values to type: {values_to_type}")
                                for i, val in enumerate(values_to_type):
                                    # Write directly using headless keyboard message queue injection
                                    click_and_type_background(target_hwnd, None, None, str(val))
                                    if i < len(values_to_type) - 1:
                                        time.sleep(0.1)
                                        click_and_type_background(target_hwnd, None, None, '\t')
                                        time.sleep(0.15)
                            else:
                                print(f"[{task_id}] Fallback raw paste")
                                click_and_type_background(target_hwnd, None, None, raw_output)
                                    
                        except Exception as e:
                            print(f"[{task_id}] Extraction Error: {e}")
                            
                        active_watchers[task_id] = False
                        break
                    
                    # For 'when' and 'always' modes
                    extracted_text_lower = " ".join(results).lower().strip()
                    print(f"[{task_id}] OCR Saw: '{extracted_text_lower}'")
                    
                    is_condition_met = False
                    
                    if compiled_condition:
                        try:
                            # Evaluate the LLM-compiled python lambda!
                            is_condition_met = eval(compiled_condition, {"__builtins__": {}}, {"curr": extracted_text_lower, "prev": last_extracted_text})
                        except Exception as e:
                            print(f"[{task_id}] Compiled condition eval failed: {e}")
                    else:
                        # Fallback basic logic
                        cond_clean = condition.lower().strip()
                        state_change_phrases = ["it changes", "when it changes", "new text arrives", "when new text arrives", "a new text arrives", "when a new text arrives"]
                        if cond_clean in state_change_phrases:
                            if last_extracted_text is not None and extracted_text_lower != last_extracted_text and extracted_text_lower != "":
                                is_condition_met = True
                        elif cond_clean in extracted_text_lower:
                            is_condition_met = True
                            
                    last_extracted_text = extracted_text_lower
                    
                    if is_condition_met:
                        print(f"[{task_id}] CONDITION MET! Firing Background Strike!")
                        print(f"[{task_id}] Firing invisible background strike at {tx}, {ty}")
                        
                        if compiled_action:
                            # Execute the LLM-compiled action sequence
                            for act in compiled_action:
                                if act.get("type") == "text":
                                    click_and_type_background(target_hwnd, tx, ty, act.get("value", ""))
                                elif act.get("type") == "key":
                                    k = act.get("value", "").lower()
                                    if k == "enter":
                                        click_and_type_background(target_hwnd, tx, ty, "\n")
                                    elif k == "tab":
                                        click_and_type_background(target_hwnd, tx, ty, "\t")
                                time.sleep(0.1)
                        else:
                            # Fallback basic logic
                            final_action = action_text
                            if final_action.lower().endswith(" and send it"):
                                final_action = final_action[:-12].strip() + "\n"
                            click_and_type_background(target_hwnd, tx, ty, final_action)
                        
                        if mode == "always":
                            print(f"[{task_id}] Mode=Always. Entering 5-second cooldown before looping...")
                            time.sleep(5)
                            # Do not break, keep looping
                        else:
                            active_watchers[task_id] = False
                            break
        except Exception as e:
            print(f"[{task_id}] Error: {e}")
        time.sleep(0.5)

def start_watcher(task_id, source_bbox, target_bbox, condition, action_text, mode):
    active_watchers[task_id] = True
    t = threading.Thread(target=watch_loop_full, args=(task_id, source_bbox, target_bbox, condition, action_text, mode), daemon=True)
    t.start()
    return t

def stop_watcher(task_id: str):
    if task_id in active_watchers:
        active_watchers[task_id] = False
