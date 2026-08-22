"""
IRIS Core: OCR Spatial Grounding Engine
Provides memory-resident, lightning-fast OCR detection, coordinate grounding,
and screen text extraction without cloud vision API calls.
"""

import sys
import time
import threading
import numpy as np
import warnings
import win32gui
import win32ui
import win32con
import win32api
from ctypes import windll
import win32_engine

warnings.filterwarnings("ignore", category=UserWarning)

try:
    import easyocr
except ImportError:
    easyocr = None

_reader_lock = threading.Lock()
_global_reader = None

def get_ocr_reader():
    """Initializes and returns the singleton EasyOCR reader."""
    global _global_reader
    if _global_reader is None:
        with _reader_lock:
            if _global_reader is None and easyocr is not None:
                try:
                    import torch
                    torch.set_num_threads(2)
                except Exception:
                    pass
                _global_reader = easyocr.Reader(['en'], gpu=False, verbose=False)
    return _global_reader

def capture_window_gdi(hwnd):
    """
    Captures window pixels using PrintWindow / GDI. Works for background / non-foreground HWNDs.
    """
    if not hwnd or not win32gui.IsWindow(hwnd):
        return None
    try:
        left, top, right, bottom = win32gui.GetWindowRect(hwnd)
        width = right - left
        height = bottom - top
        if width <= 0 or height <= 0:
            return None

        hwndDC = win32gui.GetWindowDC(hwnd)
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

        win32gui.DeleteObject(saveBitMap.GetHandle())
        saveDC.DeleteDC()
        mfcDC.DeleteDC()
        win32gui.ReleaseDC(hwnd, hwndDC)

        if result == 1 and img is not None:
            # Convert BGRA to RGB
            return img[:, :, [2, 1, 0]]
    except Exception:
        pass
    return None

def capture_screen_np(hwnd=0, bbox=None):
    """
    Captures the specified window (or full screen if hwnd=0) as an RGB numpy array.
    Optionally crops to bbox: {'x', 'y', 'w', 'h'}.
    """
    win32_engine.ensure_interactive_desktop()
    
    # 1. If specific HWND, attempt GDI PrintWindow first
    if hwnd != 0:
        gdi_img = capture_window_gdi(hwnd)
        if gdi_img is not None:
            if bbox:
                h, w, _ = gdi_img.shape
                bx, by, bw, bh = int(bbox.get('x', 0)), int(bbox.get('y', 0)), int(bbox.get('w', w)), int(bbox.get('h', h))
                return gdi_img[max(0, by):min(h, by + bh), max(0, bx):min(w, bx + bw)]
            return gdi_img

    # 2. PyAutoGUI / PIL Fallback
    try:
        import pyautogui
        if hwnd != 0:
            left, top, right, bottom = win32gui.GetWindowRect(hwnd)
            w, h = right - left, bottom - top
            if w > 0 and h > 0:
                img = pyautogui.screenshot(region=(left, top, w, h))
                img_np = np.array(img)
                if bbox:
                    bx, by, bw, bh = int(bbox.get('x', 0)), int(bbox.get('y', 0)), int(bbox.get('w', w)), int(bbox.get('h', h))
                    return img_np[max(0, by):min(h, by + bh), max(0, bx):min(w, bx + bw)]
                return img_np
        
        # Full screen capture
        if bbox:
            bx, by, bw, bh = int(bbox.get('x', 0)), int(bbox.get('y', 0)), int(bbox.get('w', 100)), int(bbox.get('h', 100))
            img = pyautogui.screenshot(region=(bx, by, bw, bh))
        else:
            img = pyautogui.screenshot()
        return np.array(img)
    except Exception as e:
        pass

    return None

def extract_screen_text(hwnd=0, bbox=None, detail=0):
    """
    Extracts all visible text from the screen or specific window / ROI.
    Returns plain string if detail=0, or list of (bbox, text, prob) if detail=1.
    """
    reader = get_ocr_reader()
    if not reader:
        return "" if detail == 0 else []

    img_np = capture_screen_np(hwnd, bbox)
    if img_np is None or img_np.size == 0:
        return "" if detail == 0 else []

    try:
        results = reader.readtext(img_np, detail=detail, workers=0)
        if detail == 0:
            return " ".join(results).strip()
        return results
    except Exception as e:
        print(f"[OCR] Extraction error: {e}")
        return "" if detail == 0 else []

def find_text_coordinates(target_text: str, hwnd=0, offset_x=0, offset_y=0, fuzzy_threshold=0.6):
    """
    Searches for target_text on the screen or window.
    Returns the screen center coordinates (cx, cy), bounding box, and matched text.
    If not found, returns None.
    """
    if not target_text:
        return None

    reader = get_ocr_reader()
    if not reader:
        return None

    img_np = capture_screen_np(hwnd)
    if img_np is None or img_np.size == 0:
        return None

    screen_offset_x = offset_x
    screen_offset_y = offset_y
    if hwnd != 0:
        try:
            rect = win32gui.GetWindowRect(hwnd)
            screen_offset_x += rect[0]
            screen_offset_y += rect[1]
        except Exception:
            pass

    try:
        results = reader.readtext(img_np, detail=1, workers=0)
        target_lower = target_text.lower().strip()
        target_tokens = set(target_lower.split())

        best_match = None
        best_score = 0.0

        for (box, text, prob) in results:
            text_lower = text.lower().strip()
            score = 0.0

            # Exact substring match
            if target_lower in text_lower:
                score = 1.0 + (len(target_lower) / max(1, len(text_lower)))
            elif text_lower in target_lower:
                score = 0.9 + (len(text_lower) / max(1, len(target_lower)))
            else:
                # Token overlap match
                tokens = set(text_lower.split())
                overlap = tokens.intersection(target_tokens)
                if overlap:
                    score = len(overlap) / max(1, len(target_tokens))

            if score > best_score and score >= fuzzy_threshold:
                best_score = score
                x1, y1 = box[0]
                x2, y2 = box[2]
                cx = int((x1 + x2) / 2) + screen_offset_x
                cy = int((y1 + y2) / 2) + screen_offset_y
                best_match = {
                    "cx": cx,
                    "cy": cy,
                    "x": int(x1) + screen_offset_x,
                    "y": int(y1) + screen_offset_y,
                    "w": int(x2 - x1),
                    "h": int(y2 - y1),
                    "text": text,
                    "confidence": prob,
                    "score": score
                }
                if score >= 1.0:
                    break

        return best_match
    except Exception as e:
        print(f"[OCR] find_text_coordinates error: {e}")
        return None

def find_input_field_near_label(label_text: str, hwnd=0):
    """
    Locates a label (e.g. 'Email:', 'Username:', 'Search') and estimates
    the corresponding input field coordinate directly to the right or below it.
    """
    match = find_text_coordinates(label_text, hwnd=hwnd)
    if not match:
        return None

    right_x = match["x"] + match["w"] + 40
    right_y = match["cy"]

    below_x = match["cx"]
    below_y = match["y"] + match["h"] + 25

    return {
        "label_match": match,
        "input_right": (right_x, right_y),
        "input_below": (below_x, below_y)
    }
