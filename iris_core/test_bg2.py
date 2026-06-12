import win32gui
import win32api
import win32con
import time

def type_bg():
    # Find Workday or any Chrome window
    hwnd = win32gui.FindWindowEx(0, 0, "Chrome_WidgetWin_1", None)
    if not hwnd:
        print("Chrome not found")
        return
        
    # Get the child RenderWidgetHostHWND
    child_hwnd = win32gui.FindWindowEx(hwnd, 0, "Chrome_RenderWidgetHostHWND", None)
    if not child_hwnd:
        # fallback to parent if child not found
        child_hwnd = hwnd
        
    print(f"Found Chrome HWND: {child_hwnd}")
    
    print("Please UNFOCUS Chrome (click Notepad) now... you have 3 seconds")
    time.sleep(3)
    
    # SPOOF FOCUS
    win32api.SendMessage(child_hwnd, win32con.WM_ACTIVATE, win32con.WA_ACTIVE, 0)
    win32api.SendMessage(child_hwnd, win32con.WM_SETFOCUS, 0, 0)
    
    text = "SpoofedFocusWorks!"
    for char in text:
        vk_code = win32api.VkKeyScan(char) & 0xFF
        win32api.SendMessage(child_hwnd, win32con.WM_KEYDOWN, vk_code, 1)
        win32api.SendMessage(child_hwnd, win32con.WM_CHAR, ord(char), 1)
        win32api.SendMessage(child_hwnd, win32con.WM_KEYUP, vk_code, 0xC0000001)
        time.sleep(0.01)
        
    print("Done")

if __name__ == "__main__":
    type_bg()
