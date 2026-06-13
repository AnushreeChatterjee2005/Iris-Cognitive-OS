import time
import win32gui
import win32api
import win32con

def get_window_hwnd(title):
    return win32gui.FindWindow(None, title)

def click_and_type_background(hwnd, screen_x, screen_y, text_or_key):
    try:
        if screen_x is not None and screen_y is not None:
            client_point = win32gui.ScreenToClient(hwnd, (screen_x, screen_y))
            lparam = win32api.MAKELONG(client_point[0], client_point[1])
            
            win32api.PostMessage(hwnd, win32con.WM_LBUTTONDOWN, win32con.MK_LBUTTON, lparam)
            time.sleep(0.05)
            win32api.PostMessage(hwnd, win32con.WM_LBUTTONUP, 0, lparam)
            time.sleep(0.1)
        win32api.SendMessage(hwnd, win32con.WM_ACTIVATE, win32con.WA_ACTIVE, 0)
        win32api.SendMessage(hwnd, win32con.WM_SETFOCUS, 0, 0)
        return True
    except Exception as e:
        print(f"Background click failed: {e}")
        return False

def main():
    hwnd = get_window_hwnd("RPG Auto-Healer Demo")
    if not hwnd:
        print("Demo window not found!")
        return
        
    rect = win32gui.GetWindowRect(hwnd)
    # The Heal Player button is roughly at (width*0.75, height/2) in the test script
    width = rect[2] - rect[0]
    height = rect[3] - rect[1]
    
    target_x = rect[0] + int(width * 0.75)
    target_y = rect[1] + int(height / 2)
    
    print(f"Clicking at {target_x}, {target_y} on HWND {hwnd}...")
    click_and_type_background(hwnd, target_x, target_y, None)

if __name__ == "__main__":
    main()
