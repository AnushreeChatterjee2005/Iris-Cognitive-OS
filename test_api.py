import requests
import json
import time
import win32gui

def get_window_hwnd(title):
    hwnd = win32gui.FindWindow(None, title)
    return hwnd

def main():
    hwnd = get_window_hwnd("RPG Auto-Healer Demo")
    if not hwnd:
        print("Demo window not found!")
        return
        
    rect = win32gui.GetWindowRect(hwnd)
    left, top, right, bottom = rect
    
    # Assume source box is left side, target box is right side
    w = right - left
    h = bottom - top
    
    source_bbox = {"x": left + 50, "y": top + 150, "w": 200, "h": 100}
    target_bbox = {"x": left + 400, "y": top + 150, "w": 200, "h": 100}
    
    payload = {
        "source_bbox": source_bbox,
        "target_bbox": target_bbox,
        "condition": "when hp drops below 30",
        "action_text": "click the heal button",
        "mode": "when"
    }
    
    print("Sending API request to watcher...")
    try:
        response = requests.post("http://127.0.0.1:8000/api/watch-and-strike", json=payload)
        print("Response:", response.json())
    except Exception as e:
        print("API Error:", e)

if __name__ == "__main__":
    main()
