"""
IRIS Core: Multimodal Screen Vision & Element Coordinate Grounding Engine
Scans the active desktop/window screen, detects UI elements (buttons, inputs, icons, labels),
and returns exact screen pixel bounding box coordinates [x, y, width, height, center_x, center_y].
"""

import os
import io
import base64
import json
import math
import re
from dataclasses import dataclass
from typing import Optional, Dict, Any, List, Tuple
from PIL import Image
import numpy as np

import warnings
warnings.filterwarnings("ignore")

# OpenAI vision client for VLM spatial grounding
try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

# Optional desktop click dependency; semantic UI Automation is imported below.
try:
    import pyautogui
except ImportError:
    pyautogui = None

import uia_engine


@dataclass(frozen=True)
class ScreenCapture:
    image: Image.Image
    left: int
    top: int
    width: int
    height: int


def capture_screen_context() -> Optional[ScreenCapture]:
    """Capture the virtual desktop and preserve negative multi-monitor origins."""
    try:
        from PIL import ImageGrab
        import win32api
        import win32con

        left = win32api.GetSystemMetrics(win32con.SM_XVIRTUALSCREEN)
        top = win32api.GetSystemMetrics(win32con.SM_YVIRTUALSCREEN)
        width = win32api.GetSystemMetrics(win32con.SM_CXVIRTUALSCREEN)
        height = win32api.GetSystemMetrics(win32con.SM_CYVIRTUALSCREEN)
        image = ImageGrab.grab(all_screens=True)
        if width > 0 and height > 0 and image.width > 0 and image.height > 0:
            return ScreenCapture(image=image, left=left, top=top, width=width, height=height)
    except Exception:
        pass
    if pyautogui:
        image = pyautogui.screenshot()
        return ScreenCapture(image=image, left=0, top=0, width=image.width, height=image.height)
    return None


def capture_screen_image() -> Tuple[Optional[Image.Image], int, int]:
    """
    Captures full screen or foreground window as a PIL Image.
    Returns (PIL_Image, width, height).
    """
    capture = capture_screen_context()
    if capture:
        return capture.image, capture.image.width, capture.image.height
    return None, 0, 0


def normalized_box_to_screen(
    data: Dict[str, Any],
    capture: ScreenCapture,
    *,
    min_confidence: float = 0.55,
    min_size_pixels: int = 4,
    max_area_ratio: float = 0.85,
) -> Optional[Dict[str, Any]]:
    """Validate, clamp, and convert a 1000-grid box into virtual-screen coordinates."""
    if data.get("found") is not True:
        return None
    names = ("x_min", "y_min", "x_max", "y_max")
    values = [data.get(name) for name in names]
    if any(isinstance(value, bool) or not isinstance(value, (int, float)) for value in values):
        return None
    if not all(math.isfinite(float(value)) for value in values):
        return None
    confidence = data.get("confidence", 0.0)
    if isinstance(confidence, bool) or not isinstance(confidence, (int, float)) or not math.isfinite(float(confidence)):
        return None
    confidence = float(confidence)
    if confidence < min_confidence or confidence > 1.0:
        return None

    raw_x_min, raw_y_min, raw_x_max, raw_y_max = [float(value) for value in values]
    if any(value < -50 or value > 1050 for value in (raw_x_min, raw_y_min, raw_x_max, raw_y_max)):
        return None
    x_min = max(0.0, min(1000.0, raw_x_min))
    y_min = max(0.0, min(1000.0, raw_y_min))
    x_max = max(0.0, min(1000.0, raw_x_max))
    y_max = max(0.0, min(1000.0, raw_y_max))
    if x_max <= x_min or y_max <= y_min:
        return None

    left = capture.left + round((x_min / 1000.0) * capture.width)
    top = capture.top + round((y_min / 1000.0) * capture.height)
    right = capture.left + round((x_max / 1000.0) * capture.width)
    bottom = capture.top + round((y_max / 1000.0) * capture.height)
    width = right - left
    height = bottom - top
    if width < min_size_pixels or height < min_size_pixels:
        return None
    if (width * height) / max(1, capture.width * capture.height) > max_area_ratio:
        return None
    return {
        "x": left,
        "y": top,
        "width": width,
        "height": height,
        "center_x": left + width // 2,
        "center_y": top + height // 2,
        "confidence": confidence,
        "normalized_box": {"x_min": x_min, "y_min": y_min, "x_max": x_max, "y_max": y_max},
    }


