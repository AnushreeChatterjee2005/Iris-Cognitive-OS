import win32gui
import win32api
import win32con
import time

def find_chrome():
    # Find Workday or any Chrome window
    hwnd = win32gui.FindWindowEx(0, 0, "Chrome_WidgetWin_1", None)
    return hwnd

def type_bg():
    hwnd = find_chrome()
    if not hwnd:
        print("Chrome not found")
        return
        
    print(f"Found Chrome HWND: {hwnd}")
    
    # Wait for user to minimize or unfocus Chrome
    print("Please UNFOCUS Chrome (click away) now... you have 3 seconds")
    time.sleep(3)
    
    text = "HelloBackground"
    for char in text:
        vk_code = win32api.VkKeyScan(char) & 0xFF
        win32api.SendMessage(hwnd, win32con.WM_KEYDOWN, vk_code, 1)
        win32api.SendMessage(hwnd, win32con.WM_CHAR, ord(char), 1)
        win32api.SendMessage(hwnd, win32con.WM_KEYUP, vk_code, 0xC0000001)
        time.sleep(0.01)
        
    print("Done")

if __name__ == "__main__":
    type_bg()
