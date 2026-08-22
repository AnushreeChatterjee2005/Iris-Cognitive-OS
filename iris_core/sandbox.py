import win32api
import win32con
import win32process
import win32service
import win32gui
import win32ui
import ctypes
import numpy as np
from PIL import Image
from typing import Optional

# Global dictionary to keep references to open desktops so they aren't garbage collected
active_desktops = {}

def create_sandbox(room_name: str):
    """Creates a hidden Windows desktop and stores the handle."""
    try:
        # Create the desktop with all access
        hdesk = win32service.CreateDesktop(room_name, 0, win32con.GENERIC_ALL, None)
        active_desktops[room_name] = hdesk
        return True
    except Exception as e:
        print(f"Error creating sandbox {room_name}: {e}")
        return False

def launch_in_sandbox(room_name: str, executable: str, cmd_args: str = ""):
    """Launches a process explicitly on the hidden desktop."""
    if room_name not in active_desktops:
        return False
        
    try:
        startup = win32process.STARTUPINFO()
        startup.lpDesktop = room_name
        
        # If it's a shell command (like 'start excel'), we use cmd.exe
        if executable.lower() == "cmd":
            app = None
            cmd = f"cmd.exe /c {cmd_args}"
        else:
            app = executable
            cmd = f'"{executable}" {cmd_args}' if cmd_args else executable
            
        process_info = win32process.CreateProcess(
            app, cmd, None, None, False, 0, None, None, startup
        )
        return True
    except Exception as e:
        print(f"Error launching in sandbox {room_name}: {e}")
        return False

def create_sandbox_process(room_name: str, executable: str):
    """
    Creates the process explicitly on the hidden desktop.
    """
    try:
        hdesk = win32service.CreateDesktop(room_name, 0, win32con.MAXIMUM_ALLOWED, None)
        si = win32process.STARTUPINFO()
        si.lpDesktop = room_name
        win32process.CreateProcess(
            None, executable, None, None, False, 
            win32process.NORMAL_PRIORITY_CLASS, None, None, si
        )
        return True
    except Exception as e:
        print(f"Failed to create process: {e}")
        return False

def get_sandbox_resolution(room_name: str):
    """Returns the resolution of the hidden desktop. Defaults to main screen if unavailable."""
    # Since hidden desktops don't have physical monitors, they usually inherit the primary monitor's resolution
    # or default to 1920x1080.
    return (win32api.GetSystemMetrics(win32con.SM_CXVIRTUALSCREEN),
            win32api.GetSystemMetrics(win32con.SM_CYVIRTUALSCREEN))

import threading
from queue import Queue

def take_sandbox_screenshot(room_name: str) -> Optional[Image.Image]:
    """
    Captures a true screenshot of the hidden desktop by compositing all visible windows 
    in Z-order using PrintWindow.
    """
    if room_name not in active_desktops:
        return None
        
    hdesk = active_desktops[room_name]
    result_queue = Queue()
    
    def capture_worker():
        try:
            hdesk.SetThreadDesktop()
            
            width = win32api.GetSystemMetrics(win32con.SM_CXVIRTUALSCREEN)
            if width == 0: width = 1920
            height = win32api.GetSystemMetrics(win32con.SM_CYVIRTUALSCREEN)
            if height == 0: height = 1080
            
            base_img = Image.new('RGB', (width, height), color='black')
            windows = []
            
            def enum_cb(hwnd, ctx):
                if win32gui.IsWindowVisible(hwnd):
                    windows.append(hwnd)
                return True
                
            win32gui.EnumDesktopWindows(hdesk, enum_cb, None)
            
            for hwnd in reversed(windows):
                title = win32gui.GetWindowText(hwnd)
                # Skip system windows without titles that hang PrintWindow
                if not title.strip(): continue
                
                rect = win32gui.GetWindowRect(hwnd)
                w = rect[2] - rect[0]
                h = rect[3] - rect[1]
                if w <= 0 or h <= 0: continue
                
                hwndDC = win32gui.GetWindowDC(hwnd)
                mfcDC = win32ui.CreateDCFromHandle(hwndDC)
                saveDC = mfcDC.CreateCompatibleDC()
                
                saveBitMap = win32ui.CreateBitmap()
                saveBitMap.CreateCompatibleBitmap(mfcDC, w, h)
                old_bmp = saveDC.SelectObject(saveBitMap)
                
                res = ctypes.windll.user32.PrintWindow(hwnd, saveDC.GetSafeHdc(), 2)
                if res:
                    bmpinfo = saveBitMap.GetInfo()
                    bmpstr = saveBitMap.GetBitmapBits(True)
                    win_img = Image.frombuffer('RGB', (bmpinfo['bmWidth'], bmpinfo['bmHeight']), bmpstr, 'raw', 'BGRX', 0, 1)
                    base_img.paste(win_img, (rect[0], rect[1]))
                    
                saveDC.SelectObject(old_bmp)
                win32gui.DeleteObject(saveBitMap.GetHandle())
                saveDC.DeleteDC()
                mfcDC.DeleteDC()
                win32gui.ReleaseDC(hwnd, hwndDC)
                
            result_queue.put(base_img)
        except Exception as e:
            print(f"Failed to screenshot sandbox: {e}")
            result_queue.put(None)
            
    t = threading.Thread(target=capture_worker)
    t.daemon = True
    t.start()
    t.join(timeout=2.0)
    
    if not result_queue.empty():
        return result_queue.get()
    return None