def _image_data_url(img: Image.Image) -> str:
    buffer = io.BytesIO()
    img.convert("RGB").save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def _load_openai_key(api_key: Optional[str] = None) -> Optional[str]:
    try:
        from dotenv import load_dotenv
        load_dotenv(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env")), override=False)
    except Exception:
        pass

    active_key = api_key or os.environ.get("OPENAI_API_KEY")
    return active_key.strip() if active_key and active_key.strip() else None


def detect_element_with_uia(element_label: str) -> Optional[Dict[str, Any]]:
    """
    Fast Path 1 (~2ms): Native Windows UI Automation accessibility tree search.
    Finds exact bounding rectangle (left, top, right, bottom) for native buttons & controls.
    """
    try:
        ctrl = uia_engine.get_window_control_by_name(element_label)
        if ctrl:
            rect = ctrl.BoundingRectangle
            if rect and (rect.right > rect.left) and (rect.bottom > rect.top):
                left, top, right, bottom = rect.left, rect.top, rect.right, rect.bottom
                w = right - left
                h = bottom - top
                cx = left + w // 2
                cy = top + h // 2
                return {
                    "source": "UIA_Accessibility",
                    "label": element_label,
                    "x": left,
                    "y": top,
                    "width": w,
                    "height": h,
                    "center_x": cx,
                    "center_y": cy
                }
    except Exception:
        pass
    return None


def detect_element_with_vlm_vision(
    target_description: str,
    api_key: Optional[str] = None,
    timeout_seconds: float = 12.0,
) -> Optional[Dict[str, Any]]:
    """
    Vision Path 3: Multimodal VLM grounding using the OpenAI Responses API.
    Detects non-text buttons, icons, custom canvas components, and visual UI controls.
    Returns exact screen pixel bounding box [x, y, width, height, center_x, center_y].
    """
    if OpenAI is None:
        print("[VisionGrounding] OpenAI SDK is not installed.")
        return None

    key = _load_openai_key(api_key)
    if not key:
        print("[VisionGrounding] OPENAI_API_KEY is not configured.")
        return None

    capture = capture_screen_context()
    if not capture:
        return None
    img = capture.image

    try:
        image_data_url = _image_data_url(img)

        prompt = f"""You are a Screen Vision Spatial Grounding Engine.
Locate the target element described as: "{target_description}" in the provided screenshot image.
If the target is not clearly visible, return {{"found": false}}. Do not guess coordinates.
Return ONLY valid JSON with named normalized coordinates on a 1000x1000 grid.
Coordinates must bound the target itself, not its surrounding card or section:
{{
  "found": true,
  "element_name": "{target_description}",
  "x_min": 0,
  "y_min": 0,
  "x_max": 0,
  "y_max": 0,
  "confidence": 0.0
}}
"""

        client = OpenAI(api_key=key, timeout=max(1.0, min(float(timeout_seconds), 30.0)), max_retries=1)
        model_name = os.environ.get("OPENAI_VISION_MODEL", "gpt-4o")
        schema = {
            "type": "object",
            "properties": {
                "found": {"type": "boolean"},
                "element_name": {"type": "string"},
                "x_min": {"type": "number"},
                "y_min": {"type": "number"},
                "x_max": {"type": "number"},
                "y_max": {"type": "number"},
                "confidence": {"type": "number"},
            },
            "required": ["found", "element_name", "x_min", "y_min", "x_max", "y_max", "confidence"],
            "additionalProperties": False,
        }
        response = client.responses.create(
            model=model_name,
            input=[{
                "role": "user",
                "content": [
                    {"type": "input_text", "text": prompt},
                    {"type": "input_image", "image_url": image_data_url, "detail": "high"}
                ]
            }],
            text={"format": {"type": "json_schema", "name": "screen_element", "schema": schema, "strict": True}},
            max_output_tokens=300,
            store=False,
        )
        text_out = (response.output_text or "").strip()
        if os.environ.get("IRIS_VISION_DEBUG") == "1":
            print(f"[VisionGrounding] Raw grounding response: {text_out}")

        data = json.loads(text_out)
        converted = normalized_box_to_screen(data, capture)
        if converted:
            return {"source": "OpenAI_VLM_Vision", "description": target_description, **converted}
    except Exception as exc:
        print(f"[VisionGrounding] OpenAI grounding failed: {exc}")
        pass
    return None


def verify_screen_state_with_vlm(expected_state: str, api_key: Optional[str] = None) -> Dict[str, Any]:
    """Use OpenAI vision to verify a visible UI outcome without OCR or fixed coordinates."""
    if OpenAI is None:
        return {"verified": False, "confidence": 0.0, "evidence": "OpenAI SDK is unavailable."}

    key = _load_openai_key(api_key)
    if not key:
        return {"verified": False, "confidence": 0.0, "evidence": "OPENAI_API_KEY is not configured."}

    img, width, height = capture_screen_image()
    if not img or width <= 0 or height <= 0:
        return {"verified": False, "confidence": 0.0, "evidence": "Screen capture failed."}

    prompt = f"""Inspect this screenshot and verify this UI state: "{expected_state}".
Use only visible evidence in the screenshot. Do not assume an action succeeded.
Return ONLY JSON:
{{"verified": true, "confidence": 0.0, "evidence": "brief visible evidence"}}
Set verified to false when the evidence is absent or ambiguous.
"""

    try:
        client = OpenAI(api_key=key, timeout=12.0, max_retries=1)
        schema = {
            "type": "object",
            "properties": {
                "verified": {"type": "boolean"},
                "confidence": {"type": "number"},
                "evidence": {"type": "string"},
            },
            "required": ["verified", "confidence", "evidence"],
            "additionalProperties": False,
        }
        response = client.responses.create(
            model=os.environ.get("OPENAI_VISION_MODEL", "gpt-4o"),
            input=[{
                "role": "user",
                "content": [
                    {"type": "input_text", "text": prompt},
                    {"type": "input_image", "image_url": _image_data_url(img), "detail": "high"},
                ],
            }],
            text={"format": {"type": "json_schema", "name": "screen_state", "schema": schema, "strict": True}},
            max_output_tokens=250,
            store=False,
        )
        data = json.loads((response.output_text or "").strip())
        confidence = data.get("confidence", 0.0)
        try:
            confidence = max(0.0, min(1.0, float(confidence)))
        except (TypeError, ValueError):
            confidence = 0.0
        return {
            "verified": bool(data.get("verified")) and confidence >= 0.6,
            "confidence": confidence,
            "evidence": str(data.get("evidence", ""))[:500],
        }
    except Exception as exc:
        print(f"[VisionGrounding] OpenAI state verification failed: {exc}")
        return {"verified": False, "confidence": 0.0, "evidence": str(exc)}


def locate_screen_element(target: str, api_key: Optional[str] = None) -> Dict[str, Any]:
    """
    Screen grounding pipeline:
    1. Try Windows UI Automation (fast semantic targeting)
    2. Use OpenAI Vision for visual UI grounding
    """
    # 1. Try UIA Accessibility
    res = detect_element_with_uia(target)
    if res:
        return res

    # 2. Use OpenAI Multimodal Vision
    res = detect_element_with_vlm_vision(target, api_key=api_key)
    if res:
        return res

    return {
        "status": "NOT_FOUND",
        "target": target,
        "message": f"Could not ground screen coordinates for element '{target}'"
    }
