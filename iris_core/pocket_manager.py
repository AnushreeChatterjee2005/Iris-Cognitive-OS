import ctypes
import win32gui
import win32con
import win32api
import time

try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except Exception:
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass

pocketed_sessions = {}

def get_screen_dimensions():
    w = win32api.GetSystemMetrics(win32con.SM_CXSCREEN)
    h = win32api.GetSystemMetrics(win32con.SM_CYSCREEN)
    return w, h

def pocket_windows(task_id: str, hwnds: list, box_w: int = 340, box_h: int = 240, margin: int = 20):
    if not hwnds:
        return False
    screen_w, screen_h = get_screen_dimensions()
    target_x = screen_w - box_w - margin
    target_y = margin
    pocketed_sessions[task_id] = {}
    for i, hwnd in enumerate(hwnds):
        if not win32gui.IsWindow(hwnd):
            continue
        rect = win32gui.GetWindowRect(hwnd)
        style = win32gui.GetWindowLong(hwnd, win32con.GWL_STYLE)
        exstyle = win32gui.GetWindowLong(hwnd, win32con.GWL_EXSTYLE)
        pocketed_sessions[task_id][hwnd] = {'rect': rect, 'style': style, 'exstyle': exstyle}
        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
        if len(hwnds) == 2:
            sub_w = box_w // 2
            sub_x = target_x + (i * sub_w)
            win32gui.SetWindowPos(hwnd, win32con.HWND_TOPMOST, sub_x, target_y, sub_w, box_h, win32con.SWP_SHOWWINDOW | win32con.SWP_NOACTIVATE | win32con.SWP_FRAMECHANGED)
        else:
            win32gui.SetWindowPos(hwnd, win32con.HWND_TOPMOST, target_x, target_y, box_w, box_h, win32con.SWP_SHOWWINDOW | win32con.SWP_NOACTIVATE | win32con.SWP_FRAMECHANGED)
    return True

def restore_windows(task_id: str = None):
    if not task_id:
        for tid in list(pocketed_sessions.keys()):
            restore_windows(tid)
        return True
    session_windows = pocketed_sessions.pop(task_id, {})
    for hwnd, data in session_windows.items():
        try:
            if win32gui.IsWindow(hwnd):
                r = data['rect']
                w = r[2] - r[0]
                h = r[3] - r[1]
                win32gui.SetWindowPos(hwnd, win32con.HWND_NOTOPMOST, r[0], r[1], w, h, win32con.SWP_SHOWWINDOW | win32con.SWP_FRAMECHANGED)
                win32gui.SetForegroundWindow(hwnd)
        except Exception as e:
            print(f'[PocketManager] Error restoring hwnd {hwnd}: {e}')
    return True

def inject_pocket_click(hwnd: int, rel_x: int, rel_y: int):
    lParam = win32api.MAKELONG(rel_x, rel_y)
    win32gui.PostMessage(hwnd, win32con.WM_LBUTTONDOWN, win32con.MK_LBUTTON, lParam)
    time.sleep(0.05)
    win32gui.PostMessage(hwnd, win32con.WM_LBUTTONUP, 0, lParam)

def inject_pocket_text(hwnd: int, text: str):
    for char in text:
        if char == '\n':
            win32gui.PostMessage(hwnd, win32con.WM_KEYDOWN, win32con.VK_RETURN, 0)
            win32gui.PostMessage(hwnd, win32con.WM_KEYUP, win32con.VK_RETURN, 0)
        elif char == '\t':
            win32gui.PostMessage(hwnd, win32con.WM_KEYDOWN, win32con.VK_TAB, 0)
            win32gui.PostMessage(hwnd, win32con.WM_KEYUP, win32con.VK_TAB, 0)
        else:
            win32gui.PostMessage(hwnd, win32con.WM_CHAR, ord(char), 0)
        time.sleep(0.01)