import time

last_sandbox_hwnd = {}

def inject_sandbox_click(room_name: str, x: int, y: int, double_click=False):
    """Translates a coordinate into a window handle and injects a hardware click message."""
    if room_name not in active_desktops:
        return False
        
    hdesk = active_desktops[room_name]
    old_hdesk = win32service.GetThreadDesktop(win32api.GetCurrentThreadId())
    
    try:
        hdesk.SetThreadDesktop()
        
        # Find the window under the coordinate on the hidden desktop
        hwnd = win32gui.WindowFromPoint((x, y))
        if not hwnd:
            return False
            
        last_sandbox_hwnd[room_name] = hwnd
            
        # Convert screen coordinates to client coordinates for the specific window
        client_point = win32gui.ScreenToClient(hwnd, (x, y))
        lparam = win32api.MAKELONG(client_point[0], client_point[1])
        
        # Spoof focus
        win32api.SendMessage(hwnd, win32con.WM_ACTIVATE, win32con.WA_ACTIVE, 0)
        win32api.SendMessage(hwnd, win32con.WM_SETFOCUS, 0, 0)
        
        # Send raw click messages to the window's message queue
        win32api.PostMessage(hwnd, win32con.WM_LBUTTONDOWN, win32con.MK_LBUTTON, lparam)
        time.sleep(0.05)
        win32api.PostMessage(hwnd, win32con.WM_LBUTTONUP, 0, lparam)
        
        if double_click:
            time.sleep(0.05)
            win32api.PostMessage(hwnd, win32con.WM_LBUTTONDOWN, win32con.MK_LBUTTON, lparam)
            time.sleep(0.05)
            win32api.PostMessage(hwnd, win32con.WM_LBUTTONUP, 0, lparam)
            
        return True
    except Exception as e:
        print(f"Failed to inject click into sandbox: {e}")
        return False
    finally:
        old_hdesk.SetThreadDesktop()

def get_target_hwnd(room_name, hdesk):
    target_hwnd = last_sandbox_hwnd.get(room_name)
    if not target_hwnd or not win32gui.IsWindow(target_hwnd):
        target_hwnd = win32gui.GetForegroundWindow()
        if not target_hwnd:
            windows = []
            win32gui.EnumDesktopWindows(hdesk, lambda hwnd, ctx: ctx.append(hwnd) or True if win32gui.IsWindowVisible(hwnd) and win32gui.GetWindowText(hwnd) else True, windows)
            if windows: target_hwnd = windows[0]
        if target_hwnd:
            last_sandbox_hwnd[room_name] = target_hwnd
    return target_hwnd

def inject_sandbox_text(room_name: str, text: str):
    if not text: return True
    if room_name not in active_desktops: return False
    hdesk = active_desktops[room_name]
    old_hdesk = win32service.GetThreadDesktop(win32api.GetCurrentThreadId())
    try:
        hdesk.SetThreadDesktop()
        target_hwnd = get_target_hwnd(room_name, hdesk)
        if not target_hwnd: return False
        
        win32api.SendMessage(target_hwnd, win32con.WM_ACTIVATE, win32con.WA_ACTIVE, 0)
        win32api.SendMessage(target_hwnd, win32con.WM_SETFOCUS, 0, 0)
        
        for char in text:
            vk_code = win32api.VkKeyScan(char) & 0xFF
            win32api.PostMessage(target_hwnd, win32con.WM_KEYDOWN, vk_code, 1)
            win32api.PostMessage(target_hwnd, win32con.WM_CHAR, ord(char), 1)
            win32api.PostMessage(target_hwnd, win32con.WM_KEYUP, vk_code, 0xC0000001)
            time.sleep(0.001)
        return True
    except Exception as e:
        print(f"Failed to inject text into sandbox: {e}")
        return False
    finally:
        old_hdesk.SetThreadDesktop()

