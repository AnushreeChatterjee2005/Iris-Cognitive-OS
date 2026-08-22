import win32gui
import win32api

def is_real_window(hwnd):
    """
    Check if a window is a "real" window that should be tiled.
    - Must be visible
    - Must have a title
    - Must not be a tooltip or other special window
    """
    if not win32gui.IsWindowVisible(hwnd):
        return False
    if win32gui.GetWindowText(hwnd) == "":
        return False
    if win32gui.GetParent(hwnd) != 0:
        return False
    
    # Exclude special windows like the taskbar
    class_name = win32gui.GetClassName(hwnd)
    if class_name in ["Shell_TrayWnd", "NotifyIconOverflowWindow"]:
        return False
        
    # Exclude small, non-app windows
    _, _, width, height = win32gui.GetWindowRect(hwnd)
    if width < 200 or height < 150:
        return False

    return True

def get_all_windows():
    """
    Get all valid, non-minimized windows.
    """
    windows = []
    def callback(hwnd, _):
        if is_real_window(hwnd) and not win32gui.IsIconic(hwnd):
            windows.append(hwnd)
        return True
    
    win32gui.EnumWindows(callback, None)
    return windows

def tile_windows_grid():
    """
    Arranges all "real" windows into a grid.
    """
    windows = get_all_windows()
    if not windows:
        print("No windows to tile.")
        return

    monitor_info = win32api.GetMonitorInfo(win32api.MonitorFromPoint((0,0)))
    work_area = monitor_info.get("Work")
    screen_width = work_area[2] - work_area[0]
    screen_height = work_area[3] - work_area[1]

    num_windows = len(windows)
    
    # For simplicity, we'll aim for a layout that is roughly square.
    cols = int(num_windows**0.5)
    rows = (num_windows + cols - 1) // cols

    win_width = screen_width // cols
    win_height = screen_height // rows
    
    print(f"Tiling {num_windows} windows into a {rows}x{cols} grid.")
    print(f"Screen size: {screen_width}x{screen_height}")
    print(f"Tile size: {win_width}x{win_height}")

    for i, hwnd in enumerate(windows):
        row = i // cols
        col = i % cols
        x = work_area[0] + col * win_width
        y = work_area[1] + row * win_height
        
        # Restore window if it's maximized to allow resizing
        win32gui.ShowWindow(hwnd, 9) # SW_RESTORE
        win32gui.MoveWindow(hwnd, x, y, win_width, win_height, True)

if __name__ == '__main__':
    print("Running window tiler...")
    tile_windows_grid()
    print("Tiling complete.")
