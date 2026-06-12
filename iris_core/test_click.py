import win32gui
import win32api
import win32con
import time

def click_background(hwnd, x, y):
    # Convert absolute screen coordinates to window-relative coordinates
    screen_point = (x, y)
    try:
        client_point = win32gui.ScreenToClient(hwnd, screen_point)
    except Exception as e:
        print("ScreenToClient failed:", e)
        return False
        
    lparam = win32api.MAKELONG(client_point[0], client_point[1])
    print(f"Sending click to {hwnd} at relative {client_point}")
    
    win32api.PostMessage(hwnd, win32con.WM_LBUTTONDOWN, win32con.MK_LBUTTON, lparam)
    time.sleep(0.05)
    win32api.PostMessage(hwnd, win32con.WM_LBUTTONUP, 0, lparam)
    return True

def type_background(hwnd, text):
    for char in text:
        win32api.PostMessage(hwnd, win32con.WM_CHAR, ord(char), 0)
        time.sleep(0.02)

# Just test logic, no execution yet
print("Ready to background click")