def inject_sandbox_keys(room_name: str, keys: list):
    if room_name not in active_desktops: return False
    if not keys: return True
    hdesk = active_desktops[room_name]
    old_hdesk = win32service.GetThreadDesktop(win32api.GetCurrentThreadId())
    try:
        hdesk.SetThreadDesktop()
        target_hwnd = get_target_hwnd(room_name, hdesk)
        if not target_hwnd: return False
        
        win32api.SendMessage(target_hwnd, win32con.WM_ACTIVATE, win32con.WA_ACTIVE, 0)
        win32api.SendMessage(target_hwnd, win32con.WM_SETFOCUS, 0, 0)
        
        key_map = {
            'win': win32con.VK_LWIN,
            'ctrl': win32con.VK_CONTROL,
            'alt': win32con.VK_MENU,
            'shift': win32con.VK_SHIFT,
            'enter': win32con.VK_RETURN,
            'tab': win32con.VK_TAB,
            'esc': win32con.VK_ESCAPE,
            'up': win32con.VK_UP,
            'down': win32con.VK_DOWN,
            'left': win32con.VK_LEFT,
            'right': win32con.VK_RIGHT,
            'space': win32con.VK_SPACE,
            'backspace': win32con.VK_BACK,
            'delete': win32con.VK_DELETE
        }
        
        for k in keys:
            k_lower = k.lower()
            vk = key_map.get(k_lower)
            if not vk and len(k) == 1:
                vk = win32api.VkKeyScan(k) & 0xFF
            
            if vk:
                win32api.PostMessage(target_hwnd, win32con.WM_KEYDOWN, vk, 1)
                
        time.sleep(0.05)
        
        for k in reversed(keys):
            k_lower = k.lower()
            vk = key_map.get(k_lower)
            if not vk and len(k) == 1:
                vk = win32api.VkKeyScan(k) & 0xFF
            
            if vk:
                win32api.PostMessage(target_hwnd, win32con.WM_KEYUP, vk, 0xC0000001)
                
        return True
    except Exception as e:
        print(f"Failed to inject keys into sandbox: {e}")
        return False
    finally:
        old_hdesk.SetThreadDesktop()

def export_and_launch_sandbox_results(room_name: str, fallback_text: str = ""):
    """
    Called upon sandbox task completion.
    Finds the main window in the sandbox, extracts its text (or uses fallback_text),
    saves it to the user's Desktop as 'IRIS_Output.txt',
    and launches Notepad on the user's primary interactive desktop so the result pops up.
    """
    extracted_text = ""
    old_hdesk = None
    try:
        old_hdesk = win32service.GetThreadDesktop(win32api.GetCurrentThreadId())
        if room_name in active_desktops:
            hdesk = active_desktops[room_name]
            hdesk.SetThreadDesktop()
            
            # 1. Look for edit controls / windows with text
            windows = []
            def enum_cb(hwnd, ctx):
                if win32gui.IsWindowVisible(hwnd):
                    title = win32gui.GetWindowText(hwnd)
                    if title.strip():
                        windows.append(hwnd)
                return True
                
            win32gui.EnumDesktopWindows(hdesk, enum_cb, None)
            
            for hwnd in windows:
                def enum_child(chwnd, ctx):
                    nonlocal extracted_text
                    class_name = win32gui.GetClassName(chwnd).lower()
                    if "edit" in class_name or "rich" in class_name or "document" in class_name or "text" in class_name or "content" in class_name:
                        length = win32gui.SendMessage(chwnd, win32con.WM_GETTEXTLENGTH, 0, 0)
                        if length > 0:
                            buffer = ctypes.create_unicode_buffer(length + 1)
                            win32gui.SendMessage(chwnd, win32con.WM_GETTEXT, length + 1, buffer)
                            if buffer.value:
                                extracted_text = buffer.value
                    return True
                try:
                    win32gui.EnumChildWindows(hwnd, enum_child, None)
                except Exception:
                    pass
                if extracted_text:
                    break
    except Exception as e:
        print(f"Error inspecting sandbox windows: {e}")
    finally:
        if old_hdesk:
            try:
                old_hdesk.SetThreadDesktop()
            except Exception:
                pass

    try:
        import os
        import subprocess
        desktop_path = os.path.join(os.path.expanduser("~"), "Desktop")
        output_file = os.path.join(desktop_path, "IRIS_Output.txt")
        
        final_content = extracted_text if extracted_text else (fallback_text if fallback_text else "Task completed by IRIS Sandbox.")
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(final_content)
                
        # Launch directly on user's primary interactive desktop!
        subprocess.Popen(f'notepad.exe "{output_file}"', shell=True)
        return True
    except Exception as e:
        print(f"Failed to export sandbox results: {e}")
        return False
